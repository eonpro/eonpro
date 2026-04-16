#!/usr/bin/env tsx
/**
 * Backfill Missing WellMedR Addon Invoices
 * =========================================
 *
 * Scans addon subscriptions on the WellMedR Stripe Connect account, fetches
 * their recent paid invoices, and creates local Invoice records for any that
 * are missing from the Rx queue.
 *
 * Unlike the cron (48h window), this script supports an arbitrary lookback.
 *
 * Usage:
 *   # Dry run — last 7 days (default)
 *   npx tsx scripts/backfill-missing-addon-invoices.ts
 *
 *   # 14-day lookback
 *   npx tsx scripts/backfill-missing-addon-invoices.ts --days 14
 *
 *   # Execute: actually create Invoice records
 *   npx tsx scripts/backfill-missing-addon-invoices.ts --days 14 --execute
 *
 * For production:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-missing-addon-invoices.ts --days 14 --execute
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { getAddonPlanByStripePriceId } from '../src/config/billingPlans';
import { computeEmailHash } from '../src/lib/security/phi-encryption';
import type Stripe from 'stripe';

const ADDON_PRICES: { priceId: string; addonKey: string; label: string }[] = [
  { priceId: 'price_1TEFKjDfH4PWyxxd4roD32Ae', addonKey: 'elite_bundle', label: 'Elite Bundle' },
  { priceId: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T', addonKey: 'nad_plus', label: 'NAD+' },
  { priceId: 'price_1TEFKJDfH4PWyxxdDZkq3vD5', addonKey: 'sermorelin', label: 'Sermorelin' },
  { priceId: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt', addonKey: 'b12', label: 'B12' },
];

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const daysIdx = args.indexOf('--days');
const lookbackDays = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 7;

async function main() {
  console.log('');
  console.log('=== Backfill Missing WellMedR Addon Invoices ===');
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY RUN'}`);
  console.log(`Lookback: ${lookbackDays} days`);
  console.log('');

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true, stripeAccountId: true },
  });

  if (!clinic?.stripeAccountId) throw new Error('WellMedR clinic not found or no stripeAccountId');
  console.log(`Clinic: ${clinic.name} (id=${clinic.id})`);

  const clinicId = clinic.id;
  const stripeContext = await getStripeForClinic(clinicId);
  const { stripe } = stripeContext;
  if (!stripeContext.stripeAccountId) throw new Error('No Connect account');
  const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };

  const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;

  let totalSubs = 0;
  let totalInvoicesChecked = 0;
  let totalCreated = 0;
  let totalSkippedExists = 0;
  let totalSkippedNoPatient = 0;
  let totalSkippedNoEmail = 0;
  let totalSkippedOld = 0;
  let totalErrors = 0;

  for (const addon of ADDON_PRICES) {
    const addonPlan = getAddonPlanByStripePriceId(addon.priceId);
    const addonName = addonPlan?.name || addon.label;
    const defaultAmountCents = addonPlan?.price || 0;

    console.log(`\n─── ${addon.label} (${addon.priceId}) ───`);

    // List ALL subscriptions for this addon price (any status to catch canceled ones too)
    const allSubs: Stripe.Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const page = await stripe.subscriptions.list(
        {
          price: addon.priceId,
          limit: 100,
          expand: ['data.customer'],
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        },
        connectOpts,
      );
      allSubs.push(...page.data);
      hasMore = page.has_more;
      if (page.data.length > 0) startingAfter = page.data[page.data.length - 1].id;
    }

    console.log(`  Found ${allSubs.length} subscriptions (all statuses)`);
    totalSubs += allSubs.length;

    for (const sub of allSubs) {
      const customer = sub.customer;
      const customerId = typeof customer === 'string' ? customer : customer?.id;
      const email =
        typeof customer !== 'string' && customer && 'email' in customer
          ? (customer as { email?: string | null }).email?.trim().toLowerCase() || null
          : null;

      if (!email) {
        totalSkippedNoEmail++;
        continue;
      }

      // Fetch paid invoices for this subscription within the lookback window
      let subInvoices: Stripe.Invoice[] = [];
      let invHasMore = true;
      let invStartingAfter: string | undefined;

      while (invHasMore) {
        const invPage = await stripe.invoices.list(
          {
            subscription: sub.id,
            status: 'paid',
            created: { gte: Math.floor(cutoffMs / 1000) },
            limit: 10,
            ...(invStartingAfter ? { starting_after: invStartingAfter } : {}),
          },
          connectOpts,
        );
        subInvoices.push(...invPage.data);
        invHasMore = invPage.has_more;
        if (invPage.data.length > 0) invStartingAfter = invPage.data[invPage.data.length - 1].id;
      }

      if (subInvoices.length === 0) {
        totalSkippedOld++;
        continue;
      }

      for (const inv of subInvoices) {
        totalInvoicesChecked++;
        const stripeInvoiceId = inv.id;
        const amountCents = inv.amount_paid || defaultAmountCents;
        const paidAt = inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : new Date(inv.created * 1000);

        try {
          const result = await runWithClinicContext(clinicId, async () => {
            // Check if local invoice already exists (by stripeInvoiceId OR subscription match)
            const existing = await prisma.invoice.findFirst({
              where: {
                OR: [
                  { stripeInvoiceId },
                  { metadata: { path: ['stripeInvoiceId'], equals: stripeInvoiceId } },
                  { metadata: { path: ['stripeSubscriptionId'], equals: sub.id }, clinicId },
                ],
              },
              select: { id: true },
            });
            if (existing) return { action: 'exists' as const, id: existing.id };

            // Find the patient
            const emailHash = computeEmailHash(email);
            let patient = customerId
              ? await prisma.patient.findFirst({
                  where: { stripeCustomerId: customerId },
                  select: { id: true, clinicId: true },
                })
              : null;

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

            if (!patient) return { action: 'no_patient' as const };

            if (!execute) return { action: 'would_create' as const, patientId: patient.id };

            const invoiceNumber = `WM-ADDON-BF2-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
            const created = await prisma.invoice.create({
              data: {
                patientId: patient.id,
                clinicId: patient.clinicId || clinicId,
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
                lineItems: [{
                  description: addonName,
                  quantity: 1,
                  unitPrice: amountCents,
                  product: addonName,
                  medicationType: 'add-on',
                  plan: '',
                }],
                metadata: {
                  invoiceNumber,
                  source: 'stripe-connect-addon-backfill',
                  stripeInvoiceId,
                  stripeSubscriptionId: sub.id,
                  stripeCustomerId: customerId || '',
                  product: addonName,
                  medicationType: 'add-on',
                  selectedAddons: [addon.addonKey],
                },
              },
            });
            return { action: 'created' as const, id: created.id, patientId: patient.id };
          });

          if (result.action === 'exists') {
            totalSkippedExists++;
          } else if (result.action === 'no_patient') {
            console.log(`  NO PATIENT: ${stripeInvoiceId} addon=${addon.addonKey} email=${email}`);
            totalSkippedNoPatient++;
          } else if (result.action === 'would_create') {
            console.log(`  WOULD CREATE: ${stripeInvoiceId} addon=${addon.addonKey} patient=${result.patientId} paid=${paidAt.toISOString().slice(0, 10)}`);
            totalCreated++;
          } else {
            console.log(`  CREATED: ${stripeInvoiceId} addon=${addon.addonKey} inv=${result.id} patient=${result.patientId} paid=${paidAt.toISOString().slice(0, 10)}`);
            totalCreated++;
          }
        } catch (err) {
          console.error(`  ERROR: ${stripeInvoiceId} — ${err instanceof Error ? err.message : String(err)}`);
          totalErrors++;
        }
      }
    }
  }

  console.log('');
  console.log('=== SUMMARY ===');
  console.log(`Subscriptions scanned:     ${totalSubs}`);
  console.log(`Invoices checked:          ${totalInvoicesChecked}`);
  console.log(`${execute ? 'Created' : 'Would create'}:              ${totalCreated}`);
  console.log(`Skipped (already exists):  ${totalSkippedExists}`);
  console.log(`Skipped (no patient):      ${totalSkippedNoPatient}`);
  console.log(`Skipped (no email):        ${totalSkippedNoEmail}`);
  console.log(`Skipped (no recent inv):   ${totalSkippedOld}`);
  console.log(`Errors:                    ${totalErrors}`);
  console.log('');

  if (!execute && totalCreated > 0) {
    console.log('Run with --execute to create the Invoice records.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
