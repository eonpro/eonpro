/**
 * Affiliate Commission Processing Pipeline Tests
 *
 * Tests the full payment → commission event creation flow:
 * 1. processPaymentForCommission: idempotency, attribution lookup, plan lookup, calculation, event creation
 * 2. calculateEnhancedCommission: initial vs recurring rates, tiers, product rates, promotions
 * 3. reverseCommissionForRefund: clawback logic
 * 4. approvePendingCommissions: hold-period approval
 * 5. Recurring commission multiplier and decay
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------
const { mockPrisma, mockLogger, mockPerformFraudCheck, mockProcessFraudCheckResult } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliate: { findUnique: fn(), findFirst: fn(), update: fn() },
      affiliateCommissionEvent: {
        findUnique: fn(),
        findFirst: fn(),
        create: fn(),
        update: fn(),
        updateMany: fn(),
        aggregate: fn(),
      },
      affiliateCommissionTier: { findMany: fn() },
      affiliateProductRate: { findMany: fn() },
      affiliatePromotion: { findMany: fn(), update: fn(), updateMany: fn() },
      affiliatePlanAssignment: { findFirst: fn() },
      patient: { findUnique: fn() },
      payment: { count: fn() },
      $queryRaw: fn(),
      $transaction: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn() },
    mockPerformFraudCheck: fn(),
    mockProcessFraudCheckResult: fn(),
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/observability/request-context', () => ({ getRequestId: () => 'test-req-id' }));
vi.mock('@/services/affiliate/fraudDetectionService', () => ({
  performFraudCheck: mockPerformFraudCheck,
  processFraudCheckResult: mockProcessFraudCheckResult,
}));

import {
  calculateCommission,
  calculateEnhancedCommission,
  processPaymentForCommission,
  reverseCommissionForRefund,
  approvePendingCommissions,
  getEffectiveCommissionPlan,
  checkIfFirstPayment,
  getAffiliateCommissionStats,
  updateAffiliateLifetimeStats,
  type PaymentEventData,
  type RefundEventData,
} from '@/services/affiliate/affiliateCommissionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: 1,
    name: 'Standard 10%',
    planType: 'PERCENT' as const,
    flatAmountCents: null,
    percentBps: 1000, // 10%
    initialPercentBps: null,
    initialFlatAmountCents: null,
    recurringPercentBps: null,
    recurringFlatAmountCents: null,
    tierEnabled: false,
    recurringEnabled: false,
    recurringMonths: null,
    recurringDecayPct: null,
    holdDays: 7,
    clawbackEnabled: true,
    isActive: true,
    appliesTo: 'ALL_PAYMENTS',
    ...overrides,
  };
}

function makePaymentEvent(overrides: Partial<PaymentEventData> = {}): PaymentEventData {
  return {
    clinicId: 1,
    patientId: 500,
    stripeEventId: 'evt_test_123',
    stripeObjectId: 'pi_test_123',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 10000, // $100
    occurredAt: new Date('2026-02-01'),
    isFirstPayment: true,
    isRecurring: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// calculateCommission (unit)
// ---------------------------------------------------------------------------
describe('calculateCommission (base)', () => {
  it('FLAT: returns fixed amount regardless of event amount', () => {
    expect(calculateCommission(5000, 'FLAT', 2500, null)).toBe(2500);
    expect(calculateCommission(100000, 'FLAT', 2500, null)).toBe(2500);
  });

  it('PERCENT: correctly converts basis points', () => {
    // 10% of $100 = $10
    expect(calculateCommission(10000, 'PERCENT', null, 1000)).toBe(1000);
    // 15% of $200 = $30
    expect(calculateCommission(20000, 'PERCENT', null, 1500)).toBe(3000);
    // 5% of $50 = $2.50
    expect(calculateCommission(5000, 'PERCENT', null, 500)).toBe(250);
  });

  it('handles edge: 0 bps = 0 commission', () => {
    expect(calculateCommission(10000, 'PERCENT', null, 0)).toBe(0);
  });

  it('handles edge: null rates return 0', () => {
    expect(calculateCommission(10000, 'FLAT', null, null)).toBe(0);
    expect(calculateCommission(10000, 'PERCENT', null, null)).toBe(0);
  });

  it('rounds correctly for non-integer results', () => {
    // 10% of $33.33 = $3.333 → rounds to $3.33
    expect(calculateCommission(3333, 'PERCENT', null, 1000)).toBe(333);
    // 7% of $99.99 = $6.9993 → rounds to $7.00
    expect(calculateCommission(9999, 'PERCENT', null, 700)).toBe(700);
  });
});

// ---------------------------------------------------------------------------
// calculateEnhancedCommission (with tiers, products, promos)
// ---------------------------------------------------------------------------
describe('calculateEnhancedCommission', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should calculate base commission with default plan rates', async () => {
    // No tiers, no products, no promotions
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const result = await calculateEnhancedCommission(
      100, // affiliateId
      1, // clinicId
      makePlan(),
      10000, // $100 payment
      { isFirstPayment: true }
    );

    expect(result.baseCommissionCents).toBe(1000); // 10% of $100
    expect(result.tierBonusCents).toBe(0);
    expect(result.promotionBonusCents).toBe(0);
    expect(result.productAdjustmentCents).toBe(0);
    expect(result.totalCommissionCents).toBe(1000);
    expect(result.recurringMultiplier).toBe(1);
  });

  it('should use initial-specific rates for first payments', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const plan = makePlan({
      percentBps: 1000, // default 10%
      initialPercentBps: 2000, // initial 20%
      recurringPercentBps: 500, // recurring 5%
    });

    const result = await calculateEnhancedCommission(100, 1, plan, 10000, {
      isFirstPayment: true,
    });

    // Should use initialPercentBps = 20%
    expect(result.baseCommissionCents).toBe(2000);
    expect(result.totalCommissionCents).toBe(2000);
  });

  it('should use recurring-specific rates for recurring payments', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const plan = makePlan({
      percentBps: 1000, // default 10%
      initialPercentBps: 2000, // initial 20%
      recurringPercentBps: 500, // recurring 5%
      recurringEnabled: true,
    });

    const result = await calculateEnhancedCommission(100, 1, plan, 10000, {
      isRecurring: true,
      recurringMonth: 2,
    });

    // Should use recurringPercentBps = 5%
    expect(result.baseCommissionCents).toBe(500);
  });

  it('should apply tier bonus when tier is enabled and affiliate qualifies', async () => {
    mockPrisma.affiliate.findUnique.mockResolvedValue({
      lifetimeConversions: 50,
      lifetimeRevenueCents: 500000, // $5000
    });
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([
      {
        id: 1,
        level: 2,
        name: 'Gold',
        minConversions: 25,
        minRevenueCents: 250000,
        percentBps: 1500, // 15% override
        flatAmountCents: null,
        bonusCents: 5000, // $50 one-time bonus
      },
      {
        id: 2,
        level: 1,
        name: 'Silver',
        minConversions: 10,
        minRevenueCents: 100000,
        percentBps: 1200,
        flatAmountCents: null,
        bonusCents: 1000,
      },
    ]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const result = await calculateEnhancedCommission(
      100,
      1,
      makePlan({ tierEnabled: true }),
      10000,
      { isFirstPayment: true }
    );

    // Should use Gold tier's 15% override
    expect(result.baseCommissionCents).toBe(1500);
    expect(result.tierBonusCents).toBe(5000);
    expect(result.tierName).toBe('Gold');
    expect(result.totalCommissionCents).toBe(1500 + 5000);
  });

  it('should apply product-specific rate override', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([
      {
        id: 1,
        productSku: 'TRT-MONTHLY',
        productCategory: null,
        minPriceCents: null,
        maxPriceCents: null,
        percentBps: 2000, // 20% for this product
        flatAmountCents: null,
        priority: 10,
        isActive: true,
      },
    ]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const result = await calculateEnhancedCommission(100, 1, makePlan(), 10000, {
      productSku: 'TRT-MONTHLY',
    });

    // Product override should be used: 20% of $100 = $20
    expect(result.baseCommissionCents).toBe(2000);
    expect(result.appliedProductRule).toBe('SKU: TRT-MONTHLY');
  });

  it('should add promotional bonus', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Summer Bonus',
        bonusPercentBps: 500, // +5% bonus
        bonusFlatCents: 200, // +$2 flat
        maxUses: 100,
        usesCount: 10,
        minOrderCents: null,
        affiliateIds: null,
        refCodes: null,
        startsAt: new Date('2026-01-01'),
        endsAt: new Date('2026-12-31'),
        isActive: true,
      },
    ]);

    const result = await calculateEnhancedCommission(100, 1, makePlan(), 10000, {
      isFirstPayment: true,
    });

    // base = 10% of $100 = $10
    // promo = 5% of $100 + $2 = $5 + $2 = $7
    expect(result.baseCommissionCents).toBe(1000);
    expect(result.promotionBonusCents).toBe(700);
    expect(result.totalCommissionCents).toBe(1700);
    expect(result.promotionName).toBe('Summer Bonus');

    // appliedPromotionIds should contain the promotion ID for caller to increment usage
    expect(result.appliedPromotionIds).toContain(1);
  });

  it('should not apply promotion that has reached maxUses', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([
      {
        id: 1,
        name: 'Limited',
        bonusFlatCents: 500,
        bonusPercentBps: null,
        maxUses: 10,
        usesCount: 10, // already at max
        minOrderCents: null,
        affiliateIds: null,
        refCodes: null,
        startsAt: new Date('2026-01-01'),
        endsAt: new Date('2026-12-31'),
        isActive: true,
      },
    ]);

    const result = await calculateEnhancedCommission(100, 1, makePlan(), 10000);

    expect(result.promotionBonusCents).toBe(0);
  });

  it('should apply recurring decay after month 12', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const plan = makePlan({
      recurringEnabled: true,
      recurringMonths: 24,
      recurringDecayPct: 50, // 50% after year 1
    });

    const result = await calculateEnhancedCommission(100, 1, plan, 10000, {
      isRecurring: true,
      recurringMonth: 15, // past month 12
    });

    // 10% of $100 = $10 * 0.5 (decay) = $5
    expect(result.baseCommissionCents).toBe(1000);
    expect(result.recurringMultiplier).toBe(0.5);
    expect(result.totalCommissionCents).toBe(500);
  });

  it('should return 0 multiplier when recurring month exceeds limit', async () => {
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const plan = makePlan({
      recurringEnabled: true,
      recurringMonths: 12, // 12 month limit
      recurringDecayPct: null,
    });

    const result = await calculateEnhancedCommission(100, 1, plan, 10000, {
      isRecurring: true,
      recurringMonth: 13, // past limit
    });

    expect(result.recurringMultiplier).toBe(0);
    expect(result.totalCommissionCents).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// processPaymentForCommission
// ---------------------------------------------------------------------------
describe('processPaymentForCommission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Commission creation now happens inside $transaction — pass mockPrisma as tx
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
    // Fraud check defaults to "approve" for most tests
    mockPerformFraudCheck.mockResolvedValue({
      passed: true,
      riskScore: 0,
      alerts: [],
      recommendation: 'approve',
    });
    mockProcessFraudCheckResult.mockResolvedValue(undefined);
  });

  it('should skip if event already processed (idempotency)', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue({
      id: 999,
      stripeEventId: 'evt_test_123',
    });

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Event already processed');
    expect(result.commissionEventId).toBe(999);
    // Should NOT create a new event
    expect(mockPrisma.affiliateCommissionEvent.create).not.toHaveBeenCalled();
  });

  it('should skip if patient has no affiliate attribution', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: null,
      attributionRefCode: null,
    });

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No affiliate attribution');
  });

  it('should skip if affiliate is not active', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue(null); // Not found (inactive or different clinic)

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Affiliate not active');
  });

  it('should skip if no active commission plan exists', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue({ id: 100, clinicId: 1, status: 'ACTIVE' });
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue(null); // No plan

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No active commission plan');
  });

  it('should skip recurring payments when recurring commissions disabled', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue({ id: 100, clinicId: 1, status: 'ACTIVE' });
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: makePlan({ recurringEnabled: false }),
    });

    const result = await processPaymentForCommission(
      makePaymentEvent({ isRecurring: true, isFirstPayment: false })
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Recurring commissions not enabled');
  });

  it('should create commission event for valid payment', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue({ id: 100, clinicId: 1, status: 'ACTIVE' });
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: makePlan(),
    });
    // No tiers/products/promos
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);
    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({
      id: 1000,
      commissionAmountCents: 1000,
    });
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBeFalsy();
    expect(result.commissionEventId).toBe(1000);
    expect(result.commissionAmountCents).toBe(1000); // 10% of $100

    // Fraud check should have been called
    expect(mockPerformFraudCheck).toHaveBeenCalledOnce();

    // Commission creation happens inside $transaction
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();

    // Verify commission event was created with correct data
    const createCall = mockPrisma.affiliateCommissionEvent.create.mock.calls[0][0].data;
    expect(createCall.clinicId).toBe(1);
    expect(createCall.affiliateId).toBe(100);
    expect(createCall.stripeEventId).toBe('evt_test_123');
    expect(createCall.eventAmountCents).toBe(10000);
    expect(createCall.commissionAmountCents).toBe(1000);
    expect(createCall.status).toBe('PENDING');
    expect(createCall.holdUntil).toBeInstanceOf(Date);

    // HIPAA: metadata should NOT contain patient data
    expect(createCall.metadata.refCode).toBe('PARTNER1');
    expect(createCall.metadata).not.toHaveProperty('patientName');
    expect(createCall.metadata).not.toHaveProperty('patientEmail');
    // Fraud check metadata should be present
    expect(createCall.metadata.fraudCheck).toBeDefined();

    // Affiliate stats should be updated inside the transaction
    expect(mockPrisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        lifetimeConversions: { increment: 1 },
        lifetimeRevenueCents: { increment: 10000 },
      },
    });
  });

  it('should skip if commission calculates to 0', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue({ id: 100, clinicId: 1, status: 'ACTIVE' });
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: makePlan({ percentBps: 0, flatAmountCents: 0 }),
    });
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Zero commission');
  });

  it('should calculate hold date based on plan holdDays', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 500,
      attributionAffiliateId: 100,
      attributionRefCode: 'PARTNER1',
    });
    mockPrisma.affiliate.findFirst.mockResolvedValue({ id: 100, clinicId: 1, status: 'ACTIVE' });
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: makePlan({ holdDays: 14 }),
    });
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);
    // Commission event creation happens inside $transaction
    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({ id: 1001, commissionAmountCents: 1000 });
    mockPrisma.affiliate.update.mockResolvedValue({});

    await processPaymentForCommission(
      makePaymentEvent({ occurredAt: new Date('2026-02-01') })
    );

    // create is called inside the transaction
    const createData = mockPrisma.affiliateCommissionEvent.create.mock.calls[0][0].data;
    const holdUntil = new Date(createData.holdUntil);
    const expected = new Date('2026-02-15'); // 14 days after Feb 1
    expect(holdUntil.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
  });

  it('should handle database errors gracefully', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockRejectedValue(
      new Error('Connection refused')
    );

    const result = await processPaymentForCommission(makePaymentEvent());

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection refused');
  });
});

// ---------------------------------------------------------------------------
// reverseCommissionForRefund
// ---------------------------------------------------------------------------
describe('reverseCommissionForRefund', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reverse commission when clawback is enabled', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 1000,
      affiliateId: 100,
      stripeObjectId: 'pi_test_123',
      status: 'PENDING',
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: true } },
        ],
      },
    });
    // Now uses updateMany with optimistic concurrency (reversedAt: null check)
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await reverseCommissionForRefund({
      clinicId: 1,
      stripeEventId: 'evt_refund_123',
      stripeObjectId: 'pi_test_123',
      stripeEventType: 'charge.refunded',
      amountCents: 10000,
      occurredAt: new Date(),
      reason: 'Customer requested refund',
    });

    expect(result.success).toBe(true);
    expect(result.commissionEventId).toBe(1000);

    // Verify updateMany was called with optimistic concurrency (reversedAt: null)
    const call = mockPrisma.affiliateCommissionEvent.updateMany.mock.calls[0][0];
    expect(call.where.id).toBe(1000);
    expect(call.where.reversedAt).toBeNull();
    expect(call.data.status).toBe('REVERSED');
    expect(call.data.reversedAt).toBeInstanceOf(Date);
    expect(call.data.reversalReason).toBe('Customer requested refund');
  });

  it('should skip reversal if clawback is disabled', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 1000,
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: false } },
        ],
      },
    });

    const result = await reverseCommissionForRefund({
      clinicId: 1,
      stripeEventId: 'evt_refund_123',
      stripeObjectId: 'pi_test_123',
      stripeEventType: 'charge.refunded',
      amountCents: 10000,
      occurredAt: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Clawback not enabled');
  });

  it('should skip if no matching commission event found', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue(null);

    const result = await reverseCommissionForRefund({
      clinicId: 1,
      stripeEventId: 'evt_refund_123',
      stripeObjectId: 'pi_unknown',
      stripeEventType: 'charge.refunded',
      amountCents: 10000,
      occurredAt: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No commission event found');
  });
});

// ---------------------------------------------------------------------------
// approvePendingCommissions
// ---------------------------------------------------------------------------
describe('approvePendingCommissions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should approve all commissions past hold period', async () => {
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 5 });

    const result = await approvePendingCommissions();

    expect(result.approved).toBe(5);
    expect(result.errors).toBe(0);

    const call = mockPrisma.affiliateCommissionEvent.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe('PENDING');
    expect(call.data.status).toBe('APPROVED');
    expect(call.data.approvedAt).toBeInstanceOf(Date);
  });

  it('should handle database errors', async () => {
    mockPrisma.affiliateCommissionEvent.updateMany.mockRejectedValue(new Error('DB error'));

    const result = await approvePendingCommissions();

    expect(result.approved).toBe(0);
    expect(result.errors).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getEffectiveCommissionPlan
// ---------------------------------------------------------------------------
describe('getEffectiveCommissionPlan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return the plan effective at the given date', async () => {
    const plan = makePlan();
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: plan,
    });

    const result = await getEffectiveCommissionPlan(100, 1, new Date());

    expect(result).toEqual(plan);
  });

  it('should return null if no assignment exists', async () => {
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue(null);

    const result = await getEffectiveCommissionPlan(100, 1, new Date());
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// checkIfFirstPayment
// ---------------------------------------------------------------------------
describe('checkIfFirstPayment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return true when no prior payments exist', async () => {
    mockPrisma.payment.count.mockResolvedValue(0);
    expect(await checkIfFirstPayment(500)).toBe(true);
  });

  it('should return false when prior payments exist', async () => {
    mockPrisma.payment.count.mockResolvedValue(2);
    expect(await checkIfFirstPayment(500)).toBe(false);
  });

  it('should exclude current payment by stripePaymentIntentId', async () => {
    mockPrisma.payment.count.mockResolvedValue(0);
    await checkIfFirstPayment(500, 'pi_current');

    expect(mockPrisma.payment.count).toHaveBeenCalledWith({
      where: {
        patientId: 500,
        status: 'SUCCEEDED',
        stripePaymentIntentId: { not: 'pi_current' },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// updateAffiliateLifetimeStats
// ---------------------------------------------------------------------------
describe('updateAffiliateLifetimeStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should increment both conversions and revenue', async () => {
    mockPrisma.affiliate.update.mockResolvedValue({});

    await updateAffiliateLifetimeStats(100, 15000);

    expect(mockPrisma.affiliate.update).toHaveBeenCalledWith({
      where: { id: 100 },
      data: {
        lifetimeConversions: { increment: 1 },
        lifetimeRevenueCents: { increment: 15000 },
      },
    });
  });
});

// ---------------------------------------------------------------------------
// reverseCommissionForRefund — Idempotency Tests
// ---------------------------------------------------------------------------
describe('reverseCommissionForRefund — idempotency', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should return idempotent success when commission already reversed', async () => {
    // Simulate finding a commission event with clawback enabled
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 500,
      affiliateId: 100,
      clinicId: 1,
      status: 'PENDING',
      reversedAt: null,
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: true } },
        ],
      },
    });

    // The updateMany with WHERE reversedAt IS NULL returns count=0
    // if the commission was already reversed by a concurrent request
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

    const refundData: RefundEventData = {
      clinicId: 1,
      stripeObjectId: 'pi_test123',
      stripeEventType: 'charge.refunded',
      reason: 'customer_requested',
    };

    const result = await reverseCommissionForRefund(refundData);

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Already reversed');
  });

  it('should successfully reverse a non-reversed commission', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 500,
      affiliateId: 100,
      clinicId: 1,
      status: 'PENDING',
      reversedAt: null,
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: true } },
        ],
      },
    });

    // updateMany returns count=1 — successfully reversed
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 1 });

    const refundData: RefundEventData = {
      clinicId: 1,
      stripeObjectId: 'pi_test456',
      stripeEventType: 'charge.refunded',
      reason: 'fraudulent',
    };

    const result = await reverseCommissionForRefund(refundData);

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.commissionEventId).toBe(500);
  });

  it('should use updateMany with optimistic concurrency (status check + reversedAt IS NULL)', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 500,
      affiliateId: 100,
      clinicId: 1,
      status: 'APPROVED',
      reversedAt: null,
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: true } },
        ],
      },
    });

    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 1 });

    const refundData: RefundEventData = {
      clinicId: 1,
      stripeObjectId: 'pi_test789',
      stripeEventType: 'charge.refunded',
    };

    await reverseCommissionForRefund(refundData);

    // Verify the WHERE clause includes both status and reversedAt checks
    expect(mockPrisma.affiliateCommissionEvent.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 500,
          status: { in: ['PENDING', 'APPROVED'] },
          reversedAt: null,
        }),
        data: expect.objectContaining({
          status: 'REVERSED',
          reversedAt: expect.any(Date),
        }),
      })
    );
  });

  it('should skip when no commission event found for the refund', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue(null);

    const result = await reverseCommissionForRefund({
      clinicId: 1,
      stripeObjectId: 'pi_nonexistent',
      stripeEventType: 'charge.refunded',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No commission event found');
  });

  it('should skip when clawback is not enabled', async () => {
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 500,
      affiliateId: 100,
      clinicId: 1,
      affiliate: {
        planAssignments: [
          { commissionPlan: { clawbackEnabled: false } },
        ],
      },
    });

    const result = await reverseCommissionForRefund({
      clinicId: 1,
      stripeObjectId: 'pi_noclawback',
      stripeEventType: 'charge.refunded',
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Clawback not enabled');
  });
});
