/**
 * OT Invoice Reconciliation (Safety Net Cron)
 * ============================================
 *
 * Mirror of `wellmedr-subscription-sync` cron, but for the OT invoice
 * reconciliation incident (2026-05-02). Hourly check that:
 *   1. `Invoice.amountPaid` agrees with the canonical `Payment` rollup
 *      (`SUM(amount - COALESCE(refundedAmount, 0))` for SUCCEEDED +
 *      PARTIALLY_REFUNDED + REFUNDED).
 *   2. Every Payment row with `status IN (REFUNDED, PARTIALLY_REFUNDED)`
 *      has its `refundedAmount` column populated (not just `metadata.refund`).
 *
 * Scope: 24h rolling window of OT invoices (`Invoice.updatedAt >= now - 24h`).
 * Why updatedAt and not createdAt: a refund processed today on an invoice
 * created last month must still be caught.
 *
 * Why this cron exists:
 *   - PR #11 made the live refund pipeline idempotent via
 *     `recomputeInvoiceAmountPaid`. The Sentry tripwire inside that helper
 *     catches drift in real-time IF the helper is called.
 *   - This cron catches drift introduced by code paths that DON'T go
 *     through the helper: future regressions, ad-hoc admin SQL, third-party
 *     integrations, payment_intent.succeeded re-deliveries that hit the
 *     `paymentService.ts:310` increment path (the suspect for invoice
 *     17174's 2x inflation).
 *   - Auto-corrects benign drift inline; alerts on anything else.
 *
 * Behavior:
 *   - For each OT invoice in the window, recompute via the helper.
 *   - If the recompute changed the value (helper.delta !== 0), count it
 *     as "corrected".
 *   - If `refundedAmount` is null on any settled Payment in the window AND
 *     metadata.refund.amount is set, count it as "column_missing" (also
 *     auto-corrected).
 *   - Slack `alertWarning` if any bucket > 0 — this is signal that the
 *     primary pipeline drifted.
 */
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { alertWarning } from '@/lib/observability/slack-alerts';
import { recomputeInvoiceAmountPaid } from '@/services/billing/recomputeInvoiceAmountPaid';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OT_SUBDOMAIN = 'ot';
const SCAN_WINDOW_MS = 24 * 60 * 60 * 1000;
const ALERT_SAMPLE_LIMIT = 10;
const DRIFT_ALERT_THRESHOLD_CENTS = 100; // $1 — ignore floating-point noise

interface DriftSample {
  invoiceId: number;
  previousAmountPaid_cents: number;
  newAmountPaid_cents: number;
  delta_cents: number;
}

interface RunTotals {
  scanned: number;
  amountPaidCorrected: number;
  amountPaidCorrectedTotal_cents: number; // sum of |delta|
  refundColumnBackfilled: number;
  failed: number;
  samples: DriftSample[];
}

async function reconcileInvoice(
  invoiceId: number,
  totals: RunTotals
): Promise<void> {
  try {
    const result = await basePrisma.$transaction(
      async (tx) => {
        return recomputeInvoiceAmountPaid(invoiceId, tx, { caller: 'backfill' });
      },
      { isolationLevel: 'Serializable', timeout: 15_000 }
    );

    if (Math.abs(result.delta) > DRIFT_ALERT_THRESHOLD_CENTS) {
      totals.amountPaidCorrected += 1;
      totals.amountPaidCorrectedTotal_cents += Math.abs(result.delta);
      if (totals.samples.length < ALERT_SAMPLE_LIMIT) {
        totals.samples.push({
          invoiceId,
          previousAmountPaid_cents: result.previousAmountPaid,
          newAmountPaid_cents: result.newAmountPaid,
          delta_cents: result.delta,
        });
      }
      logger.warn('[ot-invoice-reconciliation] Corrected Invoice.amountPaid drift', {
        invoiceId,
        previousAmountPaid_cents: result.previousAmountPaid,
        newAmountPaid_cents: result.newAmountPaid,
        delta_cents: result.delta,
      });
    }
  } catch (err) {
    totals.failed += 1;
    const errorMessage = err instanceof Error ? err.message : 'Unknown';
    logger.error('[ot-invoice-reconciliation] Recompute threw', {
      invoiceId,
      error: errorMessage,
    });
  }
}

interface PaymentMetadataWithRefund {
  refund?: { amount?: unknown };
}

