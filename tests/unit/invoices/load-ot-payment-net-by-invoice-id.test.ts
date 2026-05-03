/**
 * Behavior tests for `loadOtPaymentNetCentsByInvoiceId` — the loader that
 * feeds the OT editor's "Patient gross" calculation via
 * `resolveOtPatientGrossCents`.
 *
 * These tests lock in the fix for B6 + B7 from the OT invoice
 * reconciliation incident (RCA at `~/.cursor/plans/ot-invoice-3213-rca.md`):
 *   B6: PARTIALLY_REFUNDED payments must be COUNTED (the previous
 *       implementation filtered SUCCEEDED only and silently dropped them).
 *   B7: refundedAmount must be SUBTRACTED (the function was named "net"
 *       but returned gross).
 */

import { describe, it, expect, vi } from 'vitest';
import { loadOtPaymentNetCentsByInvoiceId } from '@/services/invoices/loadOtPaymentNetCentsByInvoiceId';

interface PaymentRow {
  invoiceId: number | null;
  amount: number;
  refundedAmount: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  status: any;
}

function clientWith(rows: PaymentRow[]) {
  return {
    payment: {
      findMany: vi.fn(
        async (args: {
          where: {
            invoiceId?: { in?: number[] };
            status?: { in?: string[] };
          };
        }) => {
          const idIn = args.where.invoiceId?.in ?? [];
          const statusIn = args.where.status?.in ?? [];
          return rows.filter(
            (r) =>
              r.invoiceId != null &&
              idIn.includes(r.invoiceId) &&
              statusIn.includes(r.status)
          );
        }
      ),
    },
  };
}

describe('loadOtPaymentNetCentsByInvoiceId', () => {
  it('returns an empty map for empty input (no DB call)', async () => {
    const c = clientWith([]);
    const result = await loadOtPaymentNetCentsByInvoiceId([], c);
    expect(result.size).toBe(0);
    expect(c.payment.findMany).not.toHaveBeenCalled();
  });

  it('returns Payment.amount for a SUCCEEDED row with no refund (the happy path)', async () => {
    const c = clientWith([
      { invoiceId: 1001, amount: 64900, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([1001], c);

    expect(result.get(1001)).toBe(64900);
  });

  it('B6: INCLUDES PARTIALLY_REFUNDED payments (the canonical OT inv 3213 case)', async () => {
    // The exact production fixture from the RCA.
    const c = clientWith([
      {
        invoiceId: 19036,
        amount: 64900,
        refundedAmount: 20000,
        status: 'PARTIALLY_REFUNDED',
      },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([19036], c);

    // Before the fix this returned undefined → editor fell back to corrupted
    // Invoice.amountPaid ($249). After the fix it returns the canonical
    // Stripe net of $449.
    expect(result.get(19036)).toBe(44900);
    expect(result.has(19036)).toBe(true);
  });

  it('B7: SUBTRACTS refundedAmount from amount (returns net, not gross)', async () => {
    // A SUCCEEDED Payment row that already has refundedAmount populated
    // (e.g. a Stripe-Dashboard refund where the column was backfilled
    // but Payment.status was not bumped to PARTIALLY_REFUNDED).
    const c = clientWith([
      { invoiceId: 5001, amount: 100000, refundedAmount: 30000, status: 'SUCCEEDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([5001], c);

    expect(result.get(5001)).toBe(70000);
    // Explicit guard against the regression that returned amount (gross) only.
    expect(result.get(5001)).not.toBe(100000);
  });

  it('treats null refundedAmount as 0 (column may be unbackfilled — see B11)', async () => {
    const c = clientWith([
      { invoiceId: 7001, amount: 50000, refundedAmount: null, status: 'SUCCEEDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([7001], c);

    expect(result.get(7001)).toBe(50000);
  });

  it('includes REFUNDED rows with net=0 (downstream may choose to skip them)', async () => {
    // Fully refunded invoice: amount=24900, refundedAmount=24900. Net=0.
    // The map MUST contain the entry — the downstream consumer decides
    // whether to use it or fall back to invoice_sync.
    const c = clientWith([
      { invoiceId: 14111, amount: 24900, refundedAmount: 24900, status: 'REFUNDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([14111], c);

    expect(result.has(14111)).toBe(true);
    expect(result.get(14111)).toBe(0);
  });

  it('excludes FAILED / PENDING / CANCELLED rows', async () => {
    const c = clientWith([
      { invoiceId: 200, amount: 5000, refundedAmount: 0, status: 'FAILED' },
      { invoiceId: 200, amount: 5000, refundedAmount: 0, status: 'PENDING' },
      { invoiceId: 201, amount: 5000, refundedAmount: 0, status: 'CANCELLED' },
      { invoiceId: 202, amount: 5000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([200, 201, 202], c);

    expect(result.has(200)).toBe(false);
    expect(result.has(201)).toBe(false);
    expect(result.get(202)).toBe(5000);
  });

  it('sums multiple settled payments per invoice (e.g. paid in installments)', async () => {
    const c = clientWith([
      { invoiceId: 300, amount: 30000, refundedAmount: 0, status: 'SUCCEEDED' },
      {
        invoiceId: 300,
        amount: 20000,
        refundedAmount: 5000,
        status: 'PARTIALLY_REFUNDED',
      },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([300], c);

    expect(result.get(300)).toBe(45000); // 30000 + (20000 - 5000)
  });

  it('floors a single-invoice net at 0 if refundedAmount somehow exceeds amount', async () => {
    // Defensive: should never happen in healthy data, but if it does
    // (corrupted refundedAmount), do NOT return a negative number.
    const c = clientWith([
      { invoiceId: 400, amount: 10000, refundedAmount: 15000, status: 'PARTIALLY_REFUNDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([400], c);

    expect(result.get(400)).toBe(0);
    expect(result.get(400)).not.toBeLessThan(0);
  });

  it('separates totals across invoices in a batch', async () => {
    const c = clientWith([
      { invoiceId: 500, amount: 10000, refundedAmount: 0, status: 'SUCCEEDED' },
      { invoiceId: 501, amount: 20000, refundedAmount: 5000, status: 'PARTIALLY_REFUNDED' },
      { invoiceId: 502, amount: 30000, refundedAmount: 30000, status: 'REFUNDED' },
    ]);

    const result = await loadOtPaymentNetCentsByInvoiceId([500, 501, 502], c);

    expect(result.get(500)).toBe(10000);
    expect(result.get(501)).toBe(15000);
    expect(result.get(502)).toBe(0);
    expect(result.size).toBe(3);
  });
});
