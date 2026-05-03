#!/usr/bin/env tsx
/**
 * Targeted backfill for ONE Stripe subscription — Sarah Clark.
 *
 * Pulls sub_1THVE7DfH4PWyxxdZrTYr0K6 (canceled) from the WellMedR Connect
 * account and runs it through syncSubscriptionFromStripe so the local
 * Subscription table gains the row that should have existed all along.
 *
 * After this runs:
 *   - patient.id=104174 will have 1 Subscription row with status=CANCELED
 *   - linked to stripeSubscriptionId=sub_1THVE7DfH4PWyxxdZrTYr0K6
 *   - canceledAt/endedAt populated from Stripe
 *
 * No Stripe writes. Single local upsert by stripeSubscriptionId (idempotent).
 *
 * Usage:
 *   # Dry run (default):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-sarah-clark-subscription.ts
 *
 *   # Execute:
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-sarah-clark-subscription.ts --execute
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { syncSubscriptionFromStripe } from '../src/services/stripe/subscriptionSyncService';
import type Stripe from 'stripe';

const STRIPE_SUB_ID = 'sub_1THVE7DfH4PWyxxdZrTYr0K6';
const PATIENT_ID = 104174;
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

async function main() {
  const execute = process.argv.includes('--execute');
  console.log(`\n=== Backfill Subscription row for ${STRIPE_SUB_ID} (Sarah Clark, patient=${PATIENT_ID}) ===`);
  console.log(execute ? 'MODE: EXECUTE (will write 1 Subscription row)' : 'MODE: DRY-RUN (no writes)');
  console.log('');

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });
  if (!clinic) throw new Error('WellMedR clinic not found');
  console.log(`Clinic: id=${clinic.id} subdomain=${clinic.subdomain}`);

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) {
    throw new Error('WellMedR clinic missing Stripe Connect account');
  }
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };
  console.log(`Stripe Connect account: ${stripeContext.stripeAccountId}`);

  // Fetch the sub from Stripe (with full expansions used by syncSubscriptionFromStripe)
  const sub = await stripeContext.stripe.subscriptions.retrieve(
    STRIPE_SUB_ID,
    {
      expand: [
        'customer',
        'items.data.price.product',
        'latest_invoice',
      ],
    },
    opts,
  );

  console.log('\nSTRIPE SUBSCRIPTION SNAPSHOT');
  console.log(`  id:              ${sub.id}`);
  console.log(`  status:          ${sub.status}`);
  console.log(`  customer:        ${typeof sub.customer === 'string' ? sub.customer : sub.customer?.id}`);
  console.log(`  start_date:      ${sub.start_date ? new Date(sub.start_date * 1000).toISOString() : '(null)'}`);
  console.log(`  canceled_at:     ${sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : '(null)'}`);
  console.log(`  ended_at:        ${sub.ended_at ? new Date(sub.ended_at * 1000).toISOString() : '(null)'}`);

  // Show what already exists locally for this stripeSubscriptionId
  const existing = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findUnique({
      where: { stripeSubscriptionId: STRIPE_SUB_ID },
      select: { id: true, patientId: true, status: true, createdAt: true },
    }),
  );
  console.log(
    `\nEXISTING local Subscription row for stripeSubscriptionId: ${existing ? JSON.stringify(existing) : '(none)'}`,
  );

  if (!execute) {
    console.log('\nDRY-RUN: would call syncSubscriptionFromStripe(stripeSub, undefined, { clinicId, stripeAccountId }).');
    console.log('Re-run with --execute to perform the upsert.');
    return;
  }

  console.log('\nCalling syncSubscriptionFromStripe…');
  const result = await runWithClinicContext(clinic.id, () =>
    syncSubscriptionFromStripe(sub, undefined, {
      clinicId: clinic.id,
      stripeAccountId: stripeContext.stripeAccountId,
    }),
  );
  console.log(`Result: ${JSON.stringify(result)}`);

  // Verify the row
  const after = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findUnique({
      where: { stripeSubscriptionId: STRIPE_SUB_ID },
      select: {
        id: true,
        patientId: true,
        clinicId: true,
        status: true,
        planName: true,
        amount: true,
        interval: true,
        intervalCount: true,
        startDate: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        canceledAt: true,
        endedAt: true,
        stripeSubscriptionId: true,
      },
    }),
  );
  console.log('\nAFTER backfill, local Subscription row:');
  console.log(JSON.stringify(after, null, 2));

  if (after && after.patientId !== PATIENT_ID) {
    console.warn(
      `\nWARNING: backfilled row's patientId (${after.patientId}) does not match expected (${PATIENT_ID}).`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
