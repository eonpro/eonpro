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
 * Vercel Cron: every 10 minutes
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { prisma, runWithClinicContext } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import {
  isWellMedrAddonPriceId,
  getAddonPlanByStripePriceId,
} from '@/config/billingPlans';
import type Stripe from 'stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ADDON_PRICE_IDS = [
  { priceId: 'price_1TEFKjDfH4PWyxxd4roD32Ae', addonKey: 'elite_bundle' },
  { priceId: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T', addonKey: 'nad_plus' },
  { priceId: 'price_1TEFKJDfH4PWyxxdDZkq3vD5', addonKey: 'sermorelin' },
  { priceId: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt', addonKey: 'b12' },
];

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
      return NextResponse.json({ skipped: true, reason: 'No WellMedR clinic or no stripeAccountId' });
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

    for (const addon of ADDON_PRICE_IDS) {
      const addonPlan = getAddonPlanByStripePriceId(addon.priceId);
      const addonName = addonPlan?.name || 'Add-on';
      const amountCents = addonPlan?.price || 0;

      let startingAfter: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = await stripe.subscriptions.list({
          price: addon.priceId,
          status: 'active',
          limit: 100,
          expand: ['data.customer'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        }, connectOpts);

        for (const sub of page.data) {
          const customer = sub.customer;
          const customerId = typeof customer === 'string' ? customer : customer?.id;
          const email = (typeof customer !== 'string' && customer && 'email' in customer)
            ? (customer as { email?: string | null }).email?.trim().toLowerCase() || null
            : null;

          if (!email) { totalSkipped++; continue; }

          try {
            const result = await runWithClinicContext(clinicId, async () => {
              const existing = await prisma.invoice.findFirst({
                where: { metadata: { path: ['stripeSubscriptionId'], equals: sub.id } },
                select: { id: true },
              });
              if (existing) return 'exists';

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
              if (!patient) return 'no_patient';

              const patientClinicId = patient.clinicId || clinicId;
              const invoiceNumber = `WM-ADDON-CR-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

              await prisma.invoice.create({
                data: {
                  patientId: patient.id,
                  clinicId: patientClinicId,
                  stripeInvoiceId: null,
                  amount: amountCents,
                  amountDue: 0,
                  amountPaid: amountCents,
                  currency: 'usd',
                  status: 'PAID',
                  paidAt: new Date(sub.created * 1000),
                  description: `${addonName} - Payment received`,
                  dueDate: new Date(sub.created * 1000),
                  prescriptionProcessed: false,
                  lineItems: [{ description: addonName, quantity: 1, unitPrice: amountCents, product: addonName, medicationType: 'add-on', plan: '' }],
                  metadata: {
                    invoiceNumber,
                    source: 'stripe-connect-addon-cron',
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

            if (result === 'created') totalCreated++;
            else if (result === 'no_patient') totalNoPatient++;
            else totalSkipped++;
          } catch {
            totalSkipped++;
          }
        }

        hasMore = page.has_more;
        if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
      }
    }

    logger.info('[CRON] Addon invoice sync complete', { totalCreated, totalSkipped, totalNoPatient });

    return NextResponse.json({
      success: true,
      created: totalCreated,
      skipped: totalSkipped,
      noPatient: totalNoPatient,
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/cron/addon-invoice-sync' } });
  }
}
