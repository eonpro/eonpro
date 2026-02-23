#!/usr/bin/env tsx
/**
 * Wellmedr Stripe Subscriptions Sync (Match by Email)
 * ===================================================
 *
 * Pulls active subscriptions from the Wellmedr Stripe account, matches each
 * by customer email to patient profiles in the Wellmedr clinic, and upserts
 * Subscription records on those patients (and links stripeCustomerId when missing).
 *
 * Use when you have many Stripe subscriptions (e.g. 903 "Subscription creation"
 * transactions) that were never linked to patients in the platform.
 *
 * Usage:
 *   # Dry run (default): list subscriptions and report match/unmatch counts only
 *   npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts
 *
 *   # Execute: create/update Subscription records and patient.stripeCustomerId
 *   npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute
 *
 * For production (load env first):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma } from '../src/lib/db';
import { getStripeForClinic, withConnectedAccount } from '../src/lib/stripe/connect';
import { findPatientByEmail } from '../src/services/stripe/paymentMatchingService';
import { syncSubscriptionFromStripeByEmail } from '../src/services/stripe/subscriptionSyncService';
import type Stripe from 'stripe';

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

async function getWellmedrClinicId(): Promise<number> {
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, subdomain: true },
  });
  if (!clinic) {
    throw new Error('Wellmedr clinic not found in database');
  }
  console.log(`Using clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
  return clinic.id;
}

function getCustomerEmail(sub: Stripe.Subscription): string | null {
  const customer = sub.customer;
  if (typeof customer === 'string') return null;
  if (!customer || !('email' in customer)) return null;
  const email = (customer as { email?: string | null }).email;
  return email?.trim() || null;
}

async function main() {
  const execute = process.argv.includes('--execute');
  if (!execute) {
    console.log('Dry run (no DB writes). Use --execute to create/update subscriptions.\n');
  }

  const clinicId = await getWellmedrClinicId();
  const stripeContext = await getStripeForClinic(clinicId);
  const { stripe } = stripeContext;

  const listParams = withConnectedAccount(stripeContext, {
    limit: 100,
    status: 'all',
    expand: ['data.customer'],
  } as Stripe.SubscriptionListParams);

  const opts = stripeContext.stripeAccountId
    ? { stripeAccount: stripeContext.stripeAccountId }
    : undefined;

  const stats = {
    total: 0,
    matched: 0,
    synced: 0,
    skippedNoEmail: 0,
    skippedNoPatient: 0,
    errors: 0,
  };

  let startingAfter: string | undefined;

  do {
    const params: Stripe.SubscriptionListParams = {
      ...listParams,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    };

    const list = await stripe.subscriptions.list(params, opts);
    stats.total += list.data.length;

    for (const sub of list.data) {
      const email = getCustomerEmail(sub);
      if (!email) {
        stats.skippedNoEmail++;
        continue;
      }

      const patient = await findPatientByEmail(email, clinicId);
      if (!patient) {
        stats.skippedNoPatient++;
        continue;
      }

      stats.matched++;

      if (execute) {
        const result = await syncSubscriptionFromStripeByEmail(sub, email, clinicId);
        if (result.success && !result.skipped) stats.synced++;
        else if (!result.success) stats.errors++;
      }
    }

    if (list.data.length > 0) {
      startingAfter = list.data[list.data.length - 1].id;
    }
    if (!list.has_more) break;
  } while (true);

  console.log('\n--- Summary ---');
  console.log(`Total Stripe subscriptions: ${stats.total}`);
  console.log(`Matched by email (patient found): ${stats.matched}`);
  console.log(`Skipped (no customer email): ${stats.skippedNoEmail}`);
  console.log(`Skipped (no patient for email): ${stats.skippedNoPatient}`);
  if (execute) {
    console.log(`Subscriptions created/updated: ${stats.synced}`);
    if (stats.errors) console.log(`Errors: ${stats.errors}`);
  } else {
    console.log(`Would create/update ${stats.matched} subscriptions. Run with --execute to apply.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
