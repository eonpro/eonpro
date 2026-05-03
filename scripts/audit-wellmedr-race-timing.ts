#!/usr/bin/env tsx
/**
 * Phase 1.3b: Race-condition diagnostic.
 *
 * For each missing sub from the resolution sampling, compare:
 *   - Stripe sub.created timestamp
 *   - Local patient.createdAt timestamp (matched by stripeCustomerId)
 *
 * If patient.createdAt > sub.created → race: Airtable created the patient AFTER
 * the Stripe subscription.created webhook fired, and the silent-skip happened
 * because the patient didn't exist yet.
 *
 * If patient.createdAt < sub.created → patient existed at event time → real bug
 * in syncSubscriptionFromStripe / findPatientByStripeCustomerId / clinic context.
 *
 * Also re-checks: the actual current local Subscription rows for these subs (in
 * case our cache from earlier audit is stale and Sarah's backfill or a later
 * webhook created some).
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import type Stripe from 'stripe';

// Sub IDs + Customer IDs + Patient IDs from Phase 1.3 sample
const SAMPLES = [
  { subId: 'sub_1TSoAmDfH4PWyxxdcWKeWGT7', custId: 'cus_URhZbLLIm35NxV', patientId: 149901 },
  { subId: 'sub_1TSo6sDfH4PWyxxd6UcbrDkC', custId: 'cus_URhV38WExqW9e0', patientId: 149893 },
  { subId: 'sub_1TSo3dDfH4PWyxxdcgT6eTo0', custId: 'cus_URhSlgzNJ7iM1Q', patientId: 149897 },
  { subId: 'sub_1TSntDDfH4PWyxxdjkjIQMxc', custId: 'cus_URhHHs1ZIFh1cn', patientId: 149462 },
  { subId: 'sub_1TSnR1DfH4PWyxxdkLlQEMJK', custId: 'cus_URgoKRFiuhP6ry', patientId: 149842 },
  { subId: 'sub_1TSnPkDfH4PWyxxdsdjczSSc', custId: 'cus_URgndUgH4YCFkJ', patientId: 149620 },
  { subId: 'sub_1TSnBXDfH4PWyxxdiW4eqpEn', custId: 'cus_URgYAwm11JEWJk', patientId: 149824 },
  { subId: 'sub_1TSmwrDfH4PWyxxdCNvp9zmD', custId: 'cus_URgJG3O5Hwt13D', patientId: 149720 },
  { subId: 'sub_1TSmpCDfH4PWyxxdIf6iZSo3', custId: 'cus_URgBelTkTz9jBz', patientId: 149793 },
  { subId: 'sub_1TSme6DfH4PWyxxd3gd5QBal', custId: 'cus_URg0FCiFl4EEF1', patientId: 149781 },
];

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

async function main() {
  console.log('\n=== Phase 1.3b: Race-condition / timing diagnostic ===\n');

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

  await runWithClinicContext(clinic.id, async () => {
  for (const s of SAMPLES) {
    const sub = await stripeContext.stripe.subscriptions.retrieve(s.subId, {}, opts);
    const subCreated = new Date(sub.created * 1000);

    const patient = await prisma.patient.findUnique({
      where: { id: s.patientId },
      select: { id: true, clinicId: true, stripeCustomerId: true, createdAt: true },
    });
    if (!patient) {
      console.log(`  ${s.subId}: patient ${s.patientId} not found`);
      continue;
    }

    const localSub = await prisma.subscription.findUnique({
      where: { stripeSubscriptionId: s.subId },
      select: { id: true, status: true, createdAt: true },
    });

    const subEarlier = subCreated.getTime() < patient.createdAt.getTime();
    const lagMs = patient.createdAt.getTime() - subCreated.getTime();

    console.log(`  ${s.subId}`);
    console.log(`    sub.created:                 ${subCreated.toISOString()}`);
    console.log(`    patient.createdAt:           ${patient.createdAt.toISOString()}`);
    console.log(`    patient.stripeCustomerId:    ${patient.stripeCustomerId ?? '(null)'}  (event cust=${s.custId})`);
    console.log(`    cust matches:                ${patient.stripeCustomerId === s.custId}`);
    console.log(`    patient.clinicId:            ${patient.clinicId}  (clinic=${clinic.id})`);
    console.log(`    timing:                      sub ${subEarlier ? 'BEFORE' : 'AFTER'} patient by ${Math.abs(lagMs / 1000).toFixed(1)}s`);
    console.log(`    local Subscription row:      ${localSub ? `id=${localSub.id} status=${localSub.status}` : '(none)'}`);
    console.log('');
  }
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
