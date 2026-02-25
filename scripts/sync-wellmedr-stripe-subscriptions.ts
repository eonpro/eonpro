#!/usr/bin/env tsx
/**
 * Wellmedr Stripe Subscriptions Sync (Match by Email)
 * ===================================================
 *
 * Pulls subscriptions from the Wellmedr Stripe account (active only by default),
 * matches each by customer email to patient profiles in the Wellmedr clinic, and
 * upserts Subscription records (plan name, vialCount, refillIntervalDays) and
 * links patient.stripeCustomerId when missing. Critical for refill queue correctness.
 *
 * Usage:
 *   # Dry run (default): list subscriptions and report match/unmatch counts only
 *   npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts
 *
 *   # Execute: create/update Subscription records and patient.stripeCustomerId
 *   npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute
 *
 *   # Sync ALL statuses (canceled, past_due, etc.) instead of active only
 *   npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --all [--execute]
 *
 * For production (load env first):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/sync-wellmedr-stripe-subscriptions.ts --execute
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
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

/** Get product name from first subscription item. Uses cached product map for resolved names. */
function getProductName(sub: Stripe.Subscription, productCache: Map<string, string>): string {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  const product = price?.product;
  if (typeof product === 'object' && product && 'name' in product) {
    return (product as Stripe.Product).name ?? '—';
  }
  if (typeof product === 'string' && productCache.has(product)) {
    return productCache.get(product)!;
  }
  return (sub.metadata?.planName as string) ?? '—';
}

/** Batch-resolve Stripe product IDs to names (cached). */
async function resolveProducts(
  stripe: Stripe,
  subs: Stripe.Subscription[],
  cache: Map<string, string>,
  opts?: Stripe.RequestOptions,
): Promise<void> {
  const ids = new Set<string>();
  for (const sub of subs) {
    const pid = sub.items?.data?.[0]?.price?.product;
    if (typeof pid === 'string' && !cache.has(pid)) ids.add(pid);
  }
  for (const id of ids) {
    try {
      const product = await stripe.products.retrieve(id, opts);
      cache.set(id, product.name ?? 'Subscription');
    } catch {
      cache.set(id, 'Subscription');
    }
  }
}

async function main() {
  const execute = process.argv.includes('--execute');
  const allStatuses = process.argv.includes('--all');
  const statusFilter: Stripe.SubscriptionListParams['status'] = allStatuses ? 'all' : 'active';

  if (!execute) {
    console.log('Dry run (no DB writes). Use --execute to create/update subscriptions.\n');
  }
  if (allStatuses) {
    console.log('Including all subscription statuses (not just active).\n');
  } else {
    console.log('Listing only ACTIVE subscriptions (use --all to include canceled/past_due).\n');
  }

  const clinicId = await getWellmedrClinicId();
  const stripeContext = await getStripeForClinic(clinicId);
  const { stripe } = stripeContext;

  if (!stripeContext.stripeAccountId) {
    throw new Error('Wellmedr clinic must have Stripe Connect linked (stripeAccountId).');
  }

  await runWithClinicContext(clinicId, async () => {
    const baseListParams: Stripe.SubscriptionListParams = {
      limit: 100,
      status: statusFilter,
      expand: ['data.customer'],
    };

    const productCache = new Map<string, string>();

    const requestOpts: Stripe.RequestOptions | undefined = stripeContext.stripeAccountId
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

    const sampleRows: { email: string; product: string; matched: boolean }[] = [];
    const SAMPLE_SIZE = 5;

    let startingAfter: string | undefined;

    do {
      const params: Stripe.SubscriptionListParams = {
        ...baseListParams,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      };

      const list = await stripe.subscriptions.list(params, requestOpts);
      stats.total += list.data.length;

      await resolveProducts(stripe, list.data, productCache, requestOpts);

      for (const sub of list.data) {
        const email = getCustomerEmail(sub);
        if (!email) {
          stats.skippedNoEmail++;
          continue;
        }

        const patient = await findPatientByEmail(email, clinicId);
        const matched = !!patient;
        if (!patient) {
          stats.skippedNoPatient++;
        } else {
          stats.matched++;
        }

        if (sampleRows.length < SAMPLE_SIZE) {
          sampleRows.push({ email, product: getProductName(sub, productCache), matched });
        }

        if (execute && patient) {
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

    console.log('\n--- Sample (first few) ---');
    sampleRows.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.email} | ${r.product} | ${r.matched ? '✓ match' : '✗ no patient'}`);
    });

    console.log('\n--- Summary ---');
    console.log(`Total Stripe subscriptions (${statusFilter}): ${stats.total}`);
    console.log(`Matched by email (patient found): ${stats.matched}`);
    console.log(`Skipped (no customer email): ${stats.skippedNoEmail}`);
    console.log(`Skipped (no patient for email): ${stats.skippedNoPatient}`);
    if (execute) {
      console.log(`Subscriptions created/updated: ${stats.synced}`);
      if (stats.errors) console.log(`Errors: ${stats.errors}`);
      const localCount = await prisma.subscription.count({
        where: { clinicId, stripeSubscriptionId: { not: null } },
      });
      console.log(`Wellmedr local subscriptions with stripeSubscriptionId: ${localCount}`);
    } else {
      console.log(`Would create/update ${stats.matched} subscriptions. Run with --execute to apply.`);
    }
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
