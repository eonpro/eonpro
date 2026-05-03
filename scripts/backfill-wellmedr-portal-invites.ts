/**
 * Backfill: send patient portal invites for WellMedR patients who paid but
 * never received an invite.
 *
 * Context (2026-05-03 WellMedR portal-invite gap):
 *  Two parallel WellMedR webhook paths handle paid invoices — only one
 *  (`/api/wellmedr/webhooks/stripe` → `processStripePayment`) called
 *  `triggerPortalInviteOnPayment`. The Airtable-driven path
 *  (`/api/webhooks/wellmedr-invoice`) was the canonical "mark PAID" surface
 *  for most patients but never invoked the trigger. The Phase 1.1 fix wires
 *  the trigger into both paths going forward; this script catches up the
 *  affected backlog (paid Invoices with no User row and no unused
 *  PatientPortalInvite).
 *
 * Eligibility (per patient):
 *   - clinicId matches WellMedR (resolved by subdomain)
 *   - has at least one Invoice with status='PAID' in the window
 *   - has no User row (portal account not yet created)
 *   - has no PatientPortalInvite row with usedAt=null AND expiresAt > now
 *
 * Usage:
 *   npx tsx scripts/backfill-wellmedr-portal-invites.ts                # dry-run, last 90 days
 *   npx tsx scripts/backfill-wellmedr-portal-invites.ts --execute      # real run
 *   npx tsx scripts/backfill-wellmedr-portal-invites.ts --days=30      # narrower window
 *   npx tsx scripts/backfill-wellmedr-portal-invites.ts --limit=100    # cap batch size
 *   npx tsx scripts/backfill-wellmedr-portal-invites.ts --execute --batch-size=25
 *
 * Safety:
 *   - Dry-run by default. Operator MUST pass --execute to actually send.
 *   - The `triggerPortalInviteOnPayment` it calls is internally idempotent
 *     (re-running this script is safe; it re-skips patients who got an
 *     invite from another source between dry-run and execute).
 *   - Rate-limited via batch-size + per-batch sleep so we don't slam SES /
 *     Twilio quotas. Default 25 invites per batch with 1500ms gap.
 *   - Slack-alerts via alertWarning when execute mode finishes so the team
 *     sees the volume of recovered patients in the same channel that
 *     receives the live cron alerts.
 */

