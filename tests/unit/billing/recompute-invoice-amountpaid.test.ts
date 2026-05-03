/**
 * Regression tests for the OT invoice ↔ Stripe refund double-decrement bug
 * (root cause confirmed in `~/.cursor/plans/ot-invoice-3213-rca.md`).
 *
 * Bug shape: when staff clicked "Refund" in EONPRO, the manual refund API
 * decremented `Invoice.amountPaid` by `refundAmount`; Stripe then fired a
 * `charge.refunded` webhook that ran `paymentMatchingService.handleStripeRefund`,
 * which ALSO decremented `Invoice.amountPaid` by `refundAmount` (re-reading
 * the already-decremented value). Result for the canonical $649 / $200 refund:
 *   $649 − $200 − $200 = $249   ❌
 * Correct value:
 *   $649 − $200 = $449           ✅
 *
 * Fix: a single `recomputeInvoiceAmountPaid(invoiceId, tx)` helper derives
 * the value from `Payment` rows (the only source of truth) — making both
 * writers idempotent regardless of order or repeat invocation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    payment: {
      findMany: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (client: unknown) => unknown) => fn(mockPrisma)),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
}));

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  basePrisma: mockPrisma,
  getClinicContext: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

import { recomputeInvoiceAmountPaid } from '@/services/billing/recomputeInvoiceAmountPaid';

interface PaymentFixture {
  id: number;
  invoiceId: number;
  amount: number;
  refundedAmount: number | null;
  status: 'SUCCEEDED' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED' | 'PENDING';
}

/**
 * Set fixture payments. The mock honors the `where.status.in` and `where.invoiceId`
 * filters that the helper passes — important so we can verify the helper
 * actually filters out FAILED/PENDING etc. instead of relying on the mock to.
 */
function setPayments(payments: PaymentFixture[]) {
  mockPrisma.payment.findMany.mockImplementation(async (args: { where?: { invoiceId?: number; status?: { in?: string[] } } } | undefined) => {
    const invoiceFilter = args?.where?.invoiceId;
    const statusIn = args?.where?.status?.in;
    return payments.filter((p) => {
      if (invoiceFilter != null && p.invoiceId !== invoiceFilter) return false;
      if (statusIn && !statusIn.includes(p.status)) return false;
      return true;
    });
  });
}

