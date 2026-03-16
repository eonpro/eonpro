/**
 * Sales Rep Commission Reversal & Approval Tests
 *
 * Tests:
 * 1. reverseSalesRepCommission: clawback policy, status checks, override cascade
 * 2. approvePendingSalesRepCommissions: hold period, dual approval (direct + override)
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
  reverseSalesRepCommission,
  approvePendingSalesRepCommissions,
  type SalesRepRefundEventData,
} from '@/services/sales-rep/salesRepCommissionService';

function makeRefundEvent(overrides: Partial<SalesRepRefundEventData> = {}): SalesRepRefundEventData {
  return {
    clinicId: 1,
    stripeEventId: 'evt_refund_test',
    stripeObjectId: 'pi_test_123',
    stripeEventType: 'charge.refunded',
    amountCents: 50000,
    occurredAt: new Date('2026-03-10T14:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('reverseSalesRepCommission', () => {
  describe('happy path', () => {
    it('reverses commission event and linked override events', async () => {
      const commissionEvent = {
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        commissionAmountCents: 5000, stripeObjectId: 'pi_test_123',
      };
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(commissionEvent);
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 2 });

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.success).toBe(true);
      expect(result.commissionEventId).toBe(99);

      expect(mockPrisma.salesRepCommissionEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 99, reversedAt: null }),
          data: expect.objectContaining({ status: 'REVERSED' }),
        })
      );

      expect(mockPrisma.salesRepOverrideCommissionEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            sourceCommissionEventId: 99,
            reversedAt: null,
          }),
          data: expect.objectContaining({ status: 'REVERSED' }),
        })
      );
    });

    it('uses reason from input or falls back to stripeEventType', async () => {
      const commissionEvent = {
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        commissionAmountCents: 5000, stripeObjectId: 'pi_test_123',
      };
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(commissionEvent);
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

      await reverseSalesRepCommission(makeRefundEvent({ reason: 'Customer requested' }));

      const updateCall = mockPrisma.salesRepCommissionEvent.updateMany.mock.calls[0][0];
      expect(updateCall.data.reversalReason).toBe('Customer requested');
    });

    it('falls back to stripeEventType when reason is undefined', async () => {
      const commissionEvent = {
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        commissionAmountCents: 5000, stripeObjectId: 'pi_test_123',
      };
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(commissionEvent);
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

      await reverseSalesRepCommission(makeRefundEvent({ reason: undefined }));

      const updateCall = mockPrisma.salesRepCommissionEvent.updateMany.mock.calls[0][0];
      expect(updateCall.data.reversalReason).toBe('charge.refunded');
    });
  });

  describe('skip conditions', () => {
    it('skips when no commission event found for stripeObjectId', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('No commission event found to reverse');
      expect(mockPrisma.salesRepCommissionEvent.updateMany).not.toHaveBeenCalled();
    });

    it('skips when clawback is disabled on the plan', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        stripeObjectId: 'pi_test_123',
      });
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: false });

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Clawback not enabled on plan');
      expect(mockPrisma.salesRepCommissionEvent.updateMany).not.toHaveBeenCalled();
    });

    it('skips when event was already reversed', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        stripeObjectId: 'pi_test_123',
      });
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('Already reversed');
      expect(result.commissionEventId).toBe(99);
    });

    it('skips clawback check when commissionPlanId is null', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: null,
        stripeObjectId: 'pi_test_123',
      });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
      expect(mockPrisma.salesRepCommissionPlan.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('override cascade', () => {
    it('reverses override events linked via sourceCommissionEventId', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue({
        id: 99, salesRepId: 10, clinicId: 1, commissionPlanId: 1,
        stripeObjectId: 'pi_test_123',
      });
      mockPrisma.salesRepCommissionPlan.findUnique.mockResolvedValue({ clawbackEnabled: true });
      mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 3 });

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.success).toBe(true);
      expect(mockPrisma.salesRepOverrideCommissionEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ sourceCommissionEventId: 99 }),
        })
      );
    });
  });

  describe('error handling', () => {
    it('returns error result on unexpected DB failure', async () => {
      mockPrisma.salesRepCommissionEvent.findFirst.mockRejectedValue(new Error('Connection lost'));

      const result = await reverseSalesRepCommission(makeRefundEvent());

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection lost');
    });
  });
});

describe('approvePendingSalesRepCommissions', () => {
  it('approves both direct and override events and returns counts', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 5 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 2 });

    const result = await approvePendingSalesRepCommissions();

    expect(result.approved).toBe(5);
    expect(result.overrideApproved).toBe(2);
    expect(result.errors).toBe(0);
  });

  it('passes correct where clause for PENDING with expired hold', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

    await approvePendingSalesRepCommissions();

    const directCall = mockPrisma.salesRepCommissionEvent.updateMany.mock.calls[0][0];
    expect(directCall.where.status).toBe('PENDING');
    expect(directCall.where.OR).toEqual([
      { holdUntil: null },
      { holdUntil: expect.objectContaining({ lte: expect.any(Date) }) },
    ]);
    expect(directCall.data.status).toBe('APPROVED');
    expect(directCall.data.approvedAt).toBeInstanceOf(Date);
  });

  it('uses same approval criteria for override events', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

    await approvePendingSalesRepCommissions();

    const overrideCall = mockPrisma.salesRepOverrideCommissionEvent.updateMany.mock.calls[0][0];
    expect(overrideCall.where.status).toBe('PENDING');
    expect(overrideCall.data.status).toBe('APPROVED');
  });

  it('returns error result when DB fails', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockRejectedValue(new Error('DB timeout'));

    const result = await approvePendingSalesRepCommissions();

    expect(result.approved).toBe(0);
    expect(result.overrideApproved).toBe(0);
    expect(result.errors).toBe(1);
  });

  it('handles zero pending events gracefully', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 0 });

    const result = await approvePendingSalesRepCommissions();

    expect(result.approved).toBe(0);
    expect(result.overrideApproved).toBe(0);
    expect(result.errors).toBe(0);
  });
});
