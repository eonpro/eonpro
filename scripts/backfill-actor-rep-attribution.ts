/**
 * Backfill: replay actor-tagged Payments through the sales-rep
 * commission service.
 *
 * Context (2026-05-03 OT rep attribution): the route handlers now stamp
 * `actorUserId` / `actorRole` on `Payment.metadata` and
 * `Invoice.metadata` at creation, and `processPaymentForSalesRepCommission`
 * applies the hybrid attribution policy (claim unassigned patients,
 * never overwrite, per-transaction attribution to actor). This script
 * replays the recent window (default 90 days) so historical actor-tagged
 * payments that the webhook commissioned without an actor in scope (or
 * skipped entirely because no patient assignment existed) get fixed up.
 *
 * Usage:
 *   npx tsx scripts/backfill-actor-rep-attribution.ts                # dry-run, last 90 days
 *   npx tsx scripts/backfill-actor-rep-attribution.ts --execute       # real run
 *   npx tsx scripts/backfill-actor-rep-attribution.ts --days=30       # narrower window
 *   npx tsx scripts/backfill-actor-rep-attribution.ts --clinic=42     # one clinic only
 *
 * NOT a recurring cron — purely a one-time fix for sales already in the
 * system. Future webhook-driven commissions will pick up the actor
 * automatically via `Payment.metadata.actorUserId` recovery in the
 * commission service.
 */

// Operator script: uses basePrisma (the unscoped client) because it
// filters by clinic via an explicit WHERE clause and runs outside any
// request / auth-middleware context. Same pattern as
// scripts/backfill-refund-payment-columns.ts — the tenant-context guard
// added later to `prisma` is correct for request handlers but blocks
// CLI-initiated batch operations.
import { basePrisma as prisma } from '../src/lib/db';
import { logger } from '../src/lib/logger';
import { processPaymentForSalesRepCommission } from '../src/services/sales-rep/salesRepCommissionService';
import { alertWarning } from '../src/lib/observability/slack-alerts';

interface CliFlags {
  dryRun: boolean;
  windowDays: number;
  clinicId: number | null;
}

