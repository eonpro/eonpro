/**
 * `recomputeInvoiceAmountPaid` — single canonical source of truth for the
 * `Invoice.amountPaid` field.
 *
 * WHY THIS EXISTS
 * ===============
 * On 2026-05-02 we discovered OT invoice 3213 (`INV-19036`) showed
 * `amountPaid = $249` for a $649 charge with a $200 partial refund — the
 * correct value is $449. The blast-radius audit found 73 OT invoices with
 * `Invoice.amountPaid` drift totaling ~$31k in OT-over-credit and ~$3.6k in
 * OT-under-credit. Two writers were each independently decrementing
 * `Invoice.amountPaid` by the refund amount for the same refund event:
 *
 *   1. `src/app/api/stripe/refunds/route.ts` — the manual EONPRO refund
 *      button: `amountPaid: { decrement: refundAmount }`
 *   2. `src/services/stripe/paymentMatchingService.ts` — the
 *      `charge.refunded` webhook handler: `payment.invoice.amountPaid -
 *      refundData.amount` (re-reading the already-decremented value)
 *
 * Either alone was correct. Both running for the same refund event produced
 * `amount − 2 × refund` ($249 in the canonical case). Refunds initiated
 * directly from the Stripe Dashboard only triggered Writer B and so didn't
 * double-decrement, which is why this hadn't been caught.
 *
 * THE INVARIANT
 * =============
 *   Invoice.amountPaid = SUM(payment.amount - COALESCE(payment.refundedAmount, 0))
 *                        for payment in invoice.payments
 *                        where payment.status IN ('SUCCEEDED', 'PARTIALLY_REFUNDED', 'REFUNDED')
 *
 * Every writer that touches `Invoice.amountPaid` in response to a payment-
 * or refund-side event MUST call this helper inside the same transaction
 * that updated the `Payment` row. It is idempotent: calling it any number
 * of times for the same Payment state produces the same Invoice.amountPaid
 * value, so re-delivered webhooks and concurrent button clicks cannot
 * compound corruption.
 *
 * USAGE
 * =====
 *   await prisma.$transaction(async (tx) => {
 *     await tx.payment.update({
 *       where: { id: paymentId },
 *       data: { refundedAmount, refundedAt, status, ... },
 *     });
 *     await recomputeInvoiceAmountPaid(invoiceId, tx);
 *     // status / amountDue may still be set explicitly here:
 *     await tx.invoice.update({
 *       where: { id: invoiceId },
 *       data: { status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
 *     });
 *   });
 *
 * SCOPE
 * =====
 * This helper writes ONLY `Invoice.amountPaid`. Status, `amountDue`,
 * `paidAt`, refund metadata, audit trail, etc. remain the responsibility of
 * the calling site. That keeps the helper's single responsibility narrow and
 * avoids subtle differences between webhook-driven and API-driven state
 * transitions.
 *
 * See `~/.cursor/plans/ot-invoice-3213-rca.md` for the root cause analysis
 * and `~/.cursor/plans/ot-invoice-discrepancy-blast-radius.md` for the
 * 2,672-invoice blast-radius audit.
 */

import type { Prisma, PaymentStatus } from '@prisma/client';
import { emitWarningAlert } from '@/lib/observability/sentry-alerts';

