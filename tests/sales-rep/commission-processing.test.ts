/**
 * Sales Rep Commission Processing Pipeline Tests
 *
 * Tests the full payment -> commission event creation flow:
 * 1. processPaymentForSalesRepCommission: idempotency, skip conditions, happy path
 * 2. Hold period calculation
 * 3. Override commission trigger after direct commission creation
 * 4. P2002 unique-constraint race handling
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
      clinic: { findUnique: fn() },
      user: { findFirst: fn() },
      payment: { count: fn() },
      $transaction: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn(), security: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/utils/timezone', () => ({
  getDatePartsInTz: () => ({ year: 2026, month: 2, day: 10, dayOfWeek: 2 }),
  midnightInTz: (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 5, 0, 0)),
}));

import {
  processPaymentForSalesRepCommission,
  type SalesRepPaymentEventData,
} from '@/services/sales-rep/salesRepCommissionService';

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, clinicId: 1, name: 'Standard 10%',
    planType: 'PERCENT' as const,
    flatAmountCents: null, percentBps: 1000,
    initialPercentBps: null, initialFlatAmountCents: null,
    recurringPercentBps: null, recurringFlatAmountCents: null,
    appliesTo: 'ALL_PAYMENTS', holdDays: 7, clawbackEnabled: true,
    isActive: true, recurringEnabled: true, recurringMonths: null,
    multiItemBonusEnabled: false, multiItemBonusType: null,
    multiItemBonusPercentBps: null, multiItemBonusFlatCents: null,
    multiItemMinQuantity: null,
    volumeTierEnabled: false, volumeTierWindow: null, volumeTierRetroactive: true,
    volumeTierBasis: 'SALE_COUNT',
    reactivationDays: null,
    ...overrides,
  };
}

function makePaymentEvent(overrides: Partial<SalesRepPaymentEventData> = {}): SalesRepPaymentEventData {
  return {
    clinicId: 1, patientId: 500,
    stripeEventId: 'evt_test_123', stripeObjectId: 'pi_test_123',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 50000, occurredAt: new Date('2026-03-10T12:00:00Z'),
    isFirstPayment: true, isRecurring: false,
    ...overrides,
  };
}

function setupHappyPath(planOverrides: Record<string, unknown> = {}) {
  const plan = makePlan(planOverrides);
  mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
  mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
  mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({ commissionPlan: plan });
  mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);
  mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);
  mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([]);
  mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/New_York' });

  const createdEvent = { id: 99, salesRepId: 10, clinicId: 1, commissionAmountCents: 5000 };
  const txProxy = {
    salesRepCommissionEvent: {
      create: vi.fn().mockResolvedValue(createdEvent),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txProxy));

  return { plan, createdEvent, txProxy };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('processPaymentForSalesRepCommission', () => {
  describe('happy path', () => {
    it('creates a commission event for a PERCENT plan', async () => {
      const { createdEvent } = setupHappyPath();

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
      expect(result.commissionEventId).toBe(99);
      expect(result.commissionAmountCents).toBe(5000);
    });

    it('creates a commission event for a FLAT plan', async () => {
      setupHappyPath({ planType: 'FLAT', flatAmountCents: 2500, percentBps: null });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.commissionAmountCents).toBe(2500);
    });

    it('passes correct hold date when holdDays > 0', async () => {
      const { txProxy } = setupHappyPath({ holdDays: 7 });
      const occurredAt = new Date('2026-03-10T12:00:00Z');

      await processPaymentForSalesRepCommission(makePaymentEvent({ occurredAt }));

      const createCall = txProxy.salesRepCommissionEvent.create.mock.calls[0][0];
      const expectedHold = new Date(occurredAt.getTime() + 7 * 86400000);
      expect(createCall.data.holdUntil).toEqual(expectedHold);
    });

    it('sets holdUntil to null when holdDays is 0', async () => {
      const { txProxy } = setupHappyPath({ holdDays: 0 });

      await processPaymentForSalesRepCommission(makePaymentEvent());

      const createCall = txProxy.salesRepCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.holdUntil).toBeNull();
    });

    it('stores the correct breakdown fields on the event', async () => {
      const { txProxy } = setupHappyPath();

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 50000 }));

      const createCall = txProxy.salesRepCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.baseCommissionCents).toBe(5000);
      expect(createCall.data.volumeTierBonusCents).toBe(0);
      expect(createCall.data.productBonusCents).toBe(0);
      expect(createCall.data.multiItemBonusCents).toBe(0);
      expect(createCall.data.commissionAmountCents).toBe(5000);
      expect(createCall.data.status).toBe('PENDING');
    });
  });

  describe('idempotency', () => {
    it('skips when stripeEventId already processed', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({ id: 50 });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Event already processed');
      expect(result.commissionEventId).toBe(50);
    });

    it('handles P2002 unique constraint race condition', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 51 });
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({ commissionPlan: makePlan() });
      mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);
      mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);
      mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/New_York' });

      const p2002Error = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrisma.$transaction.mockRejectedValue(p2002Error);

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Event already processed (constraint)');
      expect(result.commissionEventId).toBe(51);
    });
  });

  describe('skip conditions', () => {
    it('skips when no sales rep assigned to patient', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('No sales rep assigned to patient');
    });

    it('skips when sales rep is not active', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Assigned employee not active or not eligible for commission');
    });

    it('skips when no active commission plan exists', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue(null);

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('No active commission plan');
    });

    it('skips when plan is inactive', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({
        commissionPlan: makePlan({ isActive: false }),
      });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('No active commission plan');
    });

    it('skips FIRST_PAYMENT_ONLY plan for non-first, non-recurring payment', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({
        commissionPlan: makePlan({ appliesTo: 'FIRST_PAYMENT_ONLY' }),
      });

      const result = await processPaymentForSalesRepCommission(
        makePaymentEvent({ isFirstPayment: false, isRecurring: false })
      );

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Plan only applies to first payment');
    });

    it('does NOT skip FIRST_PAYMENT_ONLY for first payment', async () => {
      setupHappyPath({ appliesTo: 'FIRST_PAYMENT_ONLY' });

      const result = await processPaymentForSalesRepCommission(
        makePaymentEvent({ isFirstPayment: true })
      );

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
    });

    it('skips recurring payment when recurringEnabled is false', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
      mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
      mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({
        commissionPlan: makePlan({ recurringEnabled: false }),
      });

      const result = await processPaymentForSalesRepCommission(
        makePaymentEvent({ isRecurring: true })
      );

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Recurring commissions not enabled on plan');
    });

    it('skips when calculated commission is zero', async () => {
      setupHappyPath({ percentBps: 0 });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Zero commission calculated');
    });
  });

  describe('override trigger', () => {
    it('calls processOverrideCommissions after creating direct event', async () => {
      const overrideAssignment = {
        id: 1, overrideRepId: 20, subordinateRepId: 10,
        overridePercentBps: 150, clinicId: 1, isActive: true,
        effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
      };
      setupHappyPath();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([overrideAssignment]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

      expect(mockPrisma.salesRepOverrideAssignment.findMany).toHaveBeenCalled();
      expect(mockPrisma.salesRepOverrideCommissionEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            overrideRepId: 20,
            subordinateRepId: 10,
            eventAmountCents: 100000,
            overridePercentBps: 150,
            commissionAmountCents: 1500,
            status: 'PENDING',
          }),
        })
      );
    });

    it('does not create overrides when none are assigned', async () => {
      setupHappyPath();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([]);

      await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns error result on unexpected exceptions', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockRejectedValue(new Error('DB down'));

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
    });
  });
});