function parseFlags(argv: string[]): CliFlags {
  const flags: CliFlags = { dryRun: true, windowDays: 90, clinicId: null };
  for (const arg of argv.slice(2)) {
    if (arg === '--execute' || arg === '-x') flags.dryRun = false;
    else if (arg.startsWith('--days=')) {
      const n = parseInt(arg.slice('--days='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.windowDays = n;
    } else if (arg.startsWith('--clinic=')) {
      const n = parseInt(arg.slice('--clinic='.length), 10);
      if (Number.isFinite(n) && n > 0) flags.clinicId = n;
    }
  }
  return flags;
}

interface ReplayPayment {
  id: number;
  patientId: number;
  amount: number;
  status: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
  invoiceId: number | null;
  patient: { clinicId: number } | null;
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv);
  const since = new Date(Date.now() - flags.windowDays * 86_400_000);
  const startedAt = Date.now();

  console.log('=== OT Actor Attribution Backfill ===');
  console.log(`Mode:        ${flags.dryRun ? 'DRY-RUN' : 'EXECUTE'}`);
  console.log(`Window:      last ${flags.windowDays} days (since ${since.toISOString()})`);
  console.log(`Clinic:      ${flags.clinicId ?? 'all'}`);
  console.log('');

  /**
   * Pull successful Payment rows in window with `metadata.actorUserId` set.
   * Prisma's JSON path filter targets the stamp the route handlers write.
   */
  const candidates = (await prisma.payment.findMany({
    where: {
      status: 'SUCCEEDED',
      createdAt: { gte: since },
      metadata: {
        path: ['actorUserId'],
        not: null,
      },
      ...(flags.clinicId
        ? { patient: { clinicId: flags.clinicId } }
        : {}),
    },
    select: {
      id: true,
      patientId: true,
      amount: true,
      status: true,
      stripePaymentIntentId: true,
      stripeChargeId: true,
      createdAt: true,
      metadata: true,
      invoiceId: true,
      patient: { select: { clinicId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })) as ReplayPayment[];

  console.log(`Candidate actor-tagged payments: ${candidates.length}\n`);

  let replayed = 0;
  let skippedAlreadyAttributed = 0;
  let skippedNoActor = 0;
  let skippedNoClinic = 0;
  let errors = 0;
  const errorSamples: Array<{ paymentId: number; error: string }> = [];

  for (const payment of candidates) {
    const md = (payment.metadata as Record<string, unknown> | null) ?? null;
    const actorUserIdRaw = md?.actorUserId;
    const actorRoleRaw = md?.actorRole;
    const actorUserId =
      typeof actorUserIdRaw === 'number'
        ? actorUserIdRaw
        : typeof actorUserIdRaw === 'string'
          ? parseInt(actorUserIdRaw, 10)
          : null;
    const actorRole = typeof actorRoleRaw === 'string' ? actorRoleRaw : null;

    if (actorUserId == null || !Number.isFinite(actorUserId) || actorUserId <= 0) {
      skippedNoActor += 1;
      continue;
    }
    if (!payment.patient) {
      skippedNoClinic += 1;
      continue;
    }

    const stripeObjectId = payment.stripePaymentIntentId ?? payment.stripeChargeId;
    const stripeEventId = stripeObjectId
      ? `actor-attrib-backfill_${stripeObjectId}`
      : `actor-attrib-backfill_payment_${payment.id}`;

    /**
     * Skip when this payment already has a SalesRepCommissionEvent (any rep) —
     * never replay over an existing ledger entry. The hybrid policy in the
     * commission service preserves existing patient assignments anyway, but
     * this avoids a no-op DB roundtrip per row.
     */
    const existing = await prisma.salesRepCommissionEvent.findFirst({
      where: {
        clinicId: payment.patient.clinicId,
        patientId: payment.patientId,
        eventAmountCents: payment.amount,
        occurredAt: {
          gte: new Date(payment.createdAt.getTime() - 120_000),
          lte: new Date(payment.createdAt.getTime() + 120_000),
        },
        status: { not: 'REVERSED' },
      },
      select: { id: true },
    });
    if (existing) {
      skippedAlreadyAttributed += 1;
      continue;
    }

    if (flags.dryRun) {
      replayed += 1;
      continue;
    }

    try {
      const result = await processPaymentForSalesRepCommission({
        clinicId: payment.patient.clinicId,
        patientId: payment.patientId,
        stripeEventId,
        stripeObjectId: stripeObjectId ?? `payment_${payment.id}`,
        stripeEventType: 'actor.attribution.backfill',
        amountCents: payment.amount,
        occurredAt: payment.createdAt,
        actorUserId,
        actorRole: actorRole ?? undefined,
      });
      if (result.success && !result.skipped) {
        replayed += 1;
      } else if (result.skipped) {
        skippedAlreadyAttributed += 1;
      } else {
        errors += 1;
        errorSamples.push({
          paymentId: payment.id,
          error: result.error ?? result.skipReason ?? 'unknown',
        });
      }
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      errorSamples.push({ paymentId: payment.id, error: msg });
      logger.error('[actor-attribution-backfill] replay failed', {
        paymentId: payment.id,
        error: msg,
      });
    }
  }

  const durationMs = Date.now() - startedAt;

  console.log('--- Summary ---');
  console.log(`Replayed:                    ${replayed}`);
  console.log(`Skipped (already attributed):${skippedAlreadyAttributed}`);
  console.log(`Skipped (no actor):          ${skippedNoActor}`);
  console.log(`Skipped (orphan patient):    ${skippedNoClinic}`);
  console.log(`Errors:                      ${errors}`);
  console.log(`Duration:                    ${(durationMs / 1000).toFixed(1)}s`);
  if (errorSamples.length > 0) {
    console.log('\nFirst 5 error samples:');
    for (const s of errorSamples.slice(0, 5)) {
      console.log(`  payment ${s.paymentId}: ${s.error}`);
    }
  }

  /**
   * Slack-alert the operator after a real (non-dry-run) execution.
   * Mirrors the wellmedr-subscription-sync cron pattern so on-call has
   * a single channel for backfill events.
   */
  if (!flags.dryRun) {
    try {
      const description =
        errors > 0
          ? `Replay completed with ${errors} errors — see operator logs.`
          : `Replay completed: ${replayed} attributed, ${skippedAlreadyAttributed} already attributed.`;
      await alertWarning('actor-attribution-backfill', description, {
        replayed,
        skippedAlreadyAttributed,
        skippedNoActor,
        skippedNoClinic,
        errors,
        windowDays: flags.windowDays,
        clinicId: flags.clinicId ?? 'all',
        durationMs,
      });
    } catch (e) {
      logger.warn('[actor-attribution-backfill] Slack alert failed', {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

main()
  .catch((err) => {
    console.error('Fatal:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