/** Payment statuses that count toward `Invoice.amountPaid`. */
const SETTLED_STATUSES: PaymentStatus[] = [
  'SUCCEEDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

/**
 * Drift threshold for the Sentry tripwire. If the helper finds the live
 * `Invoice.amountPaid` is more than this many cents away from the canonical
 * Payment rollup AND the caller is the live refund pipeline (not a backfill
 * script), we emit `Sentry.captureMessage(level: 'warning')` with a
 * `regression: 'ot-refund-double-decrement'` tag so on-call gets paged
 * before the discrepancy compounds.
 *
 * 100 cents ($1) is large enough to ignore floating-point noise from any
 * future decimal arithmetic but tight enough to catch real drift.
 */
const DRIFT_TRIPWIRE_CENTS = 100;

export interface RecomputeInvoiceAmountPaidResult {
  invoiceId: number;
  /** Sum of `Payment.amount` for settled payments. */
  paymentGross: number;
  /** Sum of `COALESCE(Payment.refundedAmount, 0)` for settled payments. */
  paymentRefunded: number;
  /** The value `Invoice.amountPaid` held BEFORE this call. */
  previousAmountPaid: number;
  /** The value written to `Invoice.amountPaid`. Always `>= 0`. */
  newAmountPaid: number;
  /** Signed: `newAmountPaid - previousAmountPaid`. */
  delta: number;
  /** Number of settled Payment rows that contributed. */
  paymentCount: number;
}

/**
 * Minimal Prisma-client surface used by this helper. Accepts both the
 * top-level `prisma` client and a `Prisma.TransactionClient`. Callers SHOULD
 * pass a transaction client to ensure the recompute runs in the same
 * transaction that updated the `Payment` row.
 */
type RecomputeClient = Pick<Prisma.TransactionClient, 'payment' | 'invoice'>;

export interface RecomputeOptions {
  /**
   * Where this call came from — used to suppress the Sentry tripwire when
   * the caller is a known backfill script that EXPECTS to find drift.
   *
   *   'webhook'        — Stripe charge.refunded handler
   *   'manual_refund'  — POST /api/stripe/refunds (button click)
   *   'backfill'       — operator script (no tripwire)
   *
   * Defaults to undefined, which means the tripwire WILL fire on drift —
   * conservative default for callers who forget to set it.
   */
  caller?: 'webhook' | 'manual_refund' | 'backfill';
}

/**
 * Recompute `Invoice.amountPaid` from the canonical `Payment` rollup and
 * write it back. Idempotent.
 *
 * Sentry tripwire: when the caller is the live refund pipeline (`webhook`
 * or `manual_refund`), if the helper finds `Invoice.amountPaid` differs
 * from the recomputed value by more than `DRIFT_TRIPWIRE_CENTS`, emit a
 * Sentry warning. That signals the upstream refund pipeline broke again —
 * a self-correcting recompute should never find pre-existing drift on the
 * live path.
 *
 * @param invoiceId  The Invoice to recompute.
 * @param tx         A Prisma transaction client (preferred) or the top-level
 *                   client. When called from the manual-refund API or the
 *                   `charge.refunded` webhook, this MUST be the same `tx`
 *                   that just updated the Payment row.
 * @param opts       Optional metadata. Set `caller: 'backfill'` from operator
 *                   scripts to suppress the tripwire (backfills EXPECT drift).
 */
export async function recomputeInvoiceAmountPaid(
  invoiceId: number,
  tx: RecomputeClient,
  opts?: RecomputeOptions
): Promise<RecomputeInvoiceAmountPaidResult> {
  // Read current Invoice.amountPaid first so we can detect drift. Use the
  // same transaction so the read is consistent with the subsequent write.
  const currentInvoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    select: { amountPaid: true },
  });
  const previousAmountPaid = currentInvoice?.amountPaid ?? 0;

  const payments = await tx.payment.findMany({
    where: {
      invoiceId,
      status: { in: SETTLED_STATUSES },
    },
    select: {
      amount: true,
      refundedAmount: true,
    },
  });

  let paymentGross = 0;
  let paymentRefunded = 0;
  for (const p of payments) {
    paymentGross += p.amount;
    paymentRefunded += p.refundedAmount ?? 0;
  }

  // Floor at 0. Negative values would only happen with corrupt data
  // (refundedAmount > amount) and are never the right thing to persist.
  const newAmountPaid = Math.max(0, paymentGross - paymentRefunded);
  const delta = newAmountPaid - previousAmountPaid;

  await tx.invoice.update({
    where: { id: invoiceId },
    data: { amountPaid: newAmountPaid },
  });

  // Tripwire — see the doc on DRIFT_TRIPWIRE_CENTS for the rationale.
  // Only fires for live-pipeline callers; backfill scripts expect drift.
  const caller = opts?.caller;
  const isLivePipeline = caller === 'webhook' || caller === 'manual_refund';
  if (isLivePipeline && Math.abs(delta) > DRIFT_TRIPWIRE_CENTS) {
    try {
      emitWarningAlert('Invoice.amountPaid drift corrected by recomputeInvoiceAmountPaid', {
        regression: 'ot-refund-double-decrement',
        invoiceId,
        caller,
        previousAmountPaid_cents: previousAmountPaid,
        newAmountPaid_cents: newAmountPaid,
        delta_cents: delta,
        paymentGross_cents: paymentGross,
        paymentRefunded_cents: paymentRefunded,
        paymentCount: payments.length,
      });
    } catch {
      // Don't let observability throws break the refund flow.
    }
  }

  return {
    invoiceId,
    paymentGross,
    paymentRefunded,
    previousAmountPaid,
    newAmountPaid,
    delta,
    paymentCount: payments.length,
  };
}
