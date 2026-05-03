#!/usr/bin/env tsx
/**
 * Phase 1.3c: Reproduce silent skip on a single live sub.
 *
 * Calls `syncSubscriptionFromStripe` directly against a sub we know is
 * leaking (sub_1TSoAmDfH4PWyxxdcWKeWGT7), then reports the result and
 * whether a local Subscription row was created.
 *
 * If `result.skipped === true` here BUT we already saw the patient exists
 * with matching stripeCustomerId, that's the smoking gun for the bug location.
 *
 * If `result.success === true` and a row IS created → the production webhook
 * is doing something different from the local invocation (likely older deployed
 * code or a transient external API failure).
 *
 * NOTE: This DOES write to the DB if successful (it calls the same upsert path
 * the webhook would). That's intentional — we want to see if the code itself
 * works when invoked locally.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { syncSubscriptionFromStripe } from '../src/services/stripe/subscriptionSyncService';
import type Stripe from 'stripe';

const TARGET_SUB_ID = process.argv[2] ?? 'sub_1TSoAmDfH4PWyxxdcWKeWGT7';
const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

async function main() {
  console.log(`\n=== Phase 1.3c: Reproduce silent skip for ${TARGET_SUB_ID} ===\n`);

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, stripeAccountId: true },
  });
  if (!clinic) throw new Error('WellMedR clinic not found');

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) throw new Error('No Stripe Connect account');
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };

  // Pre-state: existing local row?
  const before = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findUnique({
      where: { stripeSubscriptionId: TARGET_SUB_ID },
      select: { id: true, status: true, patientId: true },
    }),
  );
  console.log(`PRE state local Subscription: ${JSON.stringify(before)}`);

  // Pull the sub fresh from Stripe (with same expansions used by the webhook handler)
  const sub = await stripeContext.stripe.subscriptions.retrieve(
    TARGET_SUB_ID,
    { expand: ['customer', 'items.data.price.product', 'latest_invoice'] },
    opts,
  );
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  console.log(`Stripe sub: id=${sub.id} status=${sub.status} customer=${customerId}\n`);

  // Reproduce what the webhook handler does
  console.log('Calling syncSubscriptionFromStripe inside runWithClinicContext(7, …)…');
  const result = await runWithClinicContext(clinic.id, () =>
    syncSubscriptionFromStripe(sub, 'reproduce-eventid', {
      clinicId: clinic.id,
      stripeAccountId: stripeContext.stripeAccountId,
    }),
  );
  console.log(`\nResult: ${JSON.stringify(result, null, 2)}`);

  // Post-state
  const after = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findUnique({
      where: { stripeSubscriptionId: TARGET_SUB_ID },
      select: { id: true, status: true, patientId: true, createdAt: true },
    }),
  );
  console.log(`\nPOST state local Subscription: ${JSON.stringify(after)}`);

  console.log('\n=== Done ===\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
