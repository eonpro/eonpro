#!/usr/bin/env npx tsx
/**
 * Fix Stripe Payment Methods After Merge
 * =======================================
 *
 * Migrates payment methods from old Stripe customer(s) to the patient's
 * current Stripe customer. Use after a patient merge left cards on the
 * wrong customer.
 *
 * Usage:
 *   npx tsx scripts/fix-stripe-payment-methods.ts EON-11654
 *
 * Set EONMEDS_STRIPE_SECRET_KEY (or STRIPE_SECRET_KEY) in .env
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = new PrismaClient();

const stripeKey =
  process.env.EONMEDS_STRIPE_SECRET_KEY ||
  process.env.STRIPE_SECRET_KEY ||
  process.env.STRIPE_API_KEY;

if (!stripeKey) {
  console.error('No Stripe secret key found. Set EONMEDS_STRIPE_SECRET_KEY.');
  process.exit(1);
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2026-01-28.clover' as Stripe.LatestApiVersion,
  typescript: true,
});

async function main() {
  const patientNumber = process.argv[2];
  if (!patientNumber) {
    console.error('Usage: npx tsx scripts/fix-stripe-payment-methods.ts <PATIENT_NUMBER>');
    console.error('  e.g. npx tsx scripts/fix-stripe-payment-methods.ts EON-11654');
    process.exit(1);
  }

  console.log(`\nLooking up patient ${patientNumber}...\n`);

  const patient = await prisma.patient.findFirst({
    where: { patientId: patientNumber },
    select: { id: true, patientId: true, stripeCustomerId: true, email: true, clinicId: true },
  });

  if (!patient) {
    console.error(`Patient ${patientNumber} not found`);
    process.exit(1);
  }

  if (!patient.stripeCustomerId) {
    console.error(`Patient ${patientNumber} has no stripeCustomerId`);
    process.exit(1);
  }

  console.log(`  DB id:             ${patient.id}`);
  console.log(`  Patient number:    ${patient.patientId}`);
  console.log(`  Current Stripe ID: ${patient.stripeCustomerId}`);
  console.log(`  Clinic ID:         ${patient.clinicId}`);

  // Find ALL Stripe customers with the same email
  const email = patient.email;
  let allCustomers: Stripe.Customer[] = [];
  if (email) {
    const result = await stripe.customers.list({ email, limit: 100 });
    allCustomers = result.data.filter(
      (c): c is Stripe.Customer => !('deleted' in c && c.deleted)
    );
  }

  // Also search by patient's current Stripe customer to make sure it's in the list
  if (!allCustomers.find((c) => c.id === patient.stripeCustomerId)) {
    try {
      const current = await stripe.customers.retrieve(patient.stripeCustomerId);
      if (!('deleted' in current && current.deleted)) {
        allCustomers.push(current as Stripe.Customer);
      }
    } catch {
      // customer may not exist
    }
  }

  console.log(`\nFound ${allCustomers.length} Stripe customer(s):`);
  for (const c of allCustomers) {
    const isCurrent = c.id === patient.stripeCustomerId ? ' ← CURRENT' : '';
    const pms = await stripe.paymentMethods.list({ customer: c.id, type: 'card' });
    console.log(`  ${c.id} (name: ${c.name || 'n/a'}, cards: ${pms.data.length})${isCurrent}`);
    for (const pm of pms.data) {
      console.log(`    - ${pm.id}  ${pm.card?.brand} •••• ${pm.card?.last4}  exp ${pm.card?.exp_month}/${pm.card?.exp_year}`);
    }
  }

  // Migrate cards from all non-current customers to the current one
  const otherCustomers = allCustomers.filter((c) => c.id !== patient.stripeCustomerId);
  let totalMigrated = 0;
  let totalFailed = 0;

  for (const oldCus of otherCustomers) {
    const pms = await stripe.paymentMethods.list({ customer: oldCus.id, type: 'card' });
    if (pms.data.length === 0) continue;

    console.log(`\nMigrating ${pms.data.length} card(s) from ${oldCus.id} → ${patient.stripeCustomerId}...`);

    for (const pm of pms.data) {
      try {
        await stripe.paymentMethods.detach(pm.id);
        await stripe.paymentMethods.attach(pm.id, { customer: patient.stripeCustomerId! });
        console.log(`  ✓ ${pm.id} (${pm.card?.brand} •••• ${pm.card?.last4})`);
        totalMigrated++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${pm.id} — ${msg}`);
        totalFailed++;
      }
    }
  }

  console.log(`\nDone. Migrated: ${totalMigrated}, Failed: ${totalFailed}\n`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
