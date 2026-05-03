/**
 * Loads net cents per invoice from local Payment rows for the OT clinic
 * reconciliation report.
 *
 * "Net" means `amount - COALESCE(refundedAmount, 0)` — the cash actually
 * collected from the patient after refunds. The OT editor uses this to
 * compute Patient Gross via `resolveOtPatientGrossCents`.
 *
 * Statuses included (the Payment lifecycle endpoints that actually settled):
 *   - SUCCEEDED            — paid, no refund
 *   - PARTIALLY_REFUNDED   — paid, partial refund recorded on the Payment row
 *   - REFUNDED             — paid then fully refunded (net is 0)
 *
 * Excluded: FAILED, PENDING, CANCELLED — those didn't settle.
 *
 * Why this needs care
 * ===================
 * Before 2026-05-02 this loader filtered `status: 'SUCCEEDED'` only AND did
 * not subtract `refundedAmount`. That meant:
 *   B6: any invoice with a partial refund (status=PARTIALLY_REFUNDED) was
 *       silently dropped from the map. The OT editor then fell back to
 *       `Invoice.amountPaid` via the `invoice_sync` branch — which had been
 *       corrupted by the refund double-decrement bug.
 *   B7: even if a partial refund had been counted, the value would have
 *       been the gross (`amount`) not the net — overstating cash by the
 *       refund amount.
 *
 * See `~/.cursor/plans/ot-invoice-3213-rca.md` and
 * `~/.cursor/plans/ot-invoice-discrepancy-blast-radius.md` for the full
 * incident context.
 */

import type { Prisma, PaymentStatus } from '@prisma/client';

const SETTLED_STATUSES: PaymentStatus[] = [
  'SUCCEEDED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
];

/**
 * Minimal Prisma surface for testability — accepts the top-level client,
 * `basePrisma`, or a transaction client.
 */
export type LoadOtPaymentNetClient = {
  payment: {
    findMany: (args: {
      where: Prisma.PaymentWhereInput;
      select: { invoiceId: true; amount: true; refundedAmount: true; status: true };
    }) => Promise<
      Array<{
        invoiceId: number | null;
        amount: number;
        refundedAmount: number | null;
        status: PaymentStatus;
      }>
    >;
  };
};

/**
 * Returns a map from `Invoice.id` → net cents collected.
 *
 * Behavior contract (any change here must update the corresponding test):
 *   1. Empty input → empty map (no DB call).
 *   2. Settled payments only — `SUCCEEDED`, `PARTIALLY_REFUNDED`, `REFUNDED`.
 *      `FAILED` / `PENDING` / `CANCELLED` are excluded.
 *   3. Net = max(0, sum(amount - COALESCE(refundedAmount, 0))) per invoice.
 *      The floor at 0 guards against corrupted rows where
 *      `refundedAmount > amount` (shouldn't happen, but if it does we must
 *      not return a negative gross to the editor).
 *   4. Invoices with `0 net` (e.g. fully refunded) ARE included in the map.
 *      The downstream `resolveOtPatientGrossCents` decides what to do with
 *      0 — historically it falls back to `invoice_sync` on `0` because the
 *      callsite does `if (fromPayments != null && fromPayments > 0)`. That
 *      decision is intentionally NOT made here.
 */
export async function loadOtPaymentNetCentsByInvoiceId(
  invoiceDbIds: number[],
  client: LoadOtPaymentNetClient
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (invoiceDbIds.length === 0) return map;

  const payments = await client.payment.findMany({
    where: {
      invoiceId: { in: invoiceDbIds },
      status: { in: SETTLED_STATUSES },
    },
    select: { invoiceId: true, amount: true, refundedAmount: true, status: true },
  });

  // First pass: accumulate signed (amount - refunded) per invoice.
  const signed = new Map<number, number>();
  for (const p of payments) {
    if (p.invoiceId == null) continue;
    const refunded = p.refundedAmount ?? 0;
    const net = p.amount - refunded;
    signed.set(p.invoiceId, (signed.get(p.invoiceId) ?? 0) + net);
  }

  // Second pass: floor at 0 and write to result. (One pass with Math.max
  // would be wrong for invoices paid in two installments where one row's
  // accidental over-refund could cancel the other.)
  for (const [invoiceId, net] of signed) {
    map.set(invoiceId, Math.max(0, net));
  }

  return map;
}
