/**
 * Refund Webhook → Payment Columns Regression Test
 * =================================================
 *
 * Why this exists:
 * The OT clinic reconciliation report (and every revenue/sales report) computes
 * `netCollectedCents = max(0, Payment.amount - Payment.refundedAmount)`.
 *
 * Previously `handleStripeRefund()` only stamped `metadata.refund.amount` and
 * left `Payment.refundedAmount` / `Payment.refundedAt` as `null`, so refunds
 * issued from the Stripe Dashboard (which arrive via `charge.refunded` webhook)
 * were silently invisible in the OT cash-collected total — overstating cash by
 * the full refund amount.
 *
 * These tests enforce that `handleStripeRefund` writes the columns the reports
 * actually read, on the same call path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `vi.mock` is hoisted above imports, so factory-referenced state must be
// declared inside `vi.hoisted` to be initialized at hoist time.
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    payment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (client: unknown) => unknown) => fn(mockPrisma)),
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

import {
  handleStripeRefund,
  extractRefundDataFromCharge,
} from '@/services/stripe/paymentMatchingService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePayment(overrides: Record<string, unknown> = {}) {
  return {
    id: 5001,
    amount: 24900,
    refundedAmount: null,
    refundedAt: null,
    status: 'SUCCEEDED',
    stripeChargeId: 'ch_test_full',
    stripePaymentIntentId: 'pi_test_full',
    metadata: {},
    invoice: null,
    ...overrides,
  };
}

function makeRefundData(overrides: Record<string, unknown> = {}) {
  return {
    chargeId: 'ch_test_full',
    paymentIntentId: 'pi_test_full',
    refundId: 're_test_1',
    amount: 24900,
    reason: 'requested_by_customer' as const,
    status: 'refunded',
    refundedAt: new Date('2026-04-19T22:00:00Z'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleStripeRefund — populates Payment.refundedAmount / refundedAt columns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.payment.update.mockResolvedValue({});
    mockPrisma.invoice.update.mockResolvedValue({});
  });

  it('writes refundedAmount and refundedAt as columns (not just metadata) on full refund', async () => {
    const payment = makePayment();
    mockPrisma.payment.findFirst.mockResolvedValue(payment);

    const refundData = makeRefundData({ amount: 24900 });
    const result = await handleStripeRefund(refundData, 'evt_test_1');

    expect(result.success).toBe(true);
    expect(mockPrisma.payment.update).toHaveBeenCalledTimes(1);

    const updateArgs = mockPrisma.payment.update.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: payment.id });
    expect(updateArgs.data).toMatchObject({
      status: 'REFUNDED',
      refundedAmount: 24900,
      refundedAt: refundData.refundedAt,
    });
    // Metadata is preserved alongside the columns (defense-in-depth, not in lieu of).
    expect(updateArgs.data.metadata.refund).toMatchObject({
      refundId: 're_test_1',
      amount: 24900,
      stripeEventId: 'evt_test_1',
    });
  });

  it('writes the cumulative refundedAmount and PARTIALLY_REFUNDED status on partial refund', async () => {
    const payment = makePayment({ amount: 50000 });
    mockPrisma.payment.findFirst.mockResolvedValue(payment);

    const refundData = makeRefundData({ amount: 12500, refundId: 're_test_partial' });
    const result = await handleStripeRefund(refundData);

    expect(result.success).toBe(true);
    const updateArgs = mockPrisma.payment.update.mock.calls[0][0];
    expect(updateArgs.data).toMatchObject({
      status: 'PARTIALLY_REFUNDED',
      refundedAmount: 12500,
      refundedAt: refundData.refundedAt,
    });
  });

  it('overwrites refundedAmount with the latest cumulative total on a second refund event for the same charge', async () => {
    /**
     * Stripe sends `amount_refunded` as a cumulative total. If two partial refunds
     * fire ($50, then $75), the second event arrives with amount=12500 (cumulative),
     * not 7500 (delta). The handler must overwrite, not increment.
     */
    const payment = makePayment({
      amount: 50000,
      refundedAmount: 5000, // first partial refund already recorded
      status: 'PARTIALLY_REFUNDED',
    });
    mockPrisma.payment.findFirst.mockResolvedValue(payment);

    const refundData = makeRefundData({ amount: 12500, refundId: 're_test_partial_2' });
    await handleStripeRefund(refundData, 'evt_test_2');

    const updateArgs = mockPrisma.payment.update.mock.calls[0][0];
    expect(updateArgs.data.refundedAmount).toBe(12500);
    expect(updateArgs.data.status).toBe('PARTIALLY_REFUNDED');
  });

  it('returns failure (and writes nothing) when no Payment row matches the charge', async () => {
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    const result = await handleStripeRefund(makeRefundData());
    expect(result.success).toBe(false);
    expect(mockPrisma.payment.update).not.toHaveBeenCalled();
  });
});

describe('extractRefundDataFromCharge', () => {
  it('returns null for a charge with no refunds', () => {
    const charge = {
      id: 'ch_test',
      refunded: false,
      amount_refunded: 0,
      payment_intent: 'pi_test',
      refunds: { data: [] },
    } as unknown as Stripe.Charge;

    expect(extractRefundDataFromCharge(charge)).toBeNull();
  });

  it('returns the cumulative amount_refunded with the latest refund metadata', () => {
    const charge = {
      id: 'ch_test',
      refunded: true,
      amount_refunded: 24900,
      payment_intent: 'pi_test',
      refunds: {
        data: [
          {
            id: 're_latest',
            reason: 'requested_by_customer',
            created: 1745083200, // 2026-04-19T16:00:00Z
          },
        ],
      },
    } as unknown as Stripe.Charge;

    const refundData = extractRefundDataFromCharge(charge);
    expect(refundData).not.toBeNull();
    expect(refundData!.amount).toBe(24900);
    expect(refundData!.refundId).toBe('re_latest');
    expect(refundData!.chargeId).toBe('ch_test');
    expect(refundData!.paymentIntentId).toBe('pi_test');
  });
});
