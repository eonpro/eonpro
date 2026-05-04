#!/usr/bin/env tsx
/**
 * Verify portal-invite coverage for WellMedR patients.
 *
 * Read-only. No DB writes, no Stripe writes, no SES/Twilio sends.
 *
 * Question this answers:
 *   "After the 2026-05-03 fix (PR #15), is every WellMedR patient who pays
 *    actually receiving a portal invite?"
 *
 * Method:
 *   1. Resolve WellMedR clinicId.
 *   2. Find every WellMedR patient with a PAID Invoice in the window
 *      (default: last 24h; use --since=YYYY-MM-DDTHH:MM:SSZ for custom).
 *   3. Bucket each patient:
 *        - 'has_user'                 — already has portal account (invite N/A)
 *        - 'invited_after_paid'       — got an invite at or after first paid
 *                                       invoice in the window (HAPPY PATH)
 *        - 'invited_before_only'      — has an invite, but it was issued BEFORE
 *                                       the first paid invoice in the window
 *                                       (means they're an existing patient who
 *                                       was already invited; not a regression)
 *        - 'no_invite'                — paid in window AND has no invite at all
 *                                       (REGRESSION — would have been silent
 *                                       failure before PR #15)
 *   4. Print bucket counts + sample patient ids per bucket. Print the trigger
 *      mix on the new invites (manual / first_payment / first_order) so we
 *      can see WHICH path is producing them.
 *
 * Usage:
 *   npx tsx scripts/verify-wellmedr-portal-invite-coverage.ts
 *   npx tsx scripts/verify-wellmedr-portal-invite-coverage.ts --hours=72
 *   npx tsx scripts/verify-wellmedr-portal-invite-coverage.ts --since=2026-05-03T00:00:00Z
 *   npx tsx scripts/verify-wellmedr-portal-invite-coverage.ts --json
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { basePrisma as prisma } from '../src/lib/db';

interface CliFlags {
  windowHours: number;
  since: Date | null;
  json: boolean;
  showSampleSize: number;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    windowHours: 24,
    since: null,
    json: false,
    showSampleSize: 25,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--json') flags.json = true;
    else if (arg.startsWith('--hours=')) {
      const n = parseInt(arg.slice('--hours='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.windowHours = n;
    } else if (arg.startsWith('--since=')) {
      const d = new Date(arg.slice('--since='.length));
      if (!Number.isNaN(d.getTime())) flags.since = d;
    } else if (arg.startsWith('--sample=')) {
      const n = parseInt(arg.slice('--sample='.length), 10);
      if (Number.isFinite(n) && n >= 0) flags.showSampleSize = n;
    }
  }
  return flags;
}

interface PatientBucket {
  patientId: number;
  firstPaidAt: Date;
  paidInvoiceCount: number;
  hasUser: boolean;
  invites: Array<{
    id: number;
    trigger: string;
    createdAt: Date;
    expiresAt: Date;
    usedAt: Date | null;
  }>;
}

type BucketName =
  | 'has_user'
  | 'invited_after_paid'
  | 'invited_before_only'
  | 'no_invite';

function classify(p: PatientBucket): BucketName {
  if (p.hasUser) return 'has_user';
  if (p.invites.length === 0) return 'no_invite';
  const anyAtOrAfter = p.invites.some(
    (inv) => inv.createdAt.getTime() >= p.firstPaidAt.getTime() - 60_000 // 1m grace for clock skew
  );
  return anyAtOrAfter ? 'invited_after_paid' : 'invited_before_only';
}

async function main() {
  const flags = parseFlags(process.argv);
  const since = flags.since ?? new Date(Date.now() - flags.windowHours * 3600 * 1000);
  const startedAt = Date.now();

  if (!flags.json) {
    console.log('=== WellMedR Portal Invite Coverage Verification ===');
    console.log(`Window: paidAt >= ${since.toISOString()}`);
    console.log('');
  }

  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, subdomain: true, name: true },
  });
  if (!clinic) {
    console.error('FATAL: WellMedR clinic not found.');
    process.exit(1);
  }
  if (!flags.json) {
    console.log(
      `Clinic: id=${clinic.id} subdomain=${clinic.subdomain} name="${clinic.name}"`
    );
    console.log('');
  }

  // Pull all WellMedR patients with at least one PAID invoice in the window.
  // Then load their invites (all-time — we want to know if they were invited
  // BEFORE the window too) and User row presence (portal account).
  const candidates = await prisma.patient.findMany({
    where: {
      clinicId: clinic.id,
      invoices: {
        some: {
          status: 'PAID',
          paidAt: { gte: since },
        },
      },
    },
    select: {
      id: true,
      user: { select: { id: true } },
      invoices: {
        where: { status: 'PAID', paidAt: { gte: since } },
        select: { id: true, paidAt: true },
        orderBy: { paidAt: 'asc' },
      },
      portalInvites: {
        select: {
          id: true,
          trigger: true,
          createdAt: true,
          expiresAt: true,
          usedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { id: 'asc' },
  });

  const buckets: Record<BucketName, PatientBucket[]> = {
    has_user: [],
    invited_after_paid: [],
    invited_before_only: [],
    no_invite: [],
  };

  const triggerMix: Record<string, number> = {};

  for (const c of candidates) {
    const firstPaid = c.invoices[0]?.paidAt;
    if (!firstPaid) continue; // shouldn't happen given the filter
    const p: PatientBucket = {
      patientId: c.id,
      firstPaidAt: firstPaid,
      paidInvoiceCount: c.invoices.length,
      hasUser: !!c.user,
      invites: c.portalInvites,
    };
    const bucket = classify(p);
    buckets[bucket].push(p);

    // Track the trigger of any invite created during/after the window
    for (const inv of c.portalInvites) {
      if (inv.createdAt.getTime() >= since.getTime() - 60_000) {
        triggerMix[inv.trigger] = (triggerMix[inv.trigger] ?? 0) + 1;
      }
    }
  }

  const totals = {
    candidates: candidates.length,
    has_user: buckets.has_user.length,
    invited_after_paid: buckets.invited_after_paid.length,
    invited_before_only: buckets.invited_before_only.length,
    no_invite: buckets.no_invite.length,
  };

  // Coverage = (has_user + invited_after_paid + invited_before_only) /
  //            (has_user + invited_after_paid + invited_before_only + no_invite)
  // Patients with portal access OR an invite that exists are "covered".
  const covered =
    totals.has_user + totals.invited_after_paid + totals.invited_before_only;
  const coveragePct =
    totals.candidates > 0 ? (covered / totals.candidates) * 100 : 100;

  // Coverage of patients who paid in this window AND need an invite to land
  // (excludes those who already have a User row). This is the metric that
  // PR #15 should drive to ~100% for new payers.
  const needingInvite = totals.candidates - totals.has_user;
  const newlyInvited = totals.invited_after_paid;
  const newPayerCoveragePct =
    needingInvite > 0 ? (newlyInvited / needingInvite) * 100 : 100;

  if (flags.json) {
    const sample = (b: PatientBucket[]) =>
      b.slice(0, flags.showSampleSize).map((p) => ({
        patientId: p.patientId,
        firstPaidAt: p.firstPaidAt.toISOString(),
        paidInvoices: p.paidInvoiceCount,
        invites: p.invites.length,
      }));
    console.log(
      JSON.stringify(
        {
          clinicId: clinic.id,
          windowSince: since.toISOString(),
          totals,
          coveragePct: Number(coveragePct.toFixed(2)),
          newPayerCoveragePct: Number(newPayerCoveragePct.toFixed(2)),
          triggerMix,
          samples: {
            no_invite: sample(buckets.no_invite),
            invited_after_paid: sample(buckets.invited_after_paid),
            invited_before_only: sample(buckets.invited_before_only),
            has_user: sample(buckets.has_user),
          },
          durationMs: Date.now() - startedAt,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Patients with paid invoice in window: ${totals.candidates}`);
  console.log('');
  console.log('Buckets:');
  console.log(`  has_user (already onboarded — invite N/A):    ${totals.has_user}`);
  console.log(
    `  invited_after_paid (HAPPY PATH — fix working):   ${totals.invited_after_paid}`
  );
  console.log(
    `  invited_before_only (was invited earlier):       ${totals.invited_before_only}`
  );
  console.log(
    `  no_invite (REGRESSION — paid but no invite):     ${totals.no_invite}`
  );
  console.log('');
  console.log(`Overall coverage:           ${coveragePct.toFixed(2)}%`);
  console.log(
    `New-payer invite coverage:  ${newPayerCoveragePct.toFixed(2)}%   (target: ≥99% post-PR#15)`
  );
  console.log('');
  console.log('Trigger mix on invites created in window:');
  for (const [trigger, count] of Object.entries(triggerMix).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${trigger.padEnd(20)} ${count}`);
  }

  if (totals.no_invite > 0) {
    console.log('');
    console.log(
      `⚠ ${totals.no_invite} patient(s) paid in window but have NO portal invite.`
    );
    console.log(
      `Sample patient ids (first ${Math.min(flags.showSampleSize, totals.no_invite)}):`
    );
    console.log(
      buckets.no_invite
        .slice(0, flags.showSampleSize)
        .map(
          (p) =>
            `  patientId=${p.patientId} firstPaidAt=${p.firstPaidAt.toISOString()} paidInvoices=${p.paidInvoiceCount}`
        )
        .join('\n')
    );
    console.log('');
    console.log(
      'Next step: run `npx tsx scripts/backfill-wellmedr-portal-invites.ts` (dry-run) to'
    );
    console.log(
      'see total backlog, then `--execute` off-hours to invite them.'
    );
  } else if (totals.candidates > 0) {
    console.log('');
    console.log('✓ Every WellMedR patient who paid in this window either has a');
    console.log('  portal account or has an invite outstanding. Fix is working.');
  } else {
    console.log('');
    console.log('No paid invoices in window — try a wider --hours= window.');
  }

  console.log('');
  console.log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
