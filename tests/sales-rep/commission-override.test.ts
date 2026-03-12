/**
 * Sales Rep Override Commission Tests
 *
 * Tests the override commission logic where manager reps earn a % of
 * subordinate rep's gross revenue. Tested via processPaymentForSalesRepCommission
 * since processOverrideCommissions is an internal (non-exported) function.
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
  type SalesRepPaymentEventData,
} from '@/services/sales-rep/salesRepCommissionService';

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, clinicId: 1, name: 'Standard 10%',
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
    stripeEventId: 'evt_override_test', stripeObjectId: 'pi_override_test',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 100000, occurredAt: new Date('2026-03-10T12:00:00Z'),
    isFirstPayment: true, isRecurring: false,
    ...overrides,
  };
}

function setupDirectCommission() {
  const plan = makePlan();
  mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
  mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({ salesRepId: 10 });
  mockPrisma.user.findFirst.mockResolvedValue({ id: 10 });
  mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({ commissionPlan: plan });
  mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);
  mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);

  const createdEvent = { id: 99, salesRepId: 10, clinicId: 1, commissionAmountCents: 10000 };
  const txProxy = {
    salesRepCommissionEvent: {
      create: vi.fn().mockResolvedValue(createdEvent),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txProxy));
  return { plan, createdEvent };
}

function makeOverrideAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: 1, overrideRepId: 20, subordinateRepId: 10,
    overridePercentBps: 150, clinicId: 1, isActive: true,
    effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Override Commission Logic', () => {
  describe('happy path', () => {
    it('creates override event with correct calculation: $1000 * 1.5% = $15', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 150 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.commissionAmountCents).toBe(1500);
      expect(createCall.data.overridePercentBps).toBe(150);
      expect(createCall.data.eventAmountCents).toBe(100000);
      expect(createCall.data.overrideRepId).toBe(20);
      expect(createCall.data.subordinateRepId).toBe(10);
      expect(createCall.data.sourceCommissionEventId).toBe(99);
    });

    it('creates override at 0.5%: $1000 * 50bps = $5.00', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 50 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 201 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

      const createCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.commissionAmountCents).toBe(500);
    });

    it('creates override at 1.0%: $1000 * 100bps = $10.00', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 100 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 202 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

      const createCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.commissionAmountCents).toBe(1000);
    });
  });

  describe('multiple override managers', () => {
    it('creates separate override events for each manager', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ id: 1, overrideRepId: 20, overridePercentBps: 50 }),
        makeOverrideAssignment({ id: 2, overrideRepId: 21, overridePercentBps: 100 }),
        makeOverrideAssignment({ id: 3, overrideRepId: 22, overridePercentBps: 150 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 100000 }));

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).toHaveBeenCalledTimes(3);
      const amounts = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls.map(
        (c: any) => c[0].data.commissionAmountCents
      );
      expect(amounts).toEqual([500, 1000, 1500]);
    });
  });

  describe('skip conditions', () => {
    it('skips when no override assignments exist', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([]);

      await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
    });

    it('skips when override event already exists (idempotency)', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment(),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue({ id: 999 });

      await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
    });

    it('silently handles P2002 unique constraint race on override create', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment(),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrisma.salesRepOverrideCommissionEvent.create.mockRejectedValue(p2002);

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
    });

    it('skips override when calculated amount is zero (tiny payment)', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 1 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 5 }));

      expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('rounding accuracy', () => {
    it('rounds correctly: $333.33 payment * 1.5% = Math.round(33333 * 150 / 10000) = $5.00', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 150 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 203 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 33333 }));

      const createCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.commissionAmountCents).toBe(Math.round(33333 * 150 / 10000));
      expect(createCall.data.commissionAmountCents).toBe(500);
    });

    it('handles large payment: $50,000 * 0.5% = $250', async () => {
      setupDirectCommission();
      mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([
        makeOverrideAssignment({ overridePercentBps: 50 }),
      ]);
      mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
      mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 204 });

      await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 5000000 }));

      const createCall = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0];
      expect(createCall.data.commissionAmountCents).toBe(25000);
    });
  });
});
