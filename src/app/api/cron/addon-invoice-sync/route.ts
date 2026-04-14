/**
 * Addon Invoice Sync Cron Job
 * ============================
 *
 * Finds active WellMedR addon subscriptions (Elite Bundle, NAD+, Sermorelin, B12)
 * on Stripe Connect and creates local Invoice records for any that are missing.
 * This ensures addon prescriptions appear in the provider Rx queue even when the
 * Stripe webhook fires before the patient record exists (Airtable timing gap).
 *
 * Idempotent: skips subscriptions that already have an Invoice by stripeSubscriptionId.
 *
 * Vercel Cron: every 3 hours
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { prisma, runWithClinicContext } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import { alertWarning } from '@/lib/observability/slack-alerts';
import { computeEmailHash } from '@/lib/security/phi-encryption';
import { isWellMedrAddonPriceId, getAddonPlanByStripePriceId } from '@/config/billingPlans';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDON_PRICE_IDS = [
  { priceId: 'price_1TEFKjDfH4PWyxxd4roD32Ae', addonKey: 'elite_bundle' },
  { priceId: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T', addonKey: 'nad_plus' },
  { priceId: 'price_1TEFKJDfH4PWyxxdDZkq3vD5', addonKey: 'sermorelin' },
  { priceId: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt', addonKey: 'b12' },
];

// Reconcile only recent paid sales to avoid generating stale historical queue items.
// This cron runs every 3 hours, so a 48h window provides ample retry margin
// for webhook timing gaps without replaying old subscription cycles.
const RECENT_SALE_WINDOW_MS = 48 * 60 * 60 * 1000;
const ALERT_SAMPLE_LIMIT = 10;

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const clinic = await prisma.clinic.findFirst({
      where: {
        OR: [
          { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
          { name: { contains: 'Wellmedr', mode: 'insensitive' } },
        ],
      },
      select: { id: true, stripeAccountId: true },
    });

    if (!clinic?.stripeAccountId) {
      return NextResponse.json({
        skipped: true,
        reason: 'No WellMedR clinic or no stripeAccountId',
      });
    }

    const { getStripeForClinic } = await import('@/lib/stripe/connect');
    const stripeContext = await getStripeForClinic(clinic.id);
    const { stripe } = stripeContext;

    if (!stripeContext.stripeAccountId) {
      return NextResponse.json({ skipped: true, reason: 'No Connect account' });
    }

    const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };
    const clinicId = clinic.id;

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalNoPatient = 0;
    let totalNoCustomerEmail = 0;
    const unmatchedSaleSamples: Array<{
      addonKey: string;
      stripeSubscriptionId: string;
      stripeInvoiceId: string;
      paidAt: string;
      reason: 'no_customer_email' | 'no_patient_match';
    }> = [];

    for (const addon of ADDON_PRICE_IDS) {
      const addonPlan = getAddonPlanByStripePriceId(addon.priceId);
      const addonName = addonPlan?.name || 'Add-on';
      const amountCents = addonPlan?.price || 0;

      let startingAfter: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = await stripe.subscriptions.list(
          {
            price: addon.priceId,
            status: 'active',
            limit: 100,
            expand: ['data.customer', 'data.latest_invoice'],
            ...(startingAfter ? { starting_after: startingAfter } : {}),
          },
          connectOpts
        );

        for (const sub of page.data) {
          const latestInvoiceRaw = sub.latest_invoice;
          if (!latestInvoiceRaw || typeof latestInvoiceRaw === 'string') {
            totalSkipped++;
            continue;
          }

          // This cron is a webhook fallback: only create queue items for paid invoices.
          // If latest invoice is open/draft/unpaid, there was no successful sale to queue.
          const latestInvoiceStatus = String(latestInvoiceRaw.status || '').toLowerCase();
          if (latestInvoiceStatus !== 'paid') {
            totalSkipped++;
            continue;
          }

          const paidAtEpochSeconds =
            latestInvoiceRaw.status_transitions?.paid_at ?? latestInvoiceRaw.created ?? null;
          if (!paidAtEpochSeconds) {
            totalSkipped++;
            continue;
          }

          const paidAt = new Date(paidAtEpochSeconds * 1000);
          const invoiceAgeMs = Date.now() - paidAt.getTime();
          if (!Number.isFinite(invoiceAgeMs) || invoiceAgeMs > RECENT_SALE_WINDOW_MS) {
            totalSkipped++;
            continue;
          }

          const stripeInvoiceId = latestInvoiceRaw.id;
          const customer = sub.customer;
          const customerId = typeof customer === 'string' ? customer : customer?.id;
          const email =
            typeof customer !== 'string' && customer && 'email' in customer
              ? (customer as { email?: string | null }).email?.trim().toLowerCase() || null
              : null;

          if (!email) {
            totalSkipped++;
            totalNoCustomerEmail++;
            if (unmatchedSaleSamples.length < ALERT_SAMPLE_LIMIT) {
              unmatchedSaleSamples.push({
                addonKey: addon.addonKey,
                stripeSubscriptionId: sub.id,
                stripeInvoiceId,
                paidAt: paidAt.toISOString(),
                reason: 'no_customer_email',
              });
            }
            continue;
          }

          try {
            const result = await runWithClinicContext(clinicId, async () => {
              const emailHash = computeEmailHash(email);
              const existing = await prisma.invoice.findFirst({
                where: {
                  metadata: { path: ['stripeInvoiceId'], equals: stripeInvoiceId },
                },
                select: { id: true },
              });
              if (existing) return 'exists';

              // Check if a main invoice already includes this addon in its
              // selectedAddons metadata to avoid creating a duplicate queue item.
              let patientForDedup = await prisma.patient.findFirst({
                where: { stripeCustomerId: customerId },
                select: { id: true, clinicId: true },
              });
              if (!patientForDedup && emailHash) {
                patientForDedup = await prisma.patient.findFirst({
                  where: { emailHash, clinicId },
                  select: { id: true, clinicId: true },
                  orderBy: { createdAt: 'desc' },
                });
              }
              if (patientForDedup) {
                const recentMainInvoice = await prisma.invoice.findFirst({
                  where: {
                    patientId: patientForDedup.id,
                    clinicId: patientForDedup.clinicId || clinicId,
                    prescriptionProcessed: false,
                    status: 'PAID',
                    createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
                    NOT: {
                      OR: [
                        { metadata: { path: ['source'], equals: 'stripe-connect-addon' } },
                        { metadata: { path: ['source'], equals: 'stripe-connect-addon-cron' } },
                      ],
                    },
                  },
                  select: { id: true, metadata: true },
                });
                if (recentMainInvoice) {
                  const mainMeta = recentMainInvoice.metadata as Record<string, unknown> | null;
                  const mainAddons = Array.isArray(mainMeta?.selectedAddons)
                    ? (mainMeta.selectedAddons as string[])
                    : [];
                  if (mainAddons.includes(addon.addonKey) || mainAddons.includes('elite_bundle')) {
                    logger.info('[ADDON-SYNC] Skipping — main invoice already covers this addon', {
                      patientId: patientForDedup.id,
                      mainInvoiceId: recentMainInvoice.id,
                      addonKey: addon.addonKey,
                      stripeInvoiceId,
                    });
                    return 'exists';
                  }
                }
              }

              let patient = await prisma.patient.findFirst({
                where: { stripeCustomerId: customerId },
                select: { id: true, clinicId: true },
              });
              if (!patient) {
                patient = await prisma.patient.findFirst({
                  where: { searchIndex: { contains: email, mode: 'insensitive' }, clinicId },
                  select: { id: true, clinicId: true },
                  orderBy: { createdAt: 'desc' },
                });
              }
              if (!patient && emailHash) {
                patient = await prisma.patient.findFirst({
                  where: { emailHash, clinicId },
                  select: { id: true, clinicId: true },
                  orderBy: { createdAt: 'desc' },
                });
              }
              if (!patient) return 'no_patient';

              const patientClinicId = patient.clinicId || clinicId;
              const invoiceNumber = `WM-ADDON-CR-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

              await prisma.invoice.create({
                data: {
                  patientId: patient.id,
                  clinicId: patientClinicId,
                  stripeInvoiceId,
                  amount: amountCents,
                  amountDue: 0,
                  amountPaid: amountCents,
                  currency: 'usd',
                  status: 'PAID',
                  paidAt,
                  description: `${addonName} - Payment received`,
                  dueDate: paidAt,
                  prescriptionProcessed: false,
                  lineItems: [
                    {
                      description: addonName,
                      quantity: 1,
                      unitPrice: amountCents,
                      product: addonName,
                      medicationType: 'add-on',
                      plan: '',
                    },
                  ],
                  metadata: {
                    invoiceNumber,
                    source: 'stripe-connect-addon-cron',
                    stripeInvoiceId,
                    stripeSubscriptionId: sub.id,
                    stripeCustomerId: customerId || '',
                    product: addonName,
                    medicationType: 'add-on',
                    selectedAddons: [addon.addonKey],
                  },
                },
              });
              return 'created';
            });

            if (result === 'created') {
              totalCreated++;
            } else if (result === 'no_patient') {
              totalNoPatient++;
              if (unmatchedSaleSamples.length < ALERT_SAMPLE_LIMIT) {
                unmatchedSaleSamples.push({
                  addonKey: addon.addonKey,
                  stripeSubscriptionId: sub.id,
                  stripeInvoiceId,
                  paidAt: paidAt.toISOString(),
                  reason: 'no_patient_match',
                });
              }
            } else {
              totalSkipped++;
            }
          } catch {
            totalSkipped++;
          }
        }

        hasMore = page.has_more;
        if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
      }
    }

    logger.info('[CRON] Addon invoice sync complete', {
      totalCreated,
      totalSkipped,
      totalNoPatient,
      totalNoCustomerEmail,
    });

    if (totalNoPatient > 0 || totalNoCustomerEmail > 0) {
      // Alert on paid sales that could not be queued, so ops can link/create patients.
      await alertWarning(
        '[CRON] Addon sales not queued',
        'Some paid addon sales could not be added to provider Rx queue because patient matching failed.',
        {
          totalNoPatient,
          totalNoCustomerEmail,
          sampledUnmatchedSales: JSON.stringify(unmatchedSaleSamples),
        }
      );
    }

    return NextResponse.json({
      success: true,
      created: totalCreated,
      skipped: totalSkipped,
      noPatient: totalNoPatient,
      noCustomerEmail: totalNoCustomerEmail,
      unmatchedSampleCount: unmatchedSaleSamples.length,
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/cron/addon-invoice-sync' } });
  }
}