async function backfillMissingRefundColumns(
  clinicId: number,
  totals: RunTotals
): Promise<void> {
  // Same logic as scripts/backfill-refund-payment-columns.ts. Not scoped to
  // a date window because Payment has no `updatedAt` column and refunds can
  // arrive weeks after the original charge — a stale row from months ago
  // could need backfill today. The `take: 100` cap protects cron-time
  // budget; if there are >100 unbackfilled rows the operator script
  // (scripts/backfill-refund-payment-columns.ts --execute) should be run
  // manually, and the alertWarning below will signal that.
  const candidates = await basePrisma.payment.findMany({
    where: {
      patient: { clinicId },
      status: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
      refundedAmount: null,
    },
    select: { id: true, amount: true, metadata: true, status: true },
    take: 100,
    orderBy: { id: 'asc' },
  });

  for (const p of candidates) {
    const md = p.metadata as PaymentMetadataWithRefund | null;
    const metaAmount = md?.refund?.amount;
    if (typeof metaAmount !== 'number' || metaAmount <= 0) continue;
    const refundedAmount = Math.min(metaAmount, p.amount);
    try {
      await basePrisma.payment.update({
        where: { id: p.id },
        data: { refundedAmount },
      });
      totals.refundColumnBackfilled += 1;
      logger.warn('[ot-invoice-reconciliation] Backfilled missing Payment.refundedAmount', {
        paymentId: p.id,
        refundedAmount,
        status: p.status,
      });
    } catch (err) {
      totals.failed += 1;
      logger.error('[ot-invoice-reconciliation] Refund column backfill threw', {
        paymentId: p.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();

  try {
    const clinic = await basePrisma.clinic.findFirst({
      where: { subdomain: OT_SUBDOMAIN, status: 'ACTIVE' },
      select: { id: true, subdomain: true },
    });

    if (!clinic) {
      return NextResponse.json({ skipped: true, reason: 'OT clinic not found' });
    }

    const since = new Date(Date.now() - SCAN_WINDOW_MS);
    const totals: RunTotals = {
      scanned: 0,
      amountPaidCorrected: 0,
      amountPaidCorrectedTotal_cents: 0,
      refundColumnBackfilled: 0,
      failed: 0,
      samples: [],
    };

    // Phase A: backfill any Payment.refundedAmount column gaps so the
    // recompute in Phase B sees the correct refund total.
    await backfillMissingRefundColumns(clinic.id, totals);

    // Phase B: recompute Invoice.amountPaid for OT invoices touched in the
    // last window. This is bounded by the cron's 60s maxDuration, so we
    // cap at 500 invoices per run; Phase 4 backfill is the catch-up path
    // for larger windows.
    const invoiceIds = await basePrisma.invoice.findMany({
      where: {
        patient: { clinicId: clinic.id },
        updatedAt: { gte: since },
      },
      select: { id: true },
      take: 500,
      orderBy: { id: 'asc' },
    });

    for (const inv of invoiceIds) {
      totals.scanned += 1;
      await reconcileInvoice(inv.id, totals);
    }

    if (
      totals.amountPaidCorrected > 0 ||
      totals.refundColumnBackfilled > 0 ||
      totals.failed > 0
    ) {
      try {
        await alertWarning(
          'OT invoice reconciliation cron found drift',
          `In the last ${SCAN_WINDOW_MS / 3600000}h, the cron auto-corrected ${totals.amountPaidCorrected} Invoice.amountPaid drift(s) (total |Δ|=$${(totals.amountPaidCorrectedTotal_cents / 100).toFixed(2)}) and backfilled ${totals.refundColumnBackfilled} Payment.refundedAmount column(s). ${totals.failed} row(s) failed. Investigate the upstream code path that introduced the drift — the live refund pipeline (PR #11) should make this 0.`,
          {
            clinicId: clinic.id,
            scanned: totals.scanned,
            amountPaidCorrected: totals.amountPaidCorrected,
            amountPaidCorrectedTotal_cents: totals.amountPaidCorrectedTotal_cents,
            refundColumnBackfilled: totals.refundColumnBackfilled,
            failed: totals.failed,
            samples: totals.samples,
          }
        );
      } catch (alertErr) {
        logger.warn('[ot-invoice-reconciliation] Slack alert failed (non-fatal)', {
          error: alertErr instanceof Error ? alertErr.message : 'Unknown',
        });
      }
    }

    return NextResponse.json({
      success: true,
      clinicId: clinic.id,
      scanned: totals.scanned,
      amountPaidCorrected: totals.amountPaidCorrected,
      amountPaidCorrectedTotal_cents: totals.amountPaidCorrectedTotal_cents,
      refundColumnBackfilled: totals.refundColumnBackfilled,
      failed: totals.failed,
      samples: totals.samples,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error('[ot-invoice-reconciliation] Fatal error', { error: errorMessage });
    return NextResponse.json(
      { success: false, error: errorMessage, durationMs: Date.now() - startTime },
      { status: 500 }
    );
  }
}
