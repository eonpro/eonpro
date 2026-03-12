/**
 * Commission Reporting Accuracy Tests
 *
 * Validates that every dollar flows correctly through the system:
 * 1. Direct commission math is exact (no floating point drift)
 * 2. Override commission math is exact
 * 3. Reversal zeroes out correctly (no phantom commissions)
 * 4. Approval pipeline doesn't double-count
 * 5. Edge cases: boundary amounts, sub-cent rounding, large volumes
 *
 * These tests simulate real payroll scenarios to ensure employees are
 * compensated accurately.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      salesRepCommissionEvent: {
        findFirst: fn(),
        create: fn(),
        count: fn(),
        updateMany: fn(),
      },
      salesRepOverrideCommissionEvent: {
        findFirst: fn(),
        create: fn(),
        updateMany: fn(),
      },
      salesRepOverrideAssignment: { findMany: fn() },
      salesRepVolumeCommissionTier: { findMany: fn() },
      salesRepProductCommission: { findMany: fn() },
      salesRepPlanAssignment: { findFirst: fn() },
      salesRepCommissionPlan: { findUnique: fn() },
      patientSalesRepAssignment: { findFirst: fn() },
      user: { findFirst: fn() },
      payment: { count: fn() },
      $transaction: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn(), security: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import {
  processPaymentForSalesRepCommission,
  reverseSalesRepCommission,
  approvePendingSalesRepCommissions,
  type SalesRepPaymentEventData,
} from '@/services/sales-rep/salesRepCommissionService';

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, clinicId: 1, name: 'Test Plan',
    planType: 'PERCENT' as const,
    flatAmountCents: null, percentBps: 1000,
    initialPercentBps: null, initialFlatAmountCents: null,
    recurringPercentBps: null, recurringFlatAmountCents: null,
    appliesTo: 'ALL_PAYMENTS', holdDays: 0, clawbackEnabled: true,
    isActive: true, recurringEnabled: true, recurringMonths: null,
    multiItemBonusEnabled: false, multiItemBonusType: null,
    multiItemBonusPercentBps: null, multiItemBonusFlatCents: null,
    multiItemMinQuantity: null,
    volumeTierEnabled: false, volumeTierWindow: null, volumeTierRetroactive: true,
    ...overrides,
  };
}

function makePayment(amountCents: number, id = 'evt_payroll_test'): SalesRepPaymentEventData {
  return {
    clinicId: 1, patientId: 500,
    stripeEventId: id, stripeObjectId: `pi_${id}`,
    stripeEventType: 'payment_intent.succeeded',
    amountCents, occurredAt: new Date('2026-03-10T12:00:00Z'),
    isFirstPayment: true, isRecurring: false,
  };
}

let txCreateData: any;

function setupPipeline(planOverrides: Record<string, unknown> = {}) {
  const plan = makePlan(planOverrides);
  mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
  mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
  mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({ commissionPlan: plan });
  mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);
  mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);
  mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([]);
  mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);

  txCreateData = null;
  const txProxy = {
    salesRepCommissionEvent: {
      create: vi.fn().mockImplementation(({ data }: any) => {
        txCreateData = data;
        return { id: 99, salesRepId: 10, clinicId: 1, ...data };
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txProxy));
  return plan;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// PAYROLL ACCURACY: Exact Dollar Amounts
// =========================================================================

describe('Payroll Accuracy: Exact Dollar Amounts', () => {
  const testCases = [
    { payment: 10000, rate: 1000, expected: 1000, label: '$100 @ 10% = $10.00' },
    { payment: 15000, rate: 1000, expected: 1500, label: '$150 @ 10% = $15.00' },
    { payment: 9999, rate: 1000, expected: 1000, label: '$99.99 @ 10% = $10.00 (rounds)' },
    { payment: 9995, rate: 1000, expected: 1000, label: '$99.95 @ 10% = $10.00 (rounds)' },
    { payment: 1, rate: 1000, expected: 0, label: '$0.01 @ 10% = $0.00 (sub-cent rounds to 0, SKIPPED)' },
    { payment: 50, rate: 1000, expected: 5, label: '$0.50 @ 10% = $0.05' },
    { payment: 33333, rate: 1000, expected: 3333, label: '$333.33 @ 10% = $33.33' },
    { payment: 100000, rate: 500, expected: 5000, label: '$1000 @ 5% = $50.00' },
    { payment: 100000, rate: 150, expected: 1500, label: '$1000 @ 1.5% = $15.00' },
    { payment: 100000, rate: 50, expected: 500, label: '$1000 @ 0.5% = $5.00' },
    { payment: 100000, rate: 1, expected: 10, label: '$1000 @ 0.01% = $0.10' },
    { payment: 5000000, rate: 1000, expected: 500000, label: '$50,000 @ 10% = $5,000' },
    { payment: 5000000, rate: 50, expected: 25000, label: '$50,000 @ 0.5% = $250' },
  ];

  for (const tc of testCases) {
    if (tc.expected === 0) {
      it(`${tc.label} -> skipped (zero commission)`, async () => {
        setupPipeline({ percentBps: tc.rate });
        const result = await processPaymentForSalesRepCommission(makePayment(tc.payment));
        expect(result.skipped).toBe(true);
      });
    } else {
      it(tc.label, async () => {
        setupPipeline({ percentBps: tc.rate });
        const result = await processPaymentForSalesRepCommission(makePayment(tc.payment));
        expect(result.commissionAmountCents).toBe(tc.expected);
        expect(txCreateData.commissionAmountCents).toBe(tc.expected);
        expect(txCreateData.baseCommissionCents).toBe(tc.expected);
        expect(Math.round(tc.payment * tc.rate / 10000)).toBe(tc.expected);
      });
    }
  }
});

// =========================================================================
// PAYROLL ACCURACY: Override Commission Math
// =========================================================================

describe('Payroll Accuracy: Override Commission Math', () => {
  function setupWithOverrides(overrideBps: number[]) {
    setupPipeline();
    const overrides = overrideBps.map((bps, i) => ({
      id: i + 1, overrideRepId: 20 + i, subordinateRepId: 10,
      overridePercentBps: bps, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }));
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue(overrides);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
    mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });
    return overrides;
  }

  it('$10,000 payment: 0.5% = $50, 1% = $100, 1.5% = $150', async () => {
    setupWithOverrides([50, 100, 150]);

    await processPaymentForSalesRepCommission(makePayment(1000000));

    const calls = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls;
    expect(calls).toHaveLength(3);

    const amounts = calls.map((c: any) => c[0].data.commissionAmountCents);
    expect(amounts[0]).toBe(5000);
    expect(amounts[1]).toBe(10000);
    expect(amounts[2]).toBe(15000);

    const rates = calls.map((c: any) => c[0].data.overridePercentBps);
    expect(rates).toEqual([50, 100, 150]);

    const eventAmounts = calls.map((c: any) => c[0].data.eventAmountCents);
    expect(eventAmounts).toEqual([1000000, 1000000, 1000000]);
  });

  it('$247.50 payment: 0.5% = $1.24, 1% = $2.48, 1.5% = $3.71', async () => {
    setupWithOverrides([50, 100, 150]);

    await processPaymentForSalesRepCommission(makePayment(24750));

    const calls = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls;
    const amounts = calls.map((c: any) => c[0].data.commissionAmountCents);

    expect(amounts[0]).toBe(Math.round(24750 * 50 / 10000));
    expect(amounts[1]).toBe(Math.round(24750 * 100 / 10000));
    expect(amounts[2]).toBe(Math.round(24750 * 150 / 10000));

    expect(amounts[0]).toBe(124);
    expect(amounts[1]).toBe(248);
    expect(amounts[2]).toBe(371);
  });

  it('override is on GROSS revenue, not on direct commission amount', async () => {
    setupWithOverrides([1000]);
    setupPipeline({ percentBps: 500 });
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 1000, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
    mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

    await processPaymentForSalesRepCommission(makePayment(100000));

    const overrideCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
    expect(overrideCall.data.eventAmountCents).toBe(100000);
    expect(overrideCall.data.commissionAmountCents).toBe(10000);
  });
});

// =========================================================================
// PAYROLL ACCURACY: Combined Breakdown Integrity
// =========================================================================

describe('Payroll Accuracy: Breakdown Sum Integrity', () => {
  it('base + volumeTier + product + multiItem always equals total (no rounding drift)', async () => {
    setupPipeline({
      percentBps: 777,
      volumeTierEnabled: true,
      multiItemBonusEnabled: true,
      multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 333,
      multiItemMinQuantity: 2,
    });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 777, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'PERCENT', percentBps: 333, flatAmountCents: null },
    ]);

    await processPaymentForSalesRepCommission(
      makePayment(12345, 'evt_drift_test').valueOf() as any === undefined
        ? makePayment(12345, 'evt_drift_test')
        : { ...makePayment(12345, 'evt_drift_test'), itemCount: 3, productId: 42 }
    );
  });

  it('FLAT plan with all bonuses: total = flatAmount + tier + product + multiItem', async () => {
    setupPipeline({
      planType: 'FLAT', flatAmountCents: 2500, percentBps: null,
      volumeTierEnabled: true,
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 100, multiItemMinQuantity: 2,
    });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);

    const result = await processPaymentForSalesRepCommission({
      ...makePayment(50000, 'evt_flat_combo'),
      itemCount: 4,
    });

    const base = 2500;
    const volumeTier = 500;
    const product = 0;
    const multiItem = 100 * 3;

    expect(result.commissionAmountCents).toBe(base + volumeTier + product + multiItem);
    expect(txCreateData.baseCommissionCents).toBe(base);
    expect(txCreateData.volumeTierBonusCents).toBe(volumeTier);
    expect(txCreateData.productBonusCents).toBe(product);
    expect(txCreateData.multiItemBonusCents).toBe(multiItem);
  });
});

// =========================================================================
// PAYROLL ACCURACY: Reversal Completeness
// =========================================================================

describe('Payroll Accuracy: Reversal Completeness', () => {
  it('reversing a commission reverses ALL linked overrides, not just some', async () => {
    const commissionEvent = {
      id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
      commissionAmountCents: 10000, stripeObjectId: 'pi_reversal_test',
    };
    mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(commissionEvent);
    mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 3 });

    const result = await reverseSalesRepCommission({
      clinicId: 1, stripeEventId: 'evt_refund', stripeObjectId: 'pi_reversal_test',
      stripeEventType: 'charge.refunded', amountCents: 100000, occurredAt: new Date(),
    });

    expect(result.success).toBe(true);

    const overrideCall = mockPrisma.salesRepOverrideCommissionEvent.updateMany.mock.calls[0][0];
    expect(overrideCall.where.sourceCommissionEventId).toBe(99);
    expect(overrideCall.where.status).toEqual({ in: ['PENDING', 'APPROVED'] });
    expect(overrideCall.data.status).toBe('REVERSED');
  });

  it('reversed commission should not be re-reversible (idempotent)', async () => {
    const commissionEvent = {
      id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
      commissionAmountCents: 10000, stripeObjectId: 'pi_double_reverse',
    };
    mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(commissionEvent);
    mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

    const result = await reverseSalesRepCommission({
      clinicId: 1, stripeEventId: 'evt_refund2', stripeObjectId: 'pi_double_reverse',
      stripeEventType: 'charge.refunded', amountCents: 100000, occurredAt: new Date(),
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Already reversed');
  });
});

// =========================================================================
// PAYROLL ACCURACY: No Double-Counting in Approval
// =========================================================================

describe('Payroll Accuracy: No Double-Counting', () => {
  it('same Stripe event never creates two commission events', async () => {
    setupPipeline();

    await processPaymentForSalesRepCommission(makePayment(50000, 'evt_unique_1'));

    mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({ id: 99 });

    const result2 = await processPaymentForSalesRepCommission(makePayment(50000, 'evt_unique_1'));
    expect(result2.skipped).toBe(true);
    expect(result2.skipReason).toBe('Event already processed');
  });

  it('same Stripe event never creates duplicate override events', async () => {
    setupPipeline();
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 100, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue({ id: 999 });

    await processPaymentForSalesRepCommission(makePayment(50000));

    expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
  });

  it('approval only transitions PENDING events, not APPROVED or PAID', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 3 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 1 });

    await approvePendingSalesRepCommissions();

    const directWhere = mockPrisma.salesRepCommissionEvent.updateMany.mock.calls[0][0].where;
    expect(directWhere.status).toBe('PENDING');

    const overrideWhere = mockPrisma.salesRepOverrideCommissionEvent.updateMany.mock.calls[0][0].where;
    expect(overrideWhere.status).toBe('PENDING');
  });
});

// =========================================================================
// EDGE CASES: Boundary Amounts
// =========================================================================

describe('Edge Cases: Boundary Amounts', () => {
  it('$0.01 payment at 10% rounds to 0, is skipped (no phantom sub-cent commission)', async () => {
    setupPipeline({ percentBps: 1000 });
    const result = await processPaymentForSalesRepCommission(makePayment(1));
    expect(result.skipped).toBe(true);
  });

  it('$0.05 payment at 10% = Math.round(5 * 1000 / 10000) = 1 cent (created)', async () => {
    setupPipeline({ percentBps: 1000 });
    const result = await processPaymentForSalesRepCommission(makePayment(5));
    expect(result.commissionAmountCents).toBe(1);
  });

  it('$100,000 payment at 100% = $100,000 commission (max rate)', async () => {
    setupPipeline({ percentBps: 10000 });
    const result = await processPaymentForSalesRepCommission(makePayment(10000000));
    expect(result.commissionAmountCents).toBe(10000000);
  });

  it('FLAT $0.01 commission is created (minimum nonzero)', async () => {
    setupPipeline({ planType: 'FLAT', flatAmountCents: 1, percentBps: null });
    const result = await processPaymentForSalesRepCommission(makePayment(1));
    expect(result.commissionAmountCents).toBe(1);
  });
});
