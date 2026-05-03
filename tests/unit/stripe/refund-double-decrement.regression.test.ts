/**
 * Regression test for OT invoice 3213 / INV-19036 / pi_3TOk6oDQIH4O9Fhr05obILJx.
 *
 * Reproduces the button-then-webhook sequence end-to-end through the real
 * `handleStripeRefund` entry point, asserting that the canonical
 * $649 charge / $200 partial refund leaves `Invoice.amountPaid = $449`,
 * NOT $249 as it did at HEAD on 2026-05-02.
 *
 * If this test ever fails again, someone has reintroduced a direct
 * `Invoice.amountPaid` mutation (decrement / arithmetic from the current
 * value) instead of going through `recomputeInvoiceAmountPaid`. See the
 * RCA at `~/.cursor/plans/ot-invoice-3213-rca.md` for the full context.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, paymentRowState } = vi.hoisted(() => {
  // Mutable Payment row that mirrors what the production DB would hold
  // after the manual refund API has run. The webhook then calls
  // `recomputeInvoiceAmountPaid`, which queries this mutable state.
  const paymentRowState = {
    id: 4929,
    invoiceId: 19036,
    amount: 64900,
    refundedAmount: 0 as number | null,
    refundedAt: null as Date | null,
    status: 'SUCCEEDED' as
      | 'SUCCEEDED'
      | 'PARTIALLY_REFUNDED'
      | 'REFUNDED',
    stripeChargeId: 'ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
    stripePaymentIntentId: 'pi_3TOk6oDQIH4O9Fhr05obILJx',
    metadata: {} as Record<string, unknown>,
    invoice: {
      id: 19036,
      amount: 64900,
      amountPaid: 64900, // initial: fully paid before any refund
      metadata: {} as Record<string, unknown>,
    },
  };

  // Track every Invoice.amountPaid write so the test can assert the FINAL
  // stored value, not just whether update was called.
  const invoiceAmountPaidWrites: number[] = [];

  // Pass implementations as constructor args (vi.fn(impl)) — in some
  // vitest configurations chained .mockImplementation() set inside
  // vi.hoisted() can be lost. Constructor-arg form is bullet-proof.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mockPrisma: any = {
    payment: {
      findFirst: vi.fn(async () => paymentRowState),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (typeof args.data.refundedAmount === 'number') {
          paymentRowState.refundedAmount = args.data.refundedAmount;
        }
        if (args.data.refundedAt instanceof Date) {
          paymentRowState.refundedAt = args.data.refundedAt;
        }
        if (args.data.status === 'PARTIALLY_REFUNDED' || args.data.status === 'REFUNDED') {
          paymentRowState.status = args.data.status;
        }
        return paymentRowState;
      }),
      findMany: vi.fn(
        async (
          args:
            | { where?: { invoiceId?: number; status?: { in?: string[] } } }
            | undefined
        ) => {
          const statusIn = args?.where?.status?.in;
          if (
            args?.where?.invoiceId !== paymentRowState.invoiceId ||
            (statusIn && !statusIn.includes(paymentRowState.status))
          ) {
            return [];
          }
          return [
            {
              amount: paymentRowState.amount,
              refundedAmount: paymentRowState.refundedAmount,
            },
          ];
        }
      ),
    },
    invoice: {
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        if (typeof args.data.amountPaid === 'number') {
          paymentRowState.invoice.amountPaid = args.data.amountPaid;
          invoiceAmountPaidWrites.push(args.data.amountPaid);
        }
        return paymentRowState.invoice;
      }),
    },
  };
  // Self-referential: the $transaction handler must invoke the function
  // with `mockPrisma` itself so spy calls land on the same vi.fn() instances
  // the test asserts against.
  mockPrisma.$transaction = vi.fn(async (fn: (client: unknown) => unknown) => fn(mockPrisma));
  return { mockPrisma, paymentRowState, invoiceAmountPaidWrites };
});

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  basePrisma: mockPrisma,
  getClinicContext: vi.fn(() => null),
}));

vi.mock('@/lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), security: vi.fn() },
}));

import { handleStripeRefund } from '@/services/stripe/paymentMatchingService';
import { recomputeInvoiceAmountPaid } from '@/services/billing/recomputeInvoiceAmountPaid';

describe('REGRESSION: OT invoice 3213 ($649 charge, $200 partial refund) → amountPaid must be $449', () => {
  beforeEach(() => {
    // Reset to "fresh, fully paid" state before each scenario.
    paymentRowState.refundedAmount = 0;
    paymentRowState.refundedAt = null;
    paymentRowState.status = 'SUCCEEDED';
    paymentRowState.metadata = {};
    paymentRowState.invoice.amountPaid = 64900;
    paymentRowState.invoice.metadata = {};
    // NOTE: do NOT call vi.clearAllMocks() / vi.resetAllMocks() here — both
    // wipe the carefully-constructed mockImplementation on payment.findMany
    // etc., causing them to return undefined and break the helper. State
    // reset is handled manually above.
  });

  it('button (manual API) THEN webhook → amountPaid is $449 (not $249)', async () => {
    // ---- Step 1: manual refund button (Writer A) ----
    // Simulate what `POST /api/stripe/refunds` does after the Stripe refund
    // succeeds: update the Payment row, then recompute the invoice.
    await mockPrisma.$transaction(async (tx: typeof mockPrisma) => {
      await tx.payment.update({
        where: { id: paymentRowState.id },
        data: {
          status: 'PARTIALLY_REFUNDED',
          refundedAmount: 20000,
          refundedAt: new Date('2026-04-27T20:26:31Z'),
          stripeRefundId: 're_3TOk6oDQIH4O9Fhr0q3q41bZ',
        },
      });
      await recomputeInvoiceAmountPaid(paymentRowState.invoiceId, tx);
    });

    expect(paymentRowState.invoice.amountPaid).toBe(44900);

    // ---- Step 2: charge.refunded webhook (Writer B) ----
    // Stripe sends `amount_refunded` as the cumulative total — same 20000
    // as the button click, NOT a delta.
    const result = await handleStripeRefund(
      {
        chargeId: 'ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
        paymentIntentId: 'pi_3TOk6oDQIH4O9Fhr05obILJx',
        refundId: 'refund_ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
        amount: 20000,
        reason: null,
        status: 'partially_refunded',
        refundedAt: new Date('2026-04-27T20:26:31Z'),
      },
      'evt_3TOk6oDQIH4O9Fhr0d4ECtGP'
    );

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe(19036);

    // ---- The crucial assertion ----
    // After both writers: Invoice.amountPaid must be $449.00, the Stripe net.
    expect(paymentRowState.invoice.amountPaid).toBe(44900);

    // Explicit guards against the production-observed regression:
    expect(paymentRowState.invoice.amountPaid).not.toBe(24900); // double-decrement
    expect(paymentRowState.invoice.amountPaid).toBeGreaterThanOrEqual(0); // never negative
  });

  it('webhook-only (Stripe Dashboard refund) → amountPaid is $449', async () => {
    // Simulates a refund initiated directly from the Stripe Dashboard:
    // only the webhook fires, no button click. This path was correct
    // before the fix; this test ensures we didn't break it.
    const result = await handleStripeRefund(
      {
        chargeId: 'ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
        paymentIntentId: 'pi_3TOk6oDQIH4O9Fhr05obILJx',
        refundId: 'refund_dashboard',
        amount: 20000,
        reason: null,
        status: 'partially_refunded',
        refundedAt: new Date('2026-04-27T20:26:31Z'),
      },
      'evt_dashboard_refund'
    );

    expect(result.success).toBe(true);
    expect(paymentRowState.invoice.amountPaid).toBe(44900);
  });

  it('webhook re-delivered (idempotency) → amountPaid stays at $449', async () => {
    // Stripe occasionally re-delivers webhooks. The handler must be safe.
    await handleStripeRefund(
      {
        chargeId: 'ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
        paymentIntentId: 'pi_3TOk6oDQIH4O9Fhr05obILJx',
        refundId: 'refund_redelivery',
        amount: 20000,
        reason: null,
        status: 'partially_refunded',
        refundedAt: new Date('2026-04-27T20:26:31Z'),
      },
      'evt_redelivery'
    );
    expect(paymentRowState.invoice.amountPaid).toBe(44900);

    await handleStripeRefund(
      {
        chargeId: 'ch_3TOk6oDQIH4O9Fhr0Uhpf5KB',
        paymentIntentId: 'pi_3TOk6oDQIH4O9Fhr05obILJx',
        refundId: 'refund_redelivery',
        amount: 20000, // Stripe sends cumulative; same value on re-delivery
        reason: null,
        status: 'partially_refunded',
        refundedAt: new Date('2026-04-27T20:26:31Z'),
      },
      'evt_redelivery'
    );
    expect(paymentRowState.invoice.amountPaid).toBe(44900);
  });
});
