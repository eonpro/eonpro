#!/usr/bin/env tsx
/**
 * Backfill Elite+ Bundle Addon Invoices
 * ======================================
 *
 * Creates local Invoice records for existing Elite+ Bundle subscriptions on the
 * WellMedR Stripe Connect account that were never queued for Rx approval.
 *
 * These subscriptions charge $199/month for NAD+, Sermorelin, and B12 but have no
 * corresponding Invoice in the platform DB, making them invisible to the provider
 * Rx queue. This script finds all such subscriptions, matches them to patients,
 * and creates paid Invoice records so providers can write prescriptions.
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
import type Stripe from 'stripe';

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';
const ELITE_BUNDLE_PRICE_ID = 'price_1TEFKjDfH4PWyxxd4roD32Ae';

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
  console.log('=== Backfill Elite+ Bundle Addon Invoices ===');
  console.log(`Mode: ${execute ? 'EXECUTE (will write to DB)' : 'DRY RUN (read-only)'}`);
  console.log('');

  const clinicId = await getWellmedrClinicId();
  const stripeContext = await getStripeForClinic(clinicId);
  const { stripe } = stripeContext;

  if (!stripeContext.stripeAccountId) {
    throw new Error('Wellmedr clinic must have Stripe Connect linked (stripeAccountId)');
  }

  const connectOpts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };
  const addonPlan = getAddonPlanByStripePriceId(ELITE_BUNDLE_PRICE_ID);
  const addonName = addonPlan?.name || 'Elite Bundle (NAD+, Sermorelin, B12)';

  console.log(`Searching for active subscriptions with price: ${ELITE_BUNDLE_PRICE_ID}`);
  console.log(`Addon: ${addonName}`);
  console.log('');

  const allSubs: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: Stripe.SubscriptionListParams = {
      price: ELITE_BUNDLE_PRICE_ID,
      status: 'active',
      limit: 100,
      expand: ['data.customer'],
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };
    const page = await stripe.subscriptions.list(params, connectOpts);
    allSubs.push(...page.data);
    hasMore = page.has_more;
    if (page.data.length > 0) {
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  console.log(`Found ${allSubs.length} active Elite+ Bundle subscriptions`);
  console.log('');

  let created = 0;
  let skippedNoPatient = 0;
  let skippedAlreadyExists = 0;
  let errors = 0;

  for (const sub of allSubs) {
    const email = getCustomerEmail(sub);
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

    if (!email) {
      console.log(`  SKIP (no email): sub=${sub.id} customer=${customerId}`);
      skippedNoPatient++;
      continue;
    }

    try {
      const result = await runWithClinicContext(clinicId, async () => {
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

        if (!patient) return { action: 'skip_no_patient' as const };

        const patientClinicId = patient.clinicId || clinicId;

        const existingInvoice = await prisma.invoice.findFirst({
          where: {
            patientId: patient.id,
            clinicId: patientClinicId,
            OR: [
              { metadata: { path: ['stripeSubscriptionId'], equals: sub.id } },
              { metadata: { path: ['source'], equals: 'stripe-connect-addon-backfill' } },
            ],
            description: { contains: 'Elite' },
          },
        });

        if (existingInvoice) return { action: 'skip_exists' as const, invoiceId: existingInvoice.id };

        const amountCents = addonPlan?.price || 19900;
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
                selectedAddons: ['elite_bundle'],
              },
            },
          });
          return { action: 'created' as const, invoiceId: inv.id, patientId: patient.id };
        }
        return { action: 'would_create' as const, patientId: patient.id };
      });

      if (result.action === 'skip_no_patient') {
        console.log(`  SKIP (no patient): sub=${sub.id} email=${email}`);
        skippedNoPatient++;
      } else if (result.action === 'skip_exists') {
        console.log(`  SKIP (exists): sub=${sub.id} email=${email} invoiceId=${result.invoiceId}`);
        skippedAlreadyExists++;
      } else if (result.action === 'created') {
        console.log(`  CREATED: sub=${sub.id} email=${email} invoiceId=${result.invoiceId}`);
        created++;
      } else {
        console.log(`  WOULD CREATE: sub=${sub.id} email=${email} patient=${result.patientId}`);
        created++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: sub=${sub.id} email=${email} — ${msg}`);
      errors++;
    }
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`Total subscriptions:  ${allSubs.length}`);
  console.log(`${execute ? 'Created' : 'Would create'}:     ${created}`);
  console.log(`Skipped (no patient): ${skippedNoPatient}`);
  console.log(`Skipped (exists):     ${skippedAlreadyExists}`);
  console.log(`Errors:               ${errors}`);
  console.log('');

  if (!execute && created > 0) {
    console.log('Run with --execute to create the Invoice records.');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
