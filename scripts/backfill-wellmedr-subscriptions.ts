#!/usr/bin/env tsx
/**
 * WellMedR Subscription Backfill (post-fix)
 * ==========================================
 *
 * Walks every Stripe subscription on the WellMedR Connect account, and for
 * each one that doesn't have a local Subscription row, calls
 * `syncSubscriptionFromStripe` — the same idempotent code path the webhook
 * + safety-net cron use, now with the metadata-email fallback chain.
 *
 * Per-page progress + per-sub outcome counters. Idempotent (upsert by
 * stripeSubscriptionId), so safe to re-run.
 *
 * Usage:
 *   # Dry run (no DB writes):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-wellmedr-subscriptions.ts
 *
 *   # Execute, ACTIVE subs only (default):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-wellmedr-subscriptions.ts --execute
 *
 *   # Execute for ALL statuses (canceled/past_due history):
 *   env $(grep -v '^#' .env.production.local | grep -v '^\s*$' | tr -d '\r' | xargs) \
 *     npx tsx scripts/backfill-wellmedr-subscriptions.ts --execute --all
 *
 *   # Limit to first N missing subs (smoke test):
 *   ... --execute --limit 50
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { prisma, runWithClinicContext } from '../src/lib/db';
import { getStripeForClinic } from '../src/lib/stripe/connect';
import { syncSubscriptionFromStripe } from '../src/services/stripe/subscriptionSyncService';
import type Stripe from 'stripe';

const WELLMEDR_CLINIC_SUBDOMAIN = 'wellmedr';

interface Args {
  execute: boolean;
  all: boolean;
  limit: number | null;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  return {
    execute: args.includes('--execute'),
    all: args.includes('--all'),
    limit: limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? '0', 10) || null : null,
  };
}

interface Counts {
  scanned: number;
  alreadyExists: number;
  reconciled: number;
  skippedNoPatient: number;
  errors: number;
  failedExamples: { id: string; reason?: string; error?: string }[];
}

async function main() {
  const args = parseArgs();
  console.log('\n=== WellMedR subscription backfill (post-fix) ===');
  console.log(
    `Mode: ${args.execute ? 'EXECUTE (writes)' : 'DRY-RUN (no writes)'}, status filter: ${args.all ? 'all' : 'active'}, limit: ${args.limit ?? 'none'}\n`,
  );

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: WELLMEDR_CLINIC_SUBDOMAIN, mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, name: true, stripeAccountId: true },
  });
  if (!clinic) throw new Error('WellMedR clinic not found');
  console.log(`WellMedR clinic: id=${clinic.id} stripeAccountId=${clinic.stripeAccountId}`);

  const stripeContext = await getStripeForClinic(clinic.id);
  if (!stripeContext.stripeAccountId) throw new Error('No Stripe Connect account');
  const opts: Stripe.RequestOptions = { stripeAccount: stripeContext.stripeAccountId };
  console.log(`Stripe Connect account: ${stripeContext.stripeAccountId}\n`);

  // 1) Cache all local stripeSubscriptionIds for this clinic upfront
  console.log('Loading local Subscription stripeSubscriptionIds…');
  const localRows = await runWithClinicContext(clinic.id, () =>
    prisma.subscription.findMany({
      where: { clinicId: clinic.id, stripeSubscriptionId: { not: null } },
      select: { stripeSubscriptionId: true },
    }),
  );
  const localSet = new Set(
    localRows.map((s) => s.stripeSubscriptionId).filter(Boolean) as string[],
  );
  console.log(`Local rows with stripeSubscriptionId: ${localSet.size}\n`);

  const counts: Counts = {
    scanned: 0,
    alreadyExists: 0,
    reconciled: 0,
    skippedNoPatient: 0,
    errors: 0,
    failedExamples: [],
  };

  let pageNum = 0;
  let startingAfter: string | undefined;
  let stop = false;

  console.log('Walking Stripe subscriptions…');
  while (!stop) {
    pageNum++;
    const t0 = Date.now();
    const list = await stripeContext.stripe.subscriptions.list(
      {
        status: args.all ? 'all' : 'active',
        limit: 100,
        expand: ['data.customer'],
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      opts,
    );
    const fetchMs = Date.now() - t0;

    let pageMissing = 0;
    let pageReconciled = 0;
    let pageSkipped = 0;
    let pageErrors = 0;

    for (const sub of list.data) {
      counts.scanned++;
      if (localSet.has(sub.id)) {
        counts.alreadyExists++;
        continue;
      }
      pageMissing++;

      if (args.limit !== null && counts.reconciled + counts.skippedNoPatient + counts.errors >= args.limit) {
        stop = true;
        break;
      }

      if (!args.execute) {
        // dry run: just count
        counts.skippedNoPatient++; // pretend nothing happens
        continue;
      }

      try {
        const result = await runWithClinicContext(clinic.id, () =>
          syncSubscriptionFromStripe(sub, `backfill-${sub.id}`, {
            clinicId: clinic.id,
            stripeAccountId: stripeContext.stripeAccountId,
          }),
        );
        if (result.success && result.subscriptionId && !result.skipped) {
          counts.reconciled++;
          pageReconciled++;
          // Track in local set so subsequent webhook events / reruns are fast
          localSet.add(sub.id);
        } else if (result.skipped) {
          counts.skippedNoPatient++;
          pageSkipped++;
          if (counts.failedExamples.length < 20) {
            counts.failedExamples.push({ id: sub.id, reason: result.reason });
          }
        } else {
          counts.errors++;
          pageErrors++;
          if (counts.failedExamples.length < 20) {
            counts.failedExamples.push({ id: sub.id, error: result.error });
          }
        }
      } catch (err) {
        counts.errors++;
        pageErrors++;
        if (counts.failedExamples.length < 20) {
          counts.failedExamples.push({
            id: sub.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    console.log(
      `  page ${pageNum}: ${list.data.length} subs in ${fetchMs}ms — missing=${pageMissing} reconciled=${pageReconciled} skipped=${pageSkipped} errors=${pageErrors}  totals: scanned=${counts.scanned} reconciled=${counts.reconciled} skipped=${counts.skippedNoPatient} errors=${counts.errors}`,
    );

    if (!list.has_more || list.data.length === 0) break;
    startingAfter = list.data[list.data.length - 1].id;

    if (counts.errors > 50) {
      console.warn('\nABORTING: more than 50 errors encountered. Re-check before continuing.');
      stop = true;
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Scanned:           ${counts.scanned}`);
  console.log(`Already existed:   ${counts.alreadyExists}`);
  if (args.execute) {
    console.log(`Reconciled:        ${counts.reconciled}`);
    console.log(`Skipped (no pt):   ${counts.skippedNoPatient}`);
    console.log(`Errors:            ${counts.errors}`);
  } else {
    console.log(`Would attempt to reconcile: ${counts.skippedNoPatient}`);
  }

  if (counts.failedExamples.length > 0) {
    console.log('\nSample failures (max 20):');
    for (const f of counts.failedExamples) {
      console.log(`  ${f.id}  reason="${f.reason ?? ''}" error="${f.error ?? ''}"`);
    }
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