describe('recomputeInvoiceAmountPaid — single canonical source of truth for Invoice.amountPaid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.update.mockResolvedValue({});
  });

  it('returns Payment.amount for a SUCCEEDED payment with no refunds (the happy path)', async () => {
    setPayments([{ id: 1, invoiceId: 19036, amount: 64900, refundedAmount: 0, status: 'SUCCEEDED' }]);

    const result = await recomputeInvoiceAmountPaid(19036, mockPrisma);

    expect(result.newAmountPaid).toBe(64900);
    expect(result.paymentGross).toBe(64900);
    expect(result.paymentRefunded).toBe(0);
  });

  it('subtracts refundedAmount once (not twice) for a PARTIALLY_REFUNDED payment — the canonical OT invoice 3213 case', async () => {
    // The exact production data from `~/.cursor/plans/ot-invoice-3213-rca.md`:
    //   Payment.amount = 64900 ($649.00), refundedAmount = 20000 ($200.00)
    //   → expected Invoice.amountPaid = 44900 ($449.00)
    // The bug produced 24900 ($249.00). This test would fail at HEAD.
    setPayments([
      {
        id: 4929,
        invoiceId: 19036,
        amount: 64900,
        refundedAmount: 20000,
        status: 'PARTIALLY_REFUNDED',
      },
    ]);

    const result = await recomputeInvoiceAmountPaid(19036, mockPrisma);

    expect(result.newAmountPaid).toBe(44900);
    expect(result.newAmountPaid).not.toBe(24900); // explicit guard against the regression
    expect(result.paymentGross).toBe(64900);
    expect(result.paymentRefunded).toBe(20000);
  });

  it('returns 0 for a fully REFUNDED payment (refundedAmount equals amount)', async () => {
    setPayments([
      {
        id: 1,
        invoiceId: 14111,
        amount: 24900,
        refundedAmount: 24900,
        status: 'REFUNDED',
      },
    ]);

    const result = await recomputeInvoiceAmountPaid(14111, mockPrisma);

    expect(result.newAmountPaid).toBe(0);
    expect(result.newAmountPaid).not.toBe(-24900); // never go negative
  });

  it('treats null refundedAmount as 0 (column may be unbackfilled — see B11)', async () => {
    setPayments([
      { id: 1, invoiceId: 5683, amount: 200000, refundedAmount: null, status: 'SUCCEEDED' },
    ]);

    const result = await recomputeInvoiceAmountPaid(5683, mockPrisma);

    expect(result.newAmountPaid).toBe(200000);
    expect(result.paymentRefunded).toBe(0);
  });

  it('ignores FAILED and PENDING payments (only counts settled ones)', async () => {
    setPayments([
      { id: 1, invoiceId: 100, amount: 5000, refundedAmount: 0, status: 'FAILED' },
      { id: 2, invoiceId: 100, amount: 5000, refundedAmount: 0, status: 'PENDING' },
      { id: 3, invoiceId: 100, amount: 5000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);

    const result = await recomputeInvoiceAmountPaid(100, mockPrisma);

    expect(result.newAmountPaid).toBe(5000);
    expect(result.paymentCount).toBe(1); // only SUCCEEDED counted
  });

  it('sums multiple settled payments (e.g. invoice paid in two installments)', async () => {
    setPayments([
      { id: 1, invoiceId: 200, amount: 30000, refundedAmount: 0, status: 'SUCCEEDED' },
      { id: 2, invoiceId: 200, amount: 20000, refundedAmount: 5000, status: 'PARTIALLY_REFUNDED' },
    ]);

    const result = await recomputeInvoiceAmountPaid(200, mockPrisma);

    expect(result.newAmountPaid).toBe(45000); // 30000 + (20000 − 5000)
    expect(result.paymentGross).toBe(50000);
    expect(result.paymentRefunded).toBe(5000);
  });

  it('writes the computed value to Invoice.amountPaid', async () => {
    setPayments([
      { id: 1, invoiceId: 19036, amount: 64900, refundedAmount: 20000, status: 'PARTIALLY_REFUNDED' },
    ]);

    await recomputeInvoiceAmountPaid(19036, mockPrisma);

    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update.mock.calls[0][0]).toEqual({
      where: { id: 19036 },
      data: { amountPaid: 44900 },
    });
  });

  it('is idempotent: calling it twice in a row produces the same Invoice.amountPaid', async () => {
    setPayments([
      { id: 1, invoiceId: 19036, amount: 64900, refundedAmount: 20000, status: 'PARTIALLY_REFUNDED' },
    ]);

    const first = await recomputeInvoiceAmountPaid(19036, mockPrisma);
    const second = await recomputeInvoiceAmountPaid(19036, mockPrisma);

    expect(first.newAmountPaid).toBe(44900);
    expect(second.newAmountPaid).toBe(44900);
    // Both writes wrote the SAME value — that's the whole point of idempotency.
    expect(mockPrisma.invoice.update.mock.calls[0][0].data.amountPaid).toBe(44900);
    expect(mockPrisma.invoice.update.mock.calls[1][0].data.amountPaid).toBe(44900);
  });
});

describe('Refund pipeline — button-then-webhook does NOT double-decrement (regression)', () => {
  /**
   * Simulates the exact production sequence that produced the OT invoice 3213
   * $249 corruption:
   *   1. Staff clicks Refund → POST /api/stripe/refunds runs Writer A
   *   2. Stripe processes the refund and fires charge.refunded
   *   3. Webhook runs Writer B (handleStripeRefund)
   * After the fix, BOTH writers must converge on amountPaid = $449.
   *
   * The Payment row is the only source of truth — once `Payment.refundedAmount`
   * is updated to 20000, both writers compute the same value from it.
   */
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.update.mockResolvedValue({});
  });

  it('after manual refund + webhook, Invoice.amountPaid is $449 (not $249) for a $200 partial refund on a $649 charge', async () => {
    // After Writer A updates Payment.refundedAmount = 20000:
    setPayments([
      {
        id: 4929,
        invoiceId: 19036,
        amount: 64900,
        refundedAmount: 20000,
        status: 'PARTIALLY_REFUNDED',
      },
    ]);

    // Writer A (manual refund API) calls the helper:
    const afterWriterA = await recomputeInvoiceAmountPaid(19036, mockPrisma);
    expect(afterWriterA.newAmountPaid).toBe(44900);

    // Writer B (Stripe webhook) calls the helper. Payment row is unchanged
    // because Writer A already wrote refundedAmount=20000 and Stripe sends
    // cumulative refund amounts (the second event is still amount=20000):
    const afterWriterB = await recomputeInvoiceAmountPaid(19036, mockPrisma);
    expect(afterWriterB.newAmountPaid).toBe(44900);

    // The crucial regression assertion:
    expect(afterWriterB.newAmountPaid).not.toBe(24900);
  });
});