import { basePrisma as prisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { triggerPortalInviteOnPayment } from '../src/lib/portal-invite/service';
import { alertWarning } from '../src/lib/observability/slack-alerts';

interface CliFlags {
  dryRun: boolean;
  windowDays: number;
  limit: number | null;
  batchSize: number;
  batchSleepMs: number;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {
    dryRun: true,
    windowDays: 90,
    limit: null,
    batchSize: 25,
    batchSleepMs: 1500,
  };
  for (const arg of argv.slice(2)) {
    if (arg === '--execute' || arg === '-x') flags.dryRun = false;
    else if (arg.startsWith('--days=')) {
      const n = parseInt(arg.slice('--days='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.windowDays = n;
    } else if (arg.startsWith('--limit=')) {
      const n = parseInt(arg.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.limit = n;
    } else if (arg.startsWith('--batch-size=')) {
      const n = parseInt(arg.slice('--batch-size='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.batchSize = n;
    } else if (arg.startsWith('--batch-sleep-ms=')) {
      const n = parseInt(arg.slice('--batch-sleep-ms='.length), 10);
      if (Number.isFinite(n) && n >= 0) flags.batchSleepMs = n;
    }
  }
  return flags;
}

interface RunTotals {
  candidates: number;
  invitedSuccess: number;
  invitedSkipped: number; // service returned success=true but invite was idempotent skip
  failed: number;
  failureSamples: Array<{ patientId: number; reason: string }>;
}

async function resolveWellmedrClinicId(): Promise<number | null> {
  const clinic = await prisma.clinic.findFirst({
    where: {
      OR: [
        { subdomain: { contains: 'wellmedr', mode: 'insensitive' } },
        { name: { contains: 'Wellmedr', mode: 'insensitive' } },
      ],
    },
    select: { id: true, subdomain: true, name: true },
  });
  if (!clinic) return null;
  console.log(
    `Resolved WellMedR clinic: id=${clinic.id} subdomain=${clinic.subdomain} name="${clinic.name}"`
  );
  return clinic.id;
}

async function findCandidatePatientIds(
  clinicId: number,
  since: Date,
  limit: number | null
): Promise<number[]> {
  // Patients with a PAID invoice in the window, no User row, no unused unexpired invite.
  // Single SQL query is cleaner than three Prisma queries — but we use Prisma's
  // composable filters here for portability and to keep the script readable.
  const candidates = await prisma.patient.findMany({
    where: {
      clinicId,
      profileStatus: 'ACTIVE',
      user: null,
      invoices: {
        some: {
          status: 'PAID',
          paidAt: { gte: since },
        },
      },
      portalInvites: {
        none: {
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    ...(limit ? { take: limit } : {}),
  });
  return candidates.map((c) => c.id);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const since = new Date(Date.now() - flags.windowDays * 86_400_000);
  const startedAt = Date.now();

  console.log('=== WellMedR Portal Invite Backfill ===');
  console.log(`Mode:         ${flags.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Window:       last ${flags.windowDays} days (paidAt >= ${since.toISOString()})`);
  console.log(`Limit:        ${flags.limit ?? 'no cap'}`);
  console.log(`Batch size:   ${flags.batchSize} invites per batch`);
  console.log(`Batch sleep:  ${flags.batchSleepMs}ms between batches`);
  console.log('');

  const clinicId = await resolveWellmedrClinicId();
  if (!clinicId) {
    console.error('FATAL: WellMedR clinic not found. Aborting.');
    process.exit(1);
  }

  const candidatePatientIds = await findCandidatePatientIds(
    clinicId,
    since,
    flags.limit
  );
  console.log(`Found ${candidatePatientIds.length} candidate patient(s).`);

  const totals: RunTotals = {
    candidates: candidatePatientIds.length,
    invitedSuccess: 0,
    invitedSkipped: 0,
    failed: 0,
    failureSamples: [],
  };

  if (flags.dryRun) {
    console.log('');
    console.log('DRY-RUN: would invite the following patient ids (first 50 shown):');
    console.log(candidatePatientIds.slice(0, 50).join(', '));
    console.log('');
    console.log(`Total to invite if executed: ${totals.candidates}`);
    console.log(`Re-run with --execute to actually send invites.`);
    process.exit(0);
  }

  console.log('');
  console.log('EXECUTE mode — sending invites…');

  for (let i = 0; i < candidatePatientIds.length; i += flags.batchSize) {
    const batch = candidatePatientIds.slice(i, i + flags.batchSize);
    const batchNum = Math.floor(i / flags.batchSize) + 1;
    console.log(
      `Batch ${batchNum} (${batch.length} patient${batch.length === 1 ? '' : 's'})…`
    );

    // Sequential within a batch keeps SES/Twilio rate honest. Parallel would
    // be faster but risks 429s at scale.
    for (const patientId of batch) {
      try {
        // The trigger function is itself non-throwing (returns void) and
        // logs internally. We re-check via the DB whether the invite row
        // was created so the script can surface a real success count.
        const beforeCount = await prisma.patientPortalInvite.count({
          where: { patientId },
        });
        await triggerPortalInviteOnPayment(patientId);
        const afterCount = await prisma.patientPortalInvite.count({
          where: { patientId },
        });

        if (afterCount > beforeCount) {
          totals.invitedSuccess += 1;
        } else {
          totals.invitedSkipped += 1;
        }
      } catch (err) {
        totals.failed += 1;
        const reason = err instanceof Error ? err.message : 'Unknown';
        if (totals.failureSamples.length < 10) {
          totals.failureSamples.push({ patientId, reason });
        }
        logger.warn('[backfill-wellmedr-portal-invites] Invite failed', {
          patientId,
          error: reason,
        });
      }
    }

    if (i + flags.batchSize < candidatePatientIds.length && flags.batchSleepMs > 0) {
      await sleep(flags.batchSleepMs);
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log('');
  console.log('=== Backfill complete ===');
  console.log(`Candidates:   ${totals.candidates}`);
  console.log(`Invited:      ${totals.invitedSuccess}`);
  console.log(`Skipped:      ${totals.invitedSkipped} (idempotent — invite row already existed)`);
  console.log(`Failed:       ${totals.failed}`);
  console.log(`Duration:     ${(durationMs / 1000).toFixed(1)}s`);

  try {
    await alertWarning(
      'WellMedR portal-invite backfill complete',
      `Mode: EXECUTE. Candidates: ${totals.candidates}. Invited: ${totals.invitedSuccess}. Skipped (idempotent): ${totals.invitedSkipped}. Failed: ${totals.failed}.`,
      {
        clinicId,
        windowDays: flags.windowDays,
        durationMs,
        failureSamples: totals.failureSamples,
      }
    );
  } catch (alertErr) {
    console.warn(
      'Slack alert failed (non-fatal):',
      alertErr instanceof Error ? alertErr.message : 'Unknown'
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
