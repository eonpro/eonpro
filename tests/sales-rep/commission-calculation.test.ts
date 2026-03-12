/**
 * Sales Rep Commission Calculation Tests
 *
 * Deep tests for all calculation logic:
 * 1. Base commission (FLAT vs PERCENT, rounding, null/zero)
 * 2. Initial vs recurring rate differentiation and fallback
 * 3. Volume tier resolution (boundaries, open-ended, retroactive)
 * 4. Product/bundle bonus (FLAT/PERCENT, first match wins)
 * 5. Multi-item bonus (FLAT per extra item, PERCENT, min quantity)
 * 6. Full breakdown sum: base + volumeTier + product + multiItem = total
 *
 * All tests drive the internal calculations via processPaymentForSalesRepCommission
 * with carefully mocked DB state to isolate each calculation path.
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
  checkIfFirstPaymentForSalesRep,
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

function makePaymentEvent(overrides: Partial<SalesRepPaymentEventData> = {}): SalesRepPaymentEventData {
  return {
    clinicId: 1, patientId: 500,
    stripeEventId: `evt_calc_${Date.now()}`, stripeObjectId: 'pi_calc_test',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 50000, occurredAt: new Date('2026-03-10T12:00:00Z'),
    isFirstPayment: true, isRecurring: false,
    ...overrides,
  };
}

let txProxy: any;

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

  txProxy = {
    salesRepCommissionEvent: {
      create: vi.fn().mockImplementation(({ data }: any) => ({
        id: 99, salesRepId: 10, clinicId: 1, ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txProxy));
  return plan;
}

function getCreatedEventData() {
  return txProxy.salesRepCommissionEvent.create.mock.calls[0]?.[0]?.data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// =========================================================================
// BASE COMMISSION MATH
// =========================================================================

describe('Base Commission Calculation', () => {
  it('PERCENT plan: 10% of $500 = $50.00 (5000 cents)', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 1000 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 50000 }));

    expect(result.commissionAmountCents).toBe(5000);
    expect(getCreatedEventData().baseCommissionCents).toBe(5000);
  });

  it('FLAT plan: $25.00 flat per sale regardless of amount', async () => {
    setupPipeline({ planType: 'FLAT', flatAmountCents: 2500, percentBps: null });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 99999 }));

    expect(result.commissionAmountCents).toBe(2500);
    expect(getCreatedEventData().baseCommissionCents).toBe(2500);
  });

  it('PERCENT rounding: 3.33% of $100.01 = Math.round(10001 * 333 / 10000) = 333 cents', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 333 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 10001 }));

    const expected = Math.round(10001 * 333 / 10000);
    expect(expected).toBe(333);
    expect(result.commissionAmountCents).toBe(expected);
  });

  it('PERCENT: 0.5% of $1000 = $5.00', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 50 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

    expect(result.commissionAmountCents).toBe(500);
  });

  it('skips when PERCENT percentBps is null (yields 0)', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: null });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent());

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Zero commission calculated');
  });

  it('skips when FLAT flatAmountCents is null (yields 0)', async () => {
    setupPipeline({ planType: 'FLAT', flatAmountCents: null, percentBps: null });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent());

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Zero commission calculated');
  });

  it('skips when PERCENT percentBps is 0 (yields 0)', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 0 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent());

    expect(result.skipped).toBe(true);
  });
});

// =========================================================================
// INITIAL vs RECURRING RATE DIFFERENTIATION
// =========================================================================

describe('Initial vs Recurring Rate Differentiation', () => {
  it('uses initialPercentBps for non-recurring payment when set', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 1000, initialPercentBps: 1500 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, isRecurring: false })
    );

    expect(result.commissionAmountCents).toBe(1500);
  });

  it('uses recurringPercentBps for recurring payment when set', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 1000, recurringPercentBps: 500 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, isRecurring: true })
    );

    expect(result.commissionAmountCents).toBe(500);
  });

  it('falls back to percentBps when initialPercentBps is null', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 1000, initialPercentBps: null });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, isRecurring: false })
    );

    expect(result.commissionAmountCents).toBe(1000);
  });

  it('falls back to percentBps when recurringPercentBps is null', async () => {
    setupPipeline({ planType: 'PERCENT', percentBps: 1000, recurringPercentBps: null });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, isRecurring: true })
    );

    expect(result.commissionAmountCents).toBe(1000);
  });

  it('FLAT: uses initialFlatAmountCents for non-recurring', async () => {
    setupPipeline({ planType: 'FLAT', flatAmountCents: 2000, initialFlatAmountCents: 3000 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isRecurring: false })
    );

    expect(result.commissionAmountCents).toBe(3000);
  });

  it('FLAT: uses recurringFlatAmountCents for recurring', async () => {
    setupPipeline({ planType: 'FLAT', flatAmountCents: 2000, recurringFlatAmountCents: 1000 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isRecurring: true })
    );

    expect(result.commissionAmountCents).toBe(1000);
  });
});

// =========================================================================
// VOLUME TIER RESOLUTION
// =========================================================================

describe('Volume Tier Resolution', () => {
  it('adds volume tier bonus when volumeTierEnabled', async () => {
    setupPipeline({ volumeTierEnabled: true, volumeTierWindow: 'CALENDAR_WEEK_MON_SUN' });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(result.commissionAmountCents).toBe(1000 + 500);
    expect(getCreatedEventData().volumeTierBonusCents).toBe(500);
  });

  it('no bonus when volumeTierEnabled is false', async () => {
    setupPipeline({ volumeTierEnabled: false });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().volumeTierBonusCents).toBe(0);
  });

  it('selects correct tier at boundary: 9th sale falls in 9-20 tier', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: 8, amountCents: 500, sortOrder: 0 },
      { id: 2, planId: 1, minSales: 9, maxSales: 20, amountCents: 1000, sortOrder: 1 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(8);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().volumeTierBonusCents).toBe(1000);
  });

  it('open-ended tier (maxSales=null) matches counts above all defined tiers', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: 10, amountCents: 500, sortOrder: 0 },
      { id: 2, planId: 1, minSales: 11, maxSales: null, amountCents: 1500, sortOrder: 1 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(50);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().volumeTierBonusCents).toBe(1500);
  });

  it('returns null tier bonus when no tiers match (count 0, no tier for sale 1)', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 5, maxSales: 10, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().volumeTierBonusCents).toBe(0);
    expect(result.commissionAmountCents).toBe(1000);
  });

  it('returns no tier bonus when tier list is empty', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().volumeTierBonusCents).toBe(0);
  });
});

// =========================================================================
// PRODUCT/BUNDLE BONUS
// =========================================================================

describe('Product/Bundle Bonus', () => {
  it('adds PERCENT product bonus when productId matches', async () => {
    setupPipeline();
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'PERCENT', percentBps: 500, flatAmountCents: null },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, productId: 42 })
    );

    expect(getCreatedEventData().productBonusCents).toBe(500);
    expect(result.commissionAmountCents).toBe(1000 + 500);
  });

  it('adds FLAT product bonus when productId matches', async () => {
    setupPipeline();
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'FLAT', percentBps: null, flatAmountCents: 750 },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, productId: 42 })
    );

    expect(getCreatedEventData().productBonusCents).toBe(750);
  });

  it('matches by productBundleId', async () => {
    setupPipeline();
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: null, productBundleId: 7, bonusType: 'FLAT', percentBps: null, flatAmountCents: 1000 },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, productBundleId: 7 })
    );

    expect(getCreatedEventData().productBonusCents).toBe(1000);
  });

  it('returns 0 when no productId or productBundleId provided', async () => {
    setupPipeline();
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'FLAT', percentBps: null, flatAmountCents: 1000 },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().productBonusCents).toBe(0);
  });

  it('returns 0 when productId does not match any rule', async () => {
    setupPipeline();
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'FLAT', percentBps: null, flatAmountCents: 1000 },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, productId: 999 })
    );

    expect(getCreatedEventData().productBonusCents).toBe(0);
  });
});

// =========================================================================
// MULTI-ITEM BONUS
// =========================================================================

describe('Multi-Item Bonus', () => {
  it('FLAT bonus: 3 items, $5/extra = $5 * (3-1) = $10', async () => {
    setupPipeline({
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 500, multiItemMinQuantity: 2,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 3 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(1000);
    expect(result.commissionAmountCents).toBe(1000 + 1000);
  });

  it('PERCENT bonus: 4 items, 2% of $100 = $2', async () => {
    setupPipeline({
      multiItemBonusEnabled: true, multiItemBonusType: 'PERCENT',
      multiItemBonusPercentBps: 200, multiItemMinQuantity: 2,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 4 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(200);
  });

  it('no bonus when disabled', async () => {
    setupPipeline({ multiItemBonusEnabled: false });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 5 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(0);
  });

  it('no bonus when itemCount below minimum', async () => {
    setupPipeline({
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 500, multiItemMinQuantity: 3,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 2 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(0);
  });

  it('default minQuantity is 2 when multiItemMinQuantity is null', async () => {
    setupPipeline({
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 500, multiItemMinQuantity: null,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 2 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(500);
  });

  it('itemCount defaults to 1 when undefined (no bonus)', async () => {
    setupPipeline({
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 500, multiItemMinQuantity: 2,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000 })
    );

    expect(getCreatedEventData().multiItemBonusCents).toBe(0);
  });
});

// =========================================================================
// FULL BREAKDOWN SUM
// =========================================================================

describe('Full Commission Breakdown', () => {
  it('total = base + volumeTier + product + multiItem', async () => {
    setupPipeline({
      planType: 'PERCENT', percentBps: 1000,
      volumeTierEnabled: true,
      multiItemBonusEnabled: true, multiItemBonusType: 'FLAT',
      multiItemBonusFlatCents: 300, multiItemMinQuantity: 2,
    });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);
    mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([
      { id: 1, planId: 1, productId: 42, productBundleId: null, bonusType: 'FLAT', percentBps: null, flatAmountCents: 200 },
    ]);

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ amountCents: 10000, itemCount: 3, productId: 42 })
    );

    const data = getCreatedEventData();
    const base = 1000;
    const volumeTier = 500;
    const product = 200;
    const multiItem = 300 * 2;

    expect(data.baseCommissionCents).toBe(base);
    expect(data.volumeTierBonusCents).toBe(volumeTier);
    expect(data.productBonusCents).toBe(product);
    expect(data.multiItemBonusCents).toBe(multiItem);
    expect(data.commissionAmountCents).toBe(base + volumeTier + product + multiItem);
    expect(result.commissionAmountCents).toBe(base + volumeTier + product + multiItem);
  });
});

// =========================================================================
// checkIfFirstPaymentForSalesRep
// =========================================================================

describe('checkIfFirstPaymentForSalesRep', () => {
  it('returns true when no prior payments', async () => {
    mockPrisma.payment.count.mockResolvedValue(0);

    const result = await checkIfFirstPaymentForSalesRep(500);

    expect(result).toBe(true);
  });

  it('returns false when prior payments exist', async () => {
    mockPrisma.payment.count.mockResolvedValue(2);

    const result = await checkIfFirstPaymentForSalesRep(500);

    expect(result).toBe(false);
  });

  it('excludes current payment from count', async () => {
    mockPrisma.payment.count.mockResolvedValue(0);

    await checkIfFirstPaymentForSalesRep(500, 'pi_current');

    expect(mockPrisma.payment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          patientId: 500,
          stripePaymentIntentId: { not: 'pi_current' },
        }),
      })
    );
  });
});
