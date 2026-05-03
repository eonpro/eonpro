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

const { mockPrisma } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj: any = {
    payment: {
      findMany: vi.fn(),
    },
    invoice: {
      update: vi.fn(async () => ({})),
      // Default findUnique returns 0 for previousAmountPaid; specific tests
      // override via mockResolvedValueOnce when they care about delta/Sentry.
      findUnique: vi.fn(async () => ({ amountPaid: 0 })),
    },
  };
  obj.$transaction = vi.fn(async (fn: (client: unknown) => unknown) => fn(obj));
  return { mockPrisma: obj };
});

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

const { mockEmitWarningAlert } = vi.hoisted(() => ({
  mockEmitWarningAlert: vi.fn(),
}));

vi.mock('@/lib/observability/sentry-alerts', () => ({
  emitWarningAlert: mockEmitWarningAlert,
  emitCriticalAlert: vi.fn(),
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

describe('Sentry tripwire on drift correction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.invoice.update.mockResolvedValue({});
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 0 });
    mockEmitWarningAlert.mockReset();
  });

  it('does NOT fire when caller=webhook and value already correct (no drift)', async () => {
    setPayments([
      { id: 1, invoiceId: 1, amount: 64900, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 64900 });

    await recomputeInvoiceAmountPaid(1, mockPrisma, { caller: 'webhook' });

    expect(mockEmitWarningAlert).not.toHaveBeenCalled();
  });

  it('does NOT fire when delta is within $1 (DRIFT_TRIPWIRE_CENTS noise floor)', async () => {
    setPayments([
      { id: 1, invoiceId: 1, amount: 64950, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 64900 }); // 50¢ drift

    await recomputeInvoiceAmountPaid(1, mockPrisma, { caller: 'webhook' });

    expect(mockEmitWarningAlert).not.toHaveBeenCalled();
  });

  it('FIRES when caller=webhook and we found > $1 of drift (regression signal)', async () => {
    // Simulates the exact production regression: webhook arrives, helper
    // recomputes, finds Invoice.amountPaid was wrong by $200 — that means
    // the upstream pipeline drifted and the tripwire should page on-call.
    setPayments([
      { id: 4929, invoiceId: 19036, amount: 64900, refundedAmount: 20000, status: 'PARTIALLY_REFUNDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 24900 }); // the corrupt $249 value

    const result = await recomputeInvoiceAmountPaid(19036, mockPrisma, { caller: 'webhook' });

    expect(result.previousAmountPaid).toBe(24900);
    expect(result.newAmountPaid).toBe(44900);
    expect(result.delta).toBe(20000);
    expect(mockEmitWarningAlert).toHaveBeenCalledTimes(1);
    const [title, details] = mockEmitWarningAlert.mock.calls[0];
    expect(title).toContain('Invoice.amountPaid drift');
    expect(details).toMatchObject({
      regression: 'ot-refund-double-decrement',
      invoiceId: 19036,
      caller: 'webhook',
      previousAmountPaid_cents: 24900,
      newAmountPaid_cents: 44900,
      delta_cents: 20000,
    });
  });

  it('FIRES when caller=manual_refund and we found > $1 of drift', async () => {
    setPayments([
      { id: 1, invoiceId: 1, amount: 100000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 50000 });

    await recomputeInvoiceAmountPaid(1, mockPrisma, { caller: 'manual_refund' });

    expect(mockEmitWarningAlert).toHaveBeenCalledTimes(1);
    expect(mockEmitWarningAlert.mock.calls[0][1]).toMatchObject({ caller: 'manual_refund' });
  });

  it('does NOT fire when caller=backfill (operator script EXPECTS drift)', async () => {
    // Backfill scripts are explicitly correcting historical drift; firing
    // a Sentry warning for every backfilled row would flood the on-call
    // channel with noise.
    setPayments([
      { id: 1, invoiceId: 1, amount: 100000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 50000 });

    await recomputeInvoiceAmountPaid(1, mockPrisma, { caller: 'backfill' });

    expect(mockEmitWarningAlert).not.toHaveBeenCalled();
  });

  it('does NOT fire when caller is omitted (defensive default for unknown callers)', async () => {
    // The current behavior is: only known live-pipeline callers fire the
    // tripwire. If a caller forgets to pass `caller`, we err on the side of
    // silence to avoid false-positive pages. (If you want a louder default
    // later, change `isLivePipeline` in the helper.)
    setPayments([
      { id: 1, invoiceId: 1, amount: 100000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 50000 });

    await recomputeInvoiceAmountPaid(1, mockPrisma);

    expect(mockEmitWarningAlert).not.toHaveBeenCalled();
  });

  it('still writes Invoice.amountPaid even when the tripwire throws (observability is non-fatal)', async () => {
    // If Sentry is mis-configured or the SDK throws, the refund path must
    // still complete. The data correctness invariant takes precedence over
    // the alerting signal.
    mockEmitWarningAlert.mockImplementation(() => {
      throw new Error('Sentry SDK boom');
    });
    setPayments([
      { id: 1, invoiceId: 1, amount: 100000, refundedAmount: 0, status: 'SUCCEEDED' },
    ]);
    mockPrisma.invoice.findUnique.mockResolvedValue({ amountPaid: 0 });

    const result = await recomputeInvoiceAmountPaid(1, mockPrisma, { caller: 'webhook' });

    expect(result.newAmountPaid).toBe(100000);
    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
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
