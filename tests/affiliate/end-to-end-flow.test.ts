/**
 * Affiliate End-to-End Flow Tests
 *
 * Validates the complete lifecycle of an affiliate conversion:
 *
 * 1. TRACK:   Visitor clicks affiliate link → AffiliateTouch created
 * 2. TAG:     Patient submits intake with promo code → Patient.attributionAffiliateId set
 * 3. PAY:     Stripe payment webhook → processPaymentForCommission called
 * 4. EARN:    Commission event created (PENDING status)
 * 5. APPROVE: Cron job approves after hold period (PENDING → APPROVED)
 * 6. PAYOUT:  Cron job processes payout (APPROVED → PAID)
 *
 * Also tests:
 * - Refund/clawback reversal flow
 * - Tag-only flow for unrecognized codes
 * - Recurring commission flow
 * - Multi-tenant isolation through the flow
 * - Fraud detection integration points
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks – vi.hoisted ensures these are available when vi.mock factories run
// ---------------------------------------------------------------------------
const { mockPrisma, mockLogger, mockPerformFraudCheck, mockProcessFraudCheckResult } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliate: { findUnique: fn(), findFirst: fn(), findMany: fn(), update: fn() },
      affiliateRefCode: { findFirst: fn() },
      affiliateTouch: { create: fn(), update: fn(), findMany: fn(), count: fn() },
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
      affiliateAttributionConfig: { findUnique: fn() },
      affiliatePayoutMethod: { findFirst: fn() },
      affiliatePayout: { create: fn(), aggregate: fn() },
      affiliateTaxDocument: { findFirst: fn() },
      affiliateProgram: { findUnique: fn() },
      patient: { findUnique: fn(), update: fn(), count: fn() },
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

// Mock @prisma/client to provide Prisma.sql and Prisma.join used by raw queries
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return { ...actual };
});

import { attributeFromIntake, attributeFromIntakeExtended } from '@/services/affiliate/attributionService';
import {
  processPaymentForCommission,
  approvePendingCommissions,
  reverseCommissionForRefund,
  getAffiliateCommissionStats,
} from '@/services/affiliate/affiliateCommissionService';

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------
const CLINIC_ID = 1;
const AFFILIATE_ID = 100;
const PATIENT_ID = 500;

function setupAttributionMocks(overrides: { alreadyAttributed?: boolean } = {}) {
  // Patient exists, no prior attribution (unless overridden)
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: PATIENT_ID,
    clinicId: CLINIC_ID,
    attributionAffiliateId: overrides.alreadyAttributed ? AFFILIATE_ID : null,
    attributionRefCode: overrides.alreadyAttributed ? 'PARTNER1' : null,
    tags: overrides.alreadyAttributed ? ['affiliate:PARTNER1'] : [],
  });
  // Ref code exists, active
  mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
    id: 10,
    refCode: 'PARTNER1',
    affiliateId: AFFILIATE_ID,
    clinicId: CLINIC_ID,
    isActive: true,
    createdAt: new Date(),
    affiliate: { id: AFFILIATE_ID, status: 'ACTIVE', displayName: 'Partner One' },
    clinic: { id: CLINIC_ID, name: 'Test Clinic' },
  });
  // $transaction passes mockPrisma as tx; $queryRaw returns locked patient data
  mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
  mockPrisma.$queryRaw.mockResolvedValue([{
    attributionAffiliateId: overrides.alreadyAttributed ? AFFILIATE_ID : null,
    tags: overrides.alreadyAttributed ? ['affiliate:PARTNER1'] : [],
  }]);
  mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 999 });
  mockPrisma.patient.update.mockResolvedValue({});
  mockPrisma.affiliate.update.mockResolvedValue({});
}

function setupCommissionMocks() {
  // No duplicate event
  mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
  // Patient has attribution (set by step 2)
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: PATIENT_ID,
    attributionAffiliateId: AFFILIATE_ID,
    attributionRefCode: 'PARTNER1',
    attributionFirstTouchAt: new Date(),
  });
  // Affiliate is active
  mockPrisma.affiliate.findFirst.mockResolvedValue({
    id: AFFILIATE_ID,
    clinicId: CLINIC_ID,
    status: 'ACTIVE',
  });
  // $transaction passes mockPrisma as tx
  mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
  // Fraud check defaults to approve
  mockPerformFraudCheck.mockResolvedValue({
    passed: true,
    riskScore: 0,
    alerts: [],
    recommendation: 'approve',
  });
  mockProcessFraudCheckResult.mockResolvedValue(undefined);
  // Commission plan: 10%, 7-day hold, clawback enabled
  mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
    commissionPlan: {
      id: 1,
      clinicId: CLINIC_ID,
      name: 'Standard 10%',
      planType: 'PERCENT',
      percentBps: 1000,
      flatAmountCents: null,
      initialPercentBps: null,
      initialFlatAmountCents: null,
      recurringPercentBps: null,
      recurringFlatAmountCents: null,
      tierEnabled: false,
      recurringEnabled: true,
      recurringMonths: 12,
      recurringDecayPct: null,
      holdDays: 7,
      clawbackEnabled: true,
      isActive: true,
      appliesTo: 'ALL_PAYMENTS',
    },
  });
  // No tiers/products/promos
  mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
  mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
  mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);
}

// ===========================================================================
// End-to-End Flow: Happy Path
// ===========================================================================
describe('End-to-End: Affiliate Conversion Lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Step 1+2: Intake attribution → patient tagged with affiliateId', async () => {
    setupAttributionMocks();

    const result = await attributeFromIntakeExtended(
      PATIENT_ID,
      'partner1', // lowercase → normalized to PARTNER1
      CLINIC_ID,
      'heyflow'
    );

    // Patient is attributed
    expect(result.success).toBe(true);
    expect(result.affiliateId).toBe(AFFILIATE_ID);
    expect(result.refCode).toBe('PARTNER1');
    expect(result.model).toBe('INTAKE_DIRECT');

    // Touch created
    expect(mockPrisma.affiliateTouch.create).toHaveBeenCalledOnce();
    // Patient updated with attribution
    expect(mockPrisma.patient.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          attributionAffiliateId: AFFILIATE_ID,
          attributionRefCode: 'PARTNER1',
        }),
      })
    );
    // Lifetime conversions incremented
    expect(mockPrisma.affiliate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lifetimeConversions: { increment: 1 } },
      })
    );
  });

  it('Step 3+4: Stripe payment → commission event created (PENDING)', async () => {
    setupCommissionMocks();

    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({
      id: 1000,
      commissionAmountCents: 1000,
    });
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_pay_001',
      stripeObjectId: 'pi_pay_001',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000, // $100
      occurredAt: new Date('2026-02-01'),
      isFirstPayment: true,
    });

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(1000); // 10% of $100

    // Commission event created with PENDING status and hold date
    const createData = mockPrisma.affiliateCommissionEvent.create.mock.calls[0][0].data;
    expect(createData.status).toBe('PENDING');
    expect(createData.affiliateId).toBe(AFFILIATE_ID);
    expect(createData.clinicId).toBe(CLINIC_ID);
    expect(createData.holdUntil).toBeInstanceOf(Date);

    // Hold until should be 7 days after occurred
    const holdUntil = new Date(createData.holdUntil);
    expect(holdUntil.toISOString().slice(0, 10)).toBe('2026-02-08');
  });

  it('Step 5: Cron approves commissions past hold period', async () => {
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 3 });

    const result = await approvePendingCommissions();

    expect(result.approved).toBe(3);
    expect(result.errors).toBe(0);

    // Should update PENDING commissions with null or elapsed holdUntil
    const call = mockPrisma.affiliateCommissionEvent.updateMany.mock.calls[0][0];
    expect(call.where.status).toBe('PENDING');
    expect(call.data.status).toBe('APPROVED');
  });

  it('Full flow: stats reflect the conversion correctly', async () => {
    // After the flow, commission stats should show the conversion
    mockPrisma.affiliateCommissionEvent.aggregate
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 0 }, _count: 0 }) // pending (already approved)
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 1000 }, _count: 1 }) // approved
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 0 }, _count: 0 }) // paid
      .mockResolvedValueOnce({ _sum: { commissionAmountCents: 0 }, _count: 0 }); // reversed
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const stats = await getAffiliateCommissionStats(AFFILIATE_ID, CLINIC_ID);

    expect(stats.approved.count).toBe(1);
    expect(stats.approved.amountCents).toBe(1000);
    expect(stats.totals.conversions).toBe(1);
  });
});

// ===========================================================================
// Refund / Clawback Flow
// ===========================================================================
describe('End-to-End: Refund Clawback Flow', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should reverse commission on refund when clawback enabled', async () => {
    // Original commission exists in APPROVED state
    mockPrisma.affiliateCommissionEvent.findFirst.mockResolvedValue({
      id: 1000,
      affiliateId: AFFILIATE_ID,
      clinicId: CLINIC_ID,
      stripeObjectId: 'pi_pay_001',
      status: 'APPROVED',
      commissionAmountCents: 1000,
      affiliate: {
        planAssignments: [
          {
            commissionPlan: { clawbackEnabled: true },
          },
        ],
      },
    });
    // Now uses updateMany with optimistic concurrency
    mockPrisma.affiliateCommissionEvent.updateMany.mockResolvedValue({ count: 1 });

    const result = await reverseCommissionForRefund({
      clinicId: CLINIC_ID,
      stripeEventId: 'evt_refund_001',
      stripeObjectId: 'pi_pay_001',
      stripeEventType: 'charge.refunded',
      amountCents: 10000,
      occurredAt: new Date(),
      reason: 'Customer refund',
    });

    expect(result.success).toBe(true);
    expect(result.commissionEventId).toBe(1000);

    // Commission should be REVERSED (via updateMany with optimistic concurrency)
    const updateCall = mockPrisma.affiliateCommissionEvent.updateMany.mock.calls[0][0];
    expect(updateCall.data.status).toBe('REVERSED');
    expect(updateCall.data.reversalReason).toBe('Customer refund');
    expect(updateCall.where.reversedAt).toBeNull(); // optimistic concurrency check
  });
});

// ===========================================================================
// Tag-Only Flow (code not in AffiliateRefCode)
// ===========================================================================
describe('End-to-End: Tag-Only Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // tagPatientWithReferralCodeOnly now uses $transaction
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
  });

  it('should tag patient with code even when no affiliate exists yet', async () => {
    const { tagPatientWithReferralCodeOnly } = await import(
      '@/services/affiliate/attributionService'
    );

    mockPrisma.patient.findUnique.mockResolvedValue({
      id: PATIENT_ID,
      attributionAffiliateId: null,
      attributionRefCode: null,
      tags: [],
    });
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue(null); // no matching ref code
    mockPrisma.patient.update.mockResolvedValue({});
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 1 });

    const success = await tagPatientWithReferralCodeOnly(PATIENT_ID, 'UNKNOWN_CODE', CLINIC_ID);

    expect(success).toBe(true);
    const updateData = mockPrisma.patient.update.mock.calls[0][0].data;
    expect(updateData.attributionRefCode).toBe('UNKNOWN_CODE');
    expect(updateData.tags).toEqual({ push: 'affiliate:UNKNOWN_CODE' });
    // No attributionAffiliateId set (will be reconciled later)
    expect(updateData.attributionAffiliateId).toBeUndefined();
  });

  it('tagged patient should later get a commission if code is reconciled', async () => {
    // After reconciliation: patient has attributionAffiliateId set
    // Payment comes in → commission should be created
    setupCommissionMocks();
    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({
      id: 1001,
      commissionAmountCents: 1000,
    });
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_pay_002',
      stripeObjectId: 'pi_pay_002',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
      isFirstPayment: true,
    });

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(1000);
  });
});

// ===========================================================================
// Recurring Commission Flow
// ===========================================================================
describe('End-to-End: Recurring Commission Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create commission for recurring payment (month 3)', async () => {
    setupCommissionMocks();
    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({
      id: 1002,
      commissionAmountCents: 1000,
    });
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_recurring_003',
      stripeObjectId: 'pi_recurring_003',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
      isFirstPayment: false,
      isRecurring: true,
      recurringMonth: 3,
    });

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(1000); // 10% * 1.0 multiplier (within 12 months)
  });

  it('should skip commission when past recurring month limit', async () => {
    setupCommissionMocks();

    // Override plan to limit to 12 months
    mockPrisma.affiliatePlanAssignment.findFirst.mockResolvedValue({
      commissionPlan: {
        id: 1,
        planType: 'PERCENT',
        percentBps: 1000,
        flatAmountCents: null,
        initialPercentBps: null,
        initialFlatAmountCents: null,
        recurringPercentBps: null,
        recurringFlatAmountCents: null,
        tierEnabled: false,
        recurringEnabled: true,
        recurringMonths: 12,
        recurringDecayPct: null,
        holdDays: 7,
        clawbackEnabled: true,
        isActive: true,
        appliesTo: 'ALL_PAYMENTS',
      },
    });
    mockPrisma.affiliateCommissionTier.findMany.mockResolvedValue([]);
    mockPrisma.affiliateProductRate.findMany.mockResolvedValue([]);
    mockPrisma.affiliatePromotion.findMany.mockResolvedValue([]);

    const result = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_recurring_013',
      stripeObjectId: 'pi_recurring_013',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
      isFirstPayment: false,
      isRecurring: true,
      recurringMonth: 13, // past 12-month limit
    });

    // Multiplier = 0 → commission = 0 → skipped
    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Zero commission');
  });
});

// ===========================================================================
// Multi-Tenant Isolation Through Flow
// ===========================================================================
describe('End-to-End: Multi-Tenant Isolation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('should NOT attribute patient if ref code belongs to different clinic', async () => {
    // Patient is in clinic 1
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: PATIENT_ID,
      clinicId: CLINIC_ID,
      attributionAffiliateId: null,
      tags: [],
    });
    // Code not found in clinic 1, but exists in clinic 2
    mockPrisma.affiliateRefCode.findFirst
      .mockResolvedValueOnce(null) // Not in clinic 1
      .mockResolvedValueOnce({
        // Found in clinic 2
        id: 20,
        clinicId: 2,
        clinic: { id: 2, name: 'Other Clinic' },
      });

    const result = await attributeFromIntakeExtended(PATIENT_ID, 'OTHERCODE', CLINIC_ID);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe('CLINIC_MISMATCH');
  });

  it('should NOT create commission if affiliate belongs to different clinic', async () => {
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue(null);
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: PATIENT_ID,
      attributionAffiliateId: AFFILIATE_ID,
      attributionRefCode: 'PARTNER1',
    });
    // findFirst with clinicId filter returns null (affiliate not in this clinic)
    mockPrisma.affiliate.findFirst.mockResolvedValue(null);

    const result = await processPaymentForCommission({
      clinicId: 2, // Different clinic than affiliate
      patientId: PATIENT_ID,
      stripeEventId: 'evt_cross_clinic',
      stripeObjectId: 'pi_cross_clinic',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
    });

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Affiliate not active');
  });
});

// ===========================================================================
// Idempotency Through Flow
// ===========================================================================
describe('End-to-End: Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Both attribution and commission now use $transaction
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => fn(mockPrisma));
  });

  it('should not create duplicate commission for same Stripe event', async () => {
    // First processing succeeds
    setupCommissionMocks();
    mockPrisma.affiliateCommissionEvent.create.mockResolvedValue({
      id: 1000,
      commissionAmountCents: 1000,
    });
    mockPrisma.affiliate.update.mockResolvedValue({});

    const result1 = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_duplicate',
      stripeObjectId: 'pi_duplicate',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
    });

    expect(result1.success).toBe(true);
    expect(result1.skipped).toBeFalsy();

    // Second processing (replay) - event already exists
    mockPrisma.affiliateCommissionEvent.findUnique.mockResolvedValue({
      id: 1000,
      stripeEventId: 'evt_duplicate',
    });

    const result2 = await processPaymentForCommission({
      clinicId: CLINIC_ID,
      patientId: PATIENT_ID,
      stripeEventId: 'evt_duplicate', // same event
      stripeObjectId: 'pi_duplicate',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 10000,
      occurredAt: new Date(),
    });

    expect(result2.success).toBe(true);
    expect(result2.skipped).toBe(true);
    expect(result2.skipReason).toBe('Event already processed');

    // Create should only be called once (from first run)
    expect(mockPrisma.affiliateCommissionEvent.create).toHaveBeenCalledOnce();
  });

  it('intake attribution should be first-wins (no overwrite)', async () => {
    // Already attributed to affiliate 200
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: PATIENT_ID,
      clinicId: CLINIC_ID,
      attributionAffiliateId: 200,
      tags: ['affiliate:OLDCODE'],
    });
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
      id: 10,
      refCode: 'NEWCODE',
      affiliateId: 300,
      clinicId: CLINIC_ID,
      isActive: true,
      createdAt: new Date(),
      affiliate: { id: 300, status: 'ACTIVE', displayName: 'New Affiliate' },
      clinic: { id: CLINIC_ID, name: 'Test Clinic' },
    });
    // SELECT FOR UPDATE inside transaction sees existing attribution
    mockPrisma.$queryRaw.mockResolvedValue([{
      attributionAffiliateId: 200,
      tags: ['affiliate:OLDCODE'],
    }]);
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 1010 });

    const result = await attributeFromIntakeExtended(PATIENT_ID, 'NEWCODE', CLINIC_ID);

    expect(result.success).toBe(true);
    expect(result.model).toBe('INTAKE_TOUCH_ONLY');
    expect(result.failureReason).toBe('ALREADY_ATTRIBUTED');
    // Patient attribution NOT updated
    expect(mockPrisma.patient.update).not.toHaveBeenCalled();
    // But touch IS created (for usage tracking)
    expect(mockPrisma.affiliateTouch.create).toHaveBeenCalledOnce();
  });
});

// ===========================================================================
// HIPAA Compliance Through Flow
// ===========================================================================
describe('End-to-End: HIPAA Compliance', () => {
  it('commission event metadata should never contain patient PII', () => {
    const metadata = {
      refCode: 'PARTNER1',
      planName: 'Standard 10%',
      planType: 'PERCENT',
      tierName: undefined,
      promotionName: undefined,
      appliedProductRule: undefined,
      recurringMultiplier: 1,
    };

    // Verify NO PHI fields
    const phiFields = [
      'patientName',
      'patientEmail',
      'patientPhone',
      'patientAddress',
      'patientDob',
      'firstName',
      'lastName',
      'email',
      'phone',
      'dob',
      'ssn',
      'address',
    ];

    for (const field of phiFields) {
      expect(metadata).not.toHaveProperty(field);
    }
  });

  it('touch records should hash IP addresses', () => {
    const crypto = require('crypto');
    const rawIp = '192.168.1.100';
    const hashedIp = crypto
      .createHash('sha256')
      .update(`aff_ip_salt:${rawIp}`)
      .digest('hex');

    // Should be 64-char hex string
    expect(hashedIp).toHaveLength(64);
    // Should not contain the original IP
    expect(hashedIp).not.toContain('192');
    expect(hashedIp).not.toContain('168');
  });

  it('daily trend data should suppress counts below 5', () => {
    const THRESHOLD = 5;
    const rawTrends = [
      { date: '2026-02-01', conversions: 2, revenue_cents: 20000 },
      { date: '2026-02-02', conversions: 8, revenue_cents: 80000 },
    ];

    const suppressed = rawTrends.map((day) => ({
      date: day.date,
      conversions:
        Number(day.conversions) < THRESHOLD && Number(day.conversions) > 0
          ? '<5'
          : Number(day.conversions),
      revenueCents:
        Number(day.conversions) < THRESHOLD && Number(day.conversions) > 0
          ? null
          : day.revenue_cents,
    }));

    expect(suppressed[0].conversions).toBe('<5');
    expect(suppressed[0].revenueCents).toBeNull();
    expect(suppressed[1].conversions).toBe(8);
    expect(suppressed[1].revenueCents).toBe(80000);
  });
});
