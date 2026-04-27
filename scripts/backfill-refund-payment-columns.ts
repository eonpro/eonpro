#!/usr/bin/env tsx
/**
 * Backfill `Payment.refundedAmount` and `Payment.refundedAt` columns from
 * `Payment.metadata.refund.{amount,refundedAt}`.
 *
 * Why:
 * Before commit "fix(stripe): persist refundedAmount/refundedAt columns from
 * charge.refunded webhook", `handleStripeRefund()` only stamped refund details
 * into `Payment.metadata.refund` and left the columns null. Every revenue /
 * reconciliation report computes net cash via
 *   `max(0, amount - refundedAmount)`,
 * so any historical refund initiated from the Stripe Dashboard was silently
 * counted at full gross. This script repairs the historical data.
 *
 * Safe defaults:
 * - Dry-run by default; pass `--execute` to write
 * - Only touches rows where status ∈ {REFUNDED, PARTIALLY_REFUNDED} AND
 *   `refundedAmount IS NULL` AND `metadata.refund.amount` is a positive int
 * - Caps the refund amount at the Payment.amount (defensive — should already
 *   match, but Stripe occasionally rounds cumulative amounts)
 *
 * Usage:
 *   # Preview every clinic
 *   npx tsx scripts/backfill-refund-payment-columns.ts
 *
 *   # Preview only OT
 *   npx tsx scripts/backfill-refund-payment-columns.ts --subdomain=ot
 *
 *   # Execute for OT
 *   npx tsx scripts/backfill-refund-payment-columns.ts --subdomain=ot --execute
 *
 *   # Restrict to a date window (paidAt or createdAt) — useful for spot fixes
 *   npx tsx scripts/backfill-refund-payment-columns.ts --since=2026-04-13 --until=2026-04-19 --execute
 */

import * as dotenv from 'dotenv';
import { prisma } from '../src/lib/db';

dotenv.config({ path: '.env.production.local' });
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface ScriptOptions {
  execute: boolean;
  clinicId?: number;
  subdomain?: string;
  since?: Date;
  until?: Date;
  limit: number;
  help: boolean;
}

function parseArgs(argv: string[]): ScriptOptions {
  const args = new Map<string, string | true>();
  for (const arg of argv) {
    if (arg === '--execute') args.set('execute', true);
    else if (arg === '--help' || arg === '-h') args.set('help', true);
    else if (arg.startsWith('--clinicId=')) args.set('clinicId', arg.split('=')[1]);
    else if (arg.startsWith('--subdomain=')) args.set('subdomain', arg.split('=')[1]);
    else if (arg.startsWith('--since=')) args.set('since', arg.split('=')[1]);
    else if (arg.startsWith('--until=')) args.set('until', arg.split('=')[1]);
    else if (arg.startsWith('--limit=')) args.set('limit', arg.split('=')[1]);
  }

  const clinicIdRaw = args.get('clinicId');
  const clinicId =
    typeof clinicIdRaw === 'string' && clinicIdRaw.trim().length > 0
      ? Number(clinicIdRaw)
      : undefined;
  if (clinicIdRaw && (!clinicId || Number.isNaN(clinicId))) {
    throw new Error(`Invalid --clinicId value: ${String(clinicIdRaw)}`);
  }

  const subdomainRaw = args.get('subdomain');
  const subdomain =
    typeof subdomainRaw === 'string' && subdomainRaw.trim().length > 0
      ? subdomainRaw.trim().toLowerCase()
      : undefined;

  const parseYmd = (raw: unknown, key: string): Date | undefined => {
    if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new Error(`Invalid --${key} value (expected YYYY-MM-DD): ${raw}`);
    }
    const d = new Date(`${raw}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid --${key} value: ${raw}`);
    }
    return d;
  };

  const since = parseYmd(args.get('since'), 'since');
  const until = parseYmd(args.get('until'), 'until');

  const limitRaw = args.get('limit');
  const limit =
    typeof limitRaw === 'string' && limitRaw.trim().length > 0 ? Number(limitRaw) : 5000;
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit value: ${String(limitRaw)}`);
  }

  return {
    execute: args.has('execute'),
    clinicId,
    subdomain,
    since,
    until: until ? new Date(until.getTime() + 24 * 60 * 60 * 1000 - 1) : undefined,
    limit: Math.floor(limit),
    help: args.has('help'),
  };
}

function printHelp() {
  console.log(`
Backfill Payment.refundedAmount / refundedAt from metadata.refund

Options:
  --execute             Apply DB updates (default: dry-run)
  --clinicId=<id>       Restrict to a clinic by id
  --subdomain=<slug>    Restrict by clinic subdomain (e.g., ot)
  --since=YYYY-MM-DD    Lower bound on paidAt (or createdAt if paidAt null)
  --until=YYYY-MM-DD    Upper bound (inclusive)
  --limit=<n>           Max rows scanned (default: 5000)
  --help, -h            Show this help
