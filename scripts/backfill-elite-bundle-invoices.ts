#!/usr/bin/env tsx
/**
 * Backfill WellMedR Addon Invoices
 * =================================
 *
 * Creates local Invoice records for existing addon subscriptions on the
 * WellMedR Stripe Connect account that were never queued for Rx approval.
 *
 * Covers ALL addon products:
 *   - Elite+ Bundle ($199/mo) - NAD+, Sermorelin, B12
 *   - NAD+ Injection ($99/mo)
 *   - Sermorelin Injection ($99/mo)
 *   - B12 Injection ($69/mo)
 *
 * Usage:
 *   # Dry run (default): report what would be created without writing
 *   npx tsx scripts/backfill-elite-bundle-invoices.ts
 *
 *   # Execute: actually create Invoice records
 *   npx tsx scripts/backfill-elite-bundle-invoices.ts --execute
 *
 * For production (load env first):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-elite-bundle-invoices.ts --execute
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

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

const ADDON_PRICES: { priceId: string; addonKey: string; label: string }[] = [
  { priceId: 'price_1TEFKjDfH4PWyxxd4roD32Ae', addonKey: 'elite_bundle', label: 'Elite Bundle (NAD+, Sermorelin, B12)' },
  { priceId: 'price_1TEFJTDfH4PWyxxdJY3Ngi7T', addonKey: 'nad_plus', label: 'NAD+ Injection' },
  { priceId: 'price_1TEFKJDfH4PWyxxdDZkq3vD5', addonKey: 'sermorelin', label: 'Sermorelin Injection' },
  { priceId: 'price_1TEFJ8DfH4PWyxxdgUpek4Yt', addonKey: 'b12', label: 'B12 Injection' },
];

const execute = process.argv.includes('--execute');

async function getWellmedrClinicId(): Promise<number> {
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true, stripeAccountId: true },
  });
  if (!clinic) {
    throw new Error('Wellmedr clinic not found in database');
  }
  if (!clinic.stripeAccountId) {
    throw new Error('Wellmedr clinic has no stripeAccountId configured');
  }
  console.log(`Using clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
  return clinic.id;
}

function getCustomerEmail(sub: Stripe.Subscription): string | null {
  const customer = sub.customer;
  if (typeof customer === 'string') return null;
  if (!customer || !('email' in customer)) return null;
  const email = (customer as { email?: string | null }).email;
  return email?.trim().toLowerCase() || null;
}

async function main() {
  console.log('');
  console.log('=== Backfill WellMedR Addon Invoices ===');
  console.log(`Mode: ${execute ? 'EXECUTE (will write to DB)' : 'DRY RUN (read-only)'}`);
  console.log('');

  const clinicId = await getWellmedrClinicId();
  const stripeContext = await getStripeForClinic(clinicId);
  const { stripe } = stripeContext;

  if (!stripeContext.stripeAccountId) {
    throw new Error('Wellmedr clinic must have Stripe Connect linked (stripeAccountId)');
  }

  const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };

  let totalSubs = 0;
  let totalCreated = 0;
  let totalSkippedNoPatient = 0;
  let totalSkippedExists = 0;
  let totalErrors = 0;

  for (const addon of ADDON_PRICES) {
    const addonPlan = getAddonPlanByStripePriceId(addon.priceId);
    const addonName = addonPlan?.name || addon.label;
    const amountCents = addonPlan?.price || 0;

    console.log(`\n─── ${addon.label} (${addon.priceId}) ───`);

    const subs: Stripe.Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Stripe.SubscriptionListParams = {
        price: addon.priceId,
        status: 'active',
        limit: 100,
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      };
      const page = await stripe.subscriptions.list(params, connectOpts);
      subs.push(...page.data);
      hasMore = page.has_more;
      if (page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id;
      }
    }

    console.log(`  Found ${subs.length} active subscriptions`);
    totalSubs += subs.length;

    for (const sub of subs) {
      const email = getCustomerEmail(sub);
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

      if (!email) {
        console.log(`  SKIP (no email): sub=${sub.id} customer=${customerId}`);
        totalSkippedNoPatient++;
        continue;
      }

      try {
        const result = await runWithClinicContext(clinicId, async () => {
          const emailHash = computeEmailHash(email);
          let patient = await prisma.patient.findFirst({
            where: { stripeCustomerId: customerId },
            select: { id: true, clinicId: true, firstName: true, lastName: true },
          });

          if (!patient) {
            patient = await prisma.patient.findFirst({
              where: { searchIndex: { contains: email, mode: 'insensitive' }, clinicId },
              select: { id: true, clinicId: true, firstName: true, lastName: true },
              orderBy: { createdAt: 'desc' },
            });
          }

          if (!patient) {
            patient = await prisma.patient.findFirst({
              where: { email: { equals: email, mode: 'insensitive' }, clinicId },
              select: { id: true, clinicId: true, firstName: true, lastName: true },
              orderBy: { createdAt: 'desc' },
            });
          }

          // PHI email may be encrypted at rest; emailHash supports deterministic lookup.
          if (!patient && emailHash) {
            patient = await prisma.patient.findFirst({
              where: { emailHash, clinicId },
              select: { id: true, clinicId: true, firstName: true, lastName: true },
              orderBy: { createdAt: 'desc' },
            });
          }

          if (!patient) return { action: 'skip_no_patient' as const };

          const patientClinicId = patient.clinicId || clinicId;

          const existingInvoice = await prisma.invoice.findFirst({
            where: {
              patientId: patient.id,
              clinicId: patientClinicId,
              metadata: { path: ['stripeSubscriptionId'], equals: sub.id },
            },
          });

          if (existingInvoice) return { action: 'skip_exists' as const, invoiceId: existingInvoice.id };

          const invoiceNumber = `WM-ADDON-BF-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

          if (execute) {
            const inv = await prisma.invoice.create({
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
                  stripeSubscriptionId: sub.id,
                  stripeCustomerId: customerId || '',
                  product: addonName,
                  medicationType: 'add-on',
                  selectedAddons: [addon.addonKey],
                },
              },
            });
            return { action: 'created' as const, invoiceId: inv.id, patientId: patient.id };
          }
          return { action: 'would_create' as const, patientId: patient.id };
        });

        if (result.action === 'skip_no_patient') {
          console.log(`  SKIP (no patient): sub=${sub.id} email=${email}`);
          totalSkippedNoPatient++;
        } else if (result.action === 'skip_exists') {
          console.log(`  SKIP (exists): sub=${sub.id} email=${email} invoiceId=${result.invoiceId}`);
          totalSkippedExists++;
        } else if (result.action === 'created') {
          console.log(`  CREATED: sub=${sub.id} email=${email} invoiceId=${result.invoiceId}`);
          totalCreated++;
        } else {
          console.log(`  WOULD CREATE: sub=${sub.id} email=${email} patient=${result.patientId}`);
          totalCreated++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ERROR: sub=${sub.id} email=${email} — ${msg}`);
        totalErrors++;
      }
    }
  }

  console.log('');
  console.log('=== GRAND TOTAL ===');
  console.log(`Total subscriptions:  ${totalSubs}`);
  console.log(`${execute ? 'Created' : 'Would create'}:     ${totalCreated}`);
  console.log(`Skipped (no patient): ${totalSkippedNoPatient}`);
  console.log(`Skipped (exists):     ${totalSkippedExists}`);
  console.log(`Errors:               ${totalErrors}`);
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
