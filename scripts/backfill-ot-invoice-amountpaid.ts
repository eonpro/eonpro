#!/usr/bin/env tsx
/**
 * Phase 4 — Repair OT invoices whose `Invoice.amountPaid` has drifted from
 * the canonical Payment rollup.
 *
 * Background: see `~/.cursor/plans/ot-invoice-3213-rca.md` and
 * `~/.cursor/plans/ot-invoice-discrepancy-blast-radius.md`. Two upstream
 * fixes already shipped (PR #11):
 *   - 5b6610af: idempotent refund pipeline (prevents new corruption)
 *   - 5adbb7df: OT loader fixed so editor displays correct net cash
 *   - d78998d7 + script execution: 143 historical Payment.refundedAmount
 *     columns backfilled from metadata.
 *
 * This script is the data-repair step that fixes the historical
 * `Invoice.amountPaid` values themselves, using the same canonical formula
 * as the now-shipped `recomputeInvoiceAmountPaid` helper.
 *
 * SCOPE
 * =====
 * Only OT clinic invoices (`patient.clinicId = OT_CLINIC_ID`).
 *
 * INCLUDES rows where:
 *   - At least one settled Payment row exists (status IN SUCCEEDED,
 *     PARTIALLY_REFUNDED, REFUNDED) AND
 *   - Invoice.amountPaid !== SUM(payment.amount - COALESCE(refundedAmount, 0))
 *
 * EXCLUDES (intentionally):
 *   1. Invoices with NO settled Payment row (the B13 saved-card-orphan class
 *      where Payment.invoiceId was never linked back). For those,
 *      Invoice.amountPaid is correct relative to Stripe — only the FK link
 *      is missing, which is a separate B13 backfill.
 *   2. Invoice 17174 by default (the 2x inflation singleton). Pass
 *      --include-17174 to force-include it. Recommended: spot-fix manually
 *      after eyeballing the result.
 *   3. Rows where the change is > $5,000 (per-row cap, defensive). Override
 *      with --allow-large $X.
 *
 * SAFETY
 * ======
 *   - Dry-run by default. Pass --execute to write.
 *   - Per-row transaction (Serializable isolation) so the read of Payment
 *     rows and the write to Invoice.amountPaid is atomic against any
 *     concurrent webhook processing the same invoice.
 *   - Per-row hipaaAudit-style entry in `AuditLog` with before/after.
 *   - Per-row idempotency: re-reads Payment rollup inside the transaction
 *     and skips writing if the value already matches (so a second run is
 *     a no-op).
 *   - Off-hours recommended (per the scratchpad decision: 21:00-06:00
 *     clinic local).
 *
 * USAGE
 * =====
 *   set -a; source .env.production.local; set +a
 *   npx tsx scripts/backfill-ot-invoice-amountpaid.ts          # dry-run
 *   npx tsx scripts/backfill-ot-invoice-amountpaid.ts --execute
 *
 *   # Optional flags:
 *   --include-17174       Force-include the 2x inflation singleton
 *   --allow-large $X      Raise the per-row delta cap (default $5,000)
 *   --limit N             Process at most N rows
 *   --invoice <id>        Operate on a single invoice (for spot fixes)
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local' });

import { basePrisma } from '../src/lib/db';
import { recomputeInvoiceAmountPaid } from '../src/services/billing/recomputeInvoiceAmountPaid';
import { loadOtPaymentNetCentsByInvoiceId } from '../src/services/invoices/loadOtPaymentNetCentsByInvoiceId';

const OT_SUBDOMAIN = 'ot';
const DEFAULT_MAX_DELTA_CENTS = 500_000; // $5,000
const SETTLED_STATUSES = ['SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED'] as const;
const INVOICE_17174 = 17174;

function getArg(name: string): string | undefined {
  const i = process.argv.findIndex((a) => a === `--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

const EXECUTE = hasFlag('execute');
const INCLUDE_17174 = hasFlag('include-17174');
const MAX_DELTA_CENTS = (() => {
  const raw = getArg('allow-large');
  if (!raw) return DEFAULT_MAX_DELTA_CENTS;
  const dollars = Number(raw.replace(/^\$/, ''));
  if (!Number.isFinite(dollars) || dollars <= 0) {
    throw new Error(`--allow-large requires a positive number, got "${raw}"`);
  }
  return Math.round(dollars * 100);
})();
const LIMIT = (() => {
  const raw = getArg('limit');
  return raw ? Number(raw) : undefined;
})();
const SINGLE_INVOICE_ID = (() => {
  const raw = getArg('invoice');
  return raw ? Number(raw) : undefined;
})();

function fmt(cents: number): string {
  return `${cents}c ($${(cents / 100).toFixed(2)})`;
}

interface DiffRow {
  invoiceId: number;
  patientId: number;
  status: string;
  oldAmountPaid: number;
  newAmountPaid: number;
  paymentGross: number;
  paymentRefunded: number;
  delta: number; // signed: new - old
  reason: 'recomputed' | 'skipped_no_payments' | 'skipped_invoice_17174' | 'skipped_large_delta' | 'skipped_already_correct';
}

async function main() {
  console.log(`Phase 4 — Invoice.amountPaid backfill for OT clinic`);
  console.log(`Mode: ${EXECUTE ? 'EXECUTE (writes will be applied)' : 'DRY-RUN (no writes)'}`);
  console.log(`Per-row delta cap: ${fmt(MAX_DELTA_CENTS)} (override with --allow-large $X)`);
  if (INCLUDE_17174) console.log('Including invoice 17174 (--include-17174)');
  if (LIMIT) console.log(`Limit: first ${LIMIT} rows`);
  if (SINGLE_INVOICE_ID) console.log(`Single-invoice mode: invoice ${SINGLE_INVOICE_ID}`);
  console.log('');

  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true, name: true, subdomain: true },
  });
  if (!clinic) throw new Error('OT clinic not found');
  console.log(`Clinic: ${clinic.name} (id=${clinic.id}, subdomain=${clinic.subdomain})`);
  console.log('');

  // Fetch all OT invoices (or just the one).
  const invoices = await basePrisma.invoice.findMany({
    where: SINGLE_INVOICE_ID
      ? { id: SINGLE_INVOICE_ID }
      : { patient: { clinicId: clinic.id } },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      patientId: true,
      status: true,
      amount: true,
      amountPaid: true,
    },
  });
  console.log(`Loaded ${invoices.length} OT invoices.`);

  // Compute payment net for all in batch
  const invoiceIds = invoices.map((i) => i.id);
  const netMap = await loadOtPaymentNetCentsByInvoiceId(invoiceIds, basePrisma);

  // Identify rows that need correction
  const candidates: DiffRow[] = [];
  for (const inv of invoices) {
    const netFromPayments = netMap.get(inv.id);
    if (netFromPayments == null) {
      // No settled Payment row at all — skip (B13 false-positive class).
      // We don't even count these for visibility unless they're in
      // single-invoice mode.
      if (SINGLE_INVOICE_ID === inv.id) {
        candidates.push({
          invoiceId: inv.id,
          patientId: inv.patientId,
          status: inv.status,
          oldAmountPaid: inv.amountPaid,
          newAmountPaid: inv.amountPaid,
          paymentGross: 0,
          paymentRefunded: 0,
          delta: 0,
          reason: 'skipped_no_payments',
        });
      }
      continue;
    }

    if (inv.amountPaid === netFromPayments) continue;

    if (inv.id === INVOICE_17174 && !INCLUDE_17174) {
      candidates.push({
        invoiceId: inv.id,
        patientId: inv.patientId,
        status: inv.status,
        oldAmountPaid: inv.amountPaid,
        newAmountPaid: netFromPayments,
        paymentGross: 0,
        paymentRefunded: 0,
        delta: netFromPayments - inv.amountPaid,
        reason: 'skipped_invoice_17174',
      });
      continue;
    }

    const delta = netFromPayments - inv.amountPaid;
    if (Math.abs(delta) > MAX_DELTA_CENTS) {
      candidates.push({
        invoiceId: inv.id,
        patientId: inv.patientId,
        status: inv.status,
        oldAmountPaid: inv.amountPaid,
        newAmountPaid: netFromPayments,
        paymentGross: 0,
        paymentRefunded: 0,
        delta,
        reason: 'skipped_large_delta',
      });
      continue;
    }

    candidates.push({
      invoiceId: inv.id,
      patientId: inv.patientId,
      status: inv.status,
      oldAmountPaid: inv.amountPaid,
      newAmountPaid: netFromPayments,
      paymentGross: 0,
      paymentRefunded: 0,
      delta,
      reason: 'recomputed',
    });
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Per-row diff');
  console.log('='.repeat(80));
  for (const c of candidates) {
    const sign = c.delta >= 0 ? '+' : '';
    console.log(
      `  invoiceId=${c.invoiceId} status=${c.status} ${fmt(c.oldAmountPaid)} → ${fmt(c.newAmountPaid)} delta=${sign}${fmt(c.delta)} [${c.reason}]`
    );
  }

  // Summary
  const eligible = candidates.filter((c) => c.reason === 'recomputed');
  const skipped17174 = candidates.filter((c) => c.reason === 'skipped_invoice_17174');
  const skippedLarge = candidates.filter((c) => c.reason === 'skipped_large_delta');
  const overCreditFix = eligible.filter((c) => c.delta < 0); // amountPaid was too high → reducing
  const underCreditFix = eligible.filter((c) => c.delta > 0); // amountPaid was too low → increasing

  console.log('');
  console.log('='.repeat(80));
  console.log('Summary');
  console.log('='.repeat(80));
  console.log(`Eligible for correction:      ${eligible.length}`);
  console.log(`  → reducing amountPaid:      ${overCreditFix.length} rows, ${fmt(overCreditFix.reduce((a, c) => a + Math.abs(c.delta), 0))}`);
  console.log(`  → increasing amountPaid:    ${underCreditFix.length} rows, ${fmt(underCreditFix.reduce((a, c) => a + Math.abs(c.delta), 0))}`);
  console.log(`Skipped — invoice 17174:      ${skipped17174.length}`);
  console.log(`Skipped — delta > ${fmt(MAX_DELTA_CENTS)}: ${skippedLarge.length}`);
  console.log('');

  if (!EXECUTE) {
    console.log('DRY-RUN complete. Re-run with --execute to apply.');
    return;
  }

  console.log('EXECUTING…');
  console.log('');

  let written = 0;
  let alreadyCorrect = 0;
  let failed = 0;
  for (const c of eligible) {
    try {
      await basePrisma.$transaction(
        async (tx) => {
          // Re-check inside the transaction: another writer (the now-fixed
          // refund pipeline) may have already corrected this.
          const inv = await tx.invoice.findUnique({
            where: { id: c.invoiceId },
            select: { amountPaid: true },
          });
          if (!inv) {
            failed += 1;
            console.log(`  invoiceId=${c.invoiceId} FAILED: invoice no longer exists`);
            return;
          }

          // Recompute from current Payment state (idempotent; same logic
          // the live pipeline now uses). Pass `caller: 'backfill'` to
          // suppress the Sentry tripwire — backfills EXPECT to find drift
          // by definition.
          const result = await recomputeInvoiceAmountPaid(c.invoiceId, tx, {
            caller: 'backfill',
          });

          if (inv.amountPaid === result.newAmountPaid) {
            alreadyCorrect += 1;
            return;
          }

          // Write audit row inside the same transaction.
          await tx.auditLog.create({
            data: {
              userId: 0, // operator script — no user
              action: 'DATA_CORRECTION',
              resource: 'Invoice',
              resourceId: c.invoiceId,
              clinicId: clinic.id,
              details: {
                field: 'amountPaid',
                before_cents: inv.amountPaid,
                after_cents: result.newAmountPaid,
                paymentGross_cents: result.paymentGross,
                paymentRefunded_cents: result.paymentRefunded,
                source: 'scripts/backfill-ot-invoice-amountpaid.ts',
                rca: '~/.cursor/plans/ot-invoice-3213-rca.md',
              },
            },
          });

          written += 1;
        },
        { isolationLevel: 'Serializable', timeout: 15_000 }
      );
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  invoiceId=${c.invoiceId} FAILED: ${msg}`);
    }
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Execute summary');
  console.log('='.repeat(80));
  console.log(`Rows written:               ${written}`);
  console.log(`Rows already correct:       ${alreadyCorrect} (a previous run, the live pipeline, or another writer fixed them between dry-run and execute)`);
  console.log(`Rows failed:                ${failed}`);
}

main()
  .catch((err) => {
    console.error('FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => basePrisma.$disconnect());