`);
}

interface RefundMetadataShape {
  amount?: unknown;
  refundedAt?: unknown;
}

function readRefundFromMetadata(
  metadata: unknown
): { amountCents: number; refundedAt: Date | null } | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const refundRaw = (metadata as Record<string, unknown>).refund;
  if (!refundRaw || typeof refundRaw !== 'object') return null;
  const refund = refundRaw as RefundMetadataShape;

  const amount = typeof refund.amount === 'number' ? Math.round(refund.amount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  let refundedAt: Date | null = null;
  if (typeof refund.refundedAt === 'string') {
    const d = new Date(refund.refundedAt);
    if (!Number.isNaN(d.getTime())) refundedAt = d;
  }

  return { amountCents: amount, refundedAt };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  let clinicIdFilter = opts.clinicId;
  if (opts.subdomain && !clinicIdFilter) {
    const clinic = await prisma.clinic.findFirst({
      where: { subdomain: opts.subdomain },
      select: { id: true, name: true, subdomain: true },
    });
    if (!clinic) {
      console.error(`No clinic found with subdomain "${opts.subdomain}"`);
      process.exit(1);
    }
    clinicIdFilter = clinic.id;
    console.log(
      `Filtering to clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`
    );
  }

  const dateFilter: { OR?: Array<Record<string, unknown>> } = {};
  if (opts.since || opts.until) {
    const range: { gte?: Date; lte?: Date } = {};
    if (opts.since) range.gte = opts.since;
    if (opts.until) range.lte = opts.until;
    dateFilter.OR = [{ paidAt: range }, { paidAt: null, createdAt: range }];
  }

  const where: Record<string, unknown> = {
    status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
    refundedAmount: null,
    ...(clinicIdFilter ? { patient: { clinicId: clinicIdFilter } } : {}),
    ...dateFilter,
  };

  const candidates = await prisma.payment.findMany({
    where,
    select: {
      id: true,
      amount: true,
      status: true,
      paidAt: true,
      createdAt: true,
      patientId: true,
      stripeChargeId: true,
      stripePaymentIntentId: true,
      metadata: true,
    },
    orderBy: [{ paidAt: 'asc' }, { id: 'asc' }],
    take: opts.limit,
  });

  console.log(
    `\nFound ${candidates.length} payment row(s) with status REFUNDED/PARTIALLY_REFUNDED and refundedAmount NULL.`
  );

  if (candidates.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  let backfilled = 0;
  let missingMetadata = 0;
  let cappedAtAmount = 0;
  let totalCentsBackfilled = 0;
  const samples: Array<Record<string, unknown>> = [];

  for (const p of candidates) {
    const metaRefund = readRefundFromMetadata(p.metadata);
    if (!metaRefund) {
      missingMetadata += 1;
      if (samples.length < 5) {
        samples.push({
          id: p.id,
          status: p.status,
          amount: p.amount,
          stripeChargeId: p.stripeChargeId,
          paidAt: p.paidAt,
          metadataKeys:
            p.metadata && typeof p.metadata === 'object'
              ? Object.keys(p.metadata as Record<string, unknown>)
              : null,
          reason: 'metadata.refund.amount missing or invalid',
        });
      }
      continue;
    }

    let refundedAmount = metaRefund.amountCents;
    if (refundedAmount > p.amount) {
      cappedAtAmount += 1;
      refundedAmount = p.amount;
    }

    const refundedAt = metaRefund.refundedAt ?? p.paidAt ?? p.createdAt;

    if (samples.length < 5) {
      samples.push({
        id: p.id,
        status: p.status,
        paymentAmount: p.amount,
        backfillRefundedAmount: refundedAmount,
        backfillRefundedAt: refundedAt.toISOString(),
        stripeChargeId: p.stripeChargeId,
      });
    }

    if (opts.execute) {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          refundedAmount,
          refundedAt,
        },
      });
    }

    backfilled += 1;
    totalCentsBackfilled += refundedAmount;
  }

  console.log('\n--- Sample rows ---');
  for (const s of samples) console.log(JSON.stringify(s));

  console.log('\n--- Summary ---');
  console.log(
    `Mode:                 ${opts.execute ? 'EXECUTE (writes applied)' : 'DRY-RUN (no writes)'}`
  );
  console.log(`Eligible rows:        ${backfilled}`);
  console.log(`Skipped (no metadata):${missingMetadata}`);
  console.log(`Capped at Payment.amount: ${cappedAtAmount}`);
  console.log(`Total $ backfilled:   $${(totalCentsBackfilled / 100).toFixed(2)}`);
  if (!opts.execute) {
    console.log('\nRe-run with --execute to apply.');
  }
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
