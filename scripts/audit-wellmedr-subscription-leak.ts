#!/usr/bin/env tsx
/**
 * Fast WellMedR subscription leak audit.
 *
 * Read-only. No Stripe writes, no DB writes.
 *
 * 1. Pull all ACTIVE Stripe subscriptions from the WellMedR Connect account
 *    (IDs + customer email + product name only, no per-sub DB lookup).
 * 2. Pull all local Subscription.stripeSubscriptionId for clinicId=WellMedR.
 * 3. Diff: count and list (sample) the Stripe-active subs that have no
 *    matching local Subscription row — these are patients currently being
 *    auto-billed but invisible in our DB / patient portal.
 *
 * Logs per-page progress so we can see liveness.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import type Stripe from 'stripe';

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

async function main() {
  console.log('\n=== WellMedR subscription-leak audit (read-only) ===\n');

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
  console.log(`Clinic: id=${clinic.id} name="${clinic.name}" subdomain=${clinic.subdomain}\n`);

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) {
    throw new Error('WellMedR clinic missing Stripe Connect account');
  }
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };
  console.log(`Stripe Connect account: ${stripeContext.stripeAccountId}\n`);

  // 1. All local stripeSubscriptionIds for WellMedR
  console.log('Loading local Subscription stripeSubscriptionIds…');
  const localRows = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findMany({
      where: { clinicId: clinic.id, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true, status: true },
    }),
  );
  const localById = new Map<string, string>();
  for (const row of localRows) {
    if (row.stripeSubscriptionId) localById.set(row.stripeSubscriptionId, row.status);
  }
  console.log(`Local rows with stripeSubscriptionId: ${localById.size}`);
  const localStatusCounts = localRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  by status: ${JSON.stringify(localStatusCounts)}\n`);

  // 2. Walk all ACTIVE Stripe subs; print per-page progress
  console.log('Walking ACTIVE Stripe subscriptions on WellMedR Connect account…');

  let totalStripe = 0;
  let pageNum = 0;
  let startingAfter: string | undefined;

  // Track only what we need
  const stripeActiveIds: string[] = [];
  const missingFromLocal: Array<{
    id: string;
    customerEmail: string | null;
    customerId: string;
    amountCents: number | null;
    intervalCount: number | null;
    interval: string | null;
    created: string;
  }> = [];

  do {
    pageNum++;
    const t0 = Date.now();
    const list = await stripeContext.stripe.subscriptions.list(
      {
        limit: 100,
        status: 'active',
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      opts,
    );
    const tMs = Date.now() - t0;
    totalStripe += list.data.length;

    let pageMissing = 0;
    for (const sub of list.data) {
      stripeActiveIds.push(sub.id);
      if (!localById.has(sub.id)) {
        pageMissing++;
        const customer = sub.customer;
        const customerEmail =
          typeof customer === 'object' && customer && 'email' in customer
            ? (customer as Stripe.Customer).email ?? null
            : null;
        const customerId = typeof customer === 'string' ? customer : customer?.id ?? '';
        const item = sub.items?.data?.[0];
        missingFromLocal.push({
          id: sub.id,
          customerEmail,
          customerId,
          amountCents: item?.price?.unit_amount ?? null,
          intervalCount: item?.price?.recurring?.interval_count ?? null,
          interval: item?.price?.recurring?.interval ?? null,
          created: new Date(sub.created * 1000).toISOString(),
        });
      }
    }

    console.log(
      `  page ${pageNum}: fetched ${list.data.length} subs in ${tMs}ms, ${pageMissing} missing locally (running totals: stripe=${totalStripe} missing=${missingFromLocal.length})`,
    );

    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1].id;
  } while (true);

  console.log('\n--- Summary ---');
  console.log(`Active Stripe subscriptions (WellMedR):       ${totalStripe}`);
  console.log(`Local Subscription rows with stripeSubId:     ${localById.size}`);
  console.log(`ACTIVE Stripe subs WITH NO local row:         ${missingFromLocal.length}`);
  console.log(`ACTIVE Stripe subs that DO match locally:     ${totalStripe - missingFromLocal.length}`);

  // For matched-locally, break down by local status (so we can spot e.g. Stripe=active but local=CANCELED)
  const matchedStatusCounts: Record<string, number> = {};
  for (const id of stripeActiveIds) {
    const localStatus = localById.get(id);
    if (localStatus) matchedStatusCounts[localStatus] = (matchedStatusCounts[localStatus] ?? 0) + 1;
  }
  console.log(`\nMatched-locally rows by LOCAL status (Stripe says active for all of these):`);
  for (const [s, n] of Object.entries(matchedStatusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s}: ${n}`);
  }

  // Sample the leak so we can see what kind of patients are affected
  if (missingFromLocal.length > 0) {
    console.log(`\nFirst 10 ACTIVE Stripe subs with NO local row:`);
    for (const row of missingFromLocal.slice(0, 10)) {
      console.log(
        `  - ${row.id}  cust=${row.customerId}  email=${row.customerEmail ?? '(none)'}  $${((row.amountCents ?? 0) / 100).toFixed(2)} every ${row.intervalCount ?? '?'}/${row.interval ?? '?'}  created=${row.created}`,
      );
    }
    if (missingFromLocal.length > 10) {
      console.log(`  …and ${missingFromLocal.length - 10} more.`);
    }
  }

  console.log('\n(no writes performed)\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
