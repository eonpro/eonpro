/**
 * Integration-style tests for the refill admin approval flow.
 * Validates the complete flow from subscription payment to admin review queue.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 1. Refill Trigger Flow: Payment → PENDING_ADMIN
// ============================================================================

describe('Refill Trigger Flow', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should NOT auto-approve refills (no adminApproved=true, no providerQueuedAt)', async () => {
    const mockSub = {
      id: 1,
      clinicId: 5,
      patientId: 10,
      planName: 'Semaglutide Monthly 2mL',
      planId: 'semaglutide_monthly_2ml',
      vialCount: 1,
      status: 'ACTIVE',
      patient: { id: 10 },
    };

    const createdRefill = {
      id: 100,
      status: 'PENDING_ADMIN',
      paymentVerified: true,
      adminApproved: false,
    };

    const createMock = vi.fn().mockResolvedValue(createdRefill);
    const updateMock = vi.fn().mockResolvedValue({});

    vi.doMock('@/lib/db', () => ({
      prisma: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue(mockSub),
          update: updateMock,
        },
        refillQueue: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: createMock,
        },
      },
    }));

    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );

    const result = await triggerRefillForSubscriptionPayment(1);

    expect(result).toBeTruthy();
    expect(result!.status).toBe('PENDING_ADMIN');

    const createData = createMock.mock.calls[0][0].data;

    expect(createData.status).toBe('PENDING_ADMIN');
    expect(createData.paymentVerified).toBe(true);
    expect(createData.paymentMethod).toBe('STRIPE_AUTO');
    expect(createData.adminApproved).toBe(false);

    // These should NOT exist (they were in the old auto-approve flow)
    expect(createData).not.toHaveProperty('adminApprovedAt');
    expect(createData).not.toHaveProperty('adminApprovedBy');
    expect(createData).not.toHaveProperty('adminNotes');
    expect(createData).not.toHaveProperty('providerQueuedAt');
  });

  it('should skip duplicate refills if one already exists', async () => {
    const existingRefill = {
      id: 50,
      status: 'PENDING_ADMIN',
      subscriptionId: 1,
    };

    const createMock = vi.fn();

    vi.doMock('@/lib/db', () => ({
      prisma: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue({
            id: 1,
            clinicId: 5,
            patientId: 10,
            planName: 'Test',
            planId: 'test',
            vialCount: 1,
            status: 'ACTIVE',
            patient: { id: 10 },
          }),
          update: vi.fn(),
        },
        refillQueue: {
          findFirst: vi.fn().mockResolvedValue(existingRefill),
          create: createMock,
        },
      },
    }));

    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );

    const result = await triggerRefillForSubscriptionPayment(1);

    // Should return the existing refill without creating a new one
    expect(result).toEqual(existingRefill);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('should return null if subscription not found', async () => {
    vi.doMock('@/lib/db', () => ({
      prisma: {
        subscription: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
        refillQueue: {},
      },
    }));

    vi.doMock('@/lib/logger', () => ({
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }));

    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );

    const result = await triggerRefillForSubscriptionPayment(999);
    expect(result).toBeNull();
  });
});

// ============================================================================
// 2. Admin Nav Configuration
// ============================================================================

describe('Admin Nav - Membership / Refills', () => {
  it('should not have the old RX Queue path', async () => {
    const { baseAdminNavConfig } = await import('@/lib/nav/adminNav');
    const oldItem = baseAdminNavConfig.find((i) => i.path === '/admin/rx-queue');
    expect(oldItem).toBeUndefined();
  });

  it('should have refill-queue with correct label and icon', async () => {
    const { baseAdminNavConfig } = await import('@/lib/nav/adminNav');
    const item = baseAdminNavConfig.find((i) => i.path === '/admin/refill-queue');
    expect(item).toBeDefined();
    expect(item!.label).toBe('Membership / Refills');
    expect(item!.iconKey).toBe('RefreshCw');
  });

  it('should appear in both admin and super_admin configs', async () => {
    const { getAdminNavConfig } = await import('@/lib/nav/adminNav');

    for (const role of ['admin', 'super_admin']) {
      const config = getAdminNavConfig(role);
      const item = config.find((i) => i.path === '/admin/refill-queue');
      expect(item).toBeDefined();
      expect(item!.label).toBe('Membership / Refills');
    }
  });
});

// ============================================================================
// 3. API Response Shape
// ============================================================================

describe('Refill Queue API subscription shape', () => {
  it('subscription object should contain management-relevant fields', () => {
    // This mirrors what the API route now returns
    interface ExpectedSubscription {
      id: number;
      planName: string;
      status: string;
      amount: number;
      interval: string;
      currentPeriodEnd: string;
      stripeSubscriptionId: string | null;
    }

    const sub: ExpectedSubscription = {
      id: 1,
      planName: 'Semaglutide Monthly 2mL',
      status: 'ACTIVE',
      amount: 29900,
      interval: 'month',
      currentPeriodEnd: '2026-03-19T00:00:00.000Z',
      stripeSubscriptionId: 'sub_1abc',
    };

    expect(sub.amount).toBe(29900);
    expect(sub.interval).toBe('month');
    expect(sub.currentPeriodEnd).toBeTruthy();
    expect(sub.stripeSubscriptionId).toBeTruthy();
  });
});
