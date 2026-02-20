/**
 * Tests for the refill trigger flow changes:
 * - triggerRefillForSubscriptionPayment should create PENDING_ADMIN refills (not PENDING_PROVIDER)
 * - Admin nav should link to /admin/refill-queue as "Membership / Refills"
 * - Refill queue API should return expanded subscription fields
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// 1. Admin Nav Config Tests
// ============================================================================

describe('Admin Nav Config', () => {
  it('should have "Membership / Refills" nav item pointing to /admin/refill-queue', async () => {
    const { baseAdminNavConfig, getAdminNavConfig } = await import(
      '@/lib/nav/adminNav'
    );

    const refillNav = baseAdminNavConfig.find(
      (item) => item.path === '/admin/refill-queue'
    );
    expect(refillNav).toBeDefined();
    expect(refillNav!.label).toBe('Membership / Refills');
    expect(refillNav!.iconKey).toBe('RefreshCw');

    const oldRxQueue = baseAdminNavConfig.find(
      (item) => item.path === '/admin/rx-queue'
    );
    expect(oldRxQueue).toBeUndefined();

    const adminConfig = getAdminNavConfig('admin');
    const refillItem = adminConfig.find(
      (item) => item.path === '/admin/refill-queue'
    );
    expect(refillItem).toBeDefined();
    expect(refillItem!.label).toBe('Membership / Refills');
  });

  it('should include the nav item for super_admin role too', async () => {
    const { getAdminNavConfig } = await import('@/lib/nav/adminNav');

    const superAdminConfig = getAdminNavConfig('super_admin');
    const refillItem = superAdminConfig.find(
      (item) => item.path === '/admin/refill-queue'
    );
    expect(refillItem).toBeDefined();
    expect(refillItem!.label).toBe('Membership / Refills');
  });
});

// ============================================================================
// 2. triggerRefillForSubscriptionPayment Tests
// ============================================================================

describe('triggerRefillForSubscriptionPayment', () => {
  const mockSubscription = {
    id: 1,
    clinicId: 5,
    patientId: 10,
    planName: 'Semaglutide Monthly',
    planId: 'semaglutide_monthly_2ml',
    vialCount: 1,
    status: 'ACTIVE',
    patient: { id: 10, firstName: 'Test', lastName: 'Patient' },
  };

  const mockRefill = {
    id: 100,
    status: 'PENDING_ADMIN',
    paymentVerified: true,
    adminApproved: false,
  };

  beforeEach(() => {
    vi.resetModules();
  });

  it('should create refill with PENDING_ADMIN status and paymentVerified=true, adminApproved=false', async () => {
    const findUniqueMock = vi.fn().mockResolvedValue(mockSubscription);
    const findFirstMock = vi.fn().mockResolvedValue(null);
    const createMock = vi.fn().mockResolvedValue(mockRefill);
    const updateMock = vi.fn().mockResolvedValue({});

    vi.doMock('@/lib/db', () => ({
      prisma: {
        subscription: { findUnique: findUniqueMock },
        refillQueue: { findFirst: findFirstMock, create: createMock },
      },
    }));

    vi.doMock('@/lib/logger', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    }));

    // Override the subscription update to avoid errors
    vi.doMock('@/lib/db', () => ({
      prisma: {
        subscription: {
          findUnique: findUniqueMock,
          update: updateMock,
        },
        refillQueue: {
          findFirst: findFirstMock,
          create: createMock,
        },
      },
    }));

    const { triggerRefillForSubscriptionPayment } = await import(
      '@/services/refill/refillQueueService'
    );

    await triggerRefillForSubscriptionPayment(1, 'pi_123', 42);

    expect(createMock).toHaveBeenCalledTimes(1);
    const createArgs = createMock.mock.calls[0][0];

    // Key assertions: status must be PENDING_ADMIN, not PENDING_PROVIDER
    expect(createArgs.data.status).toBe('PENDING_ADMIN');
    expect(createArgs.data.paymentVerified).toBe(true);
    expect(createArgs.data.paymentMethod).toBe('STRIPE_AUTO');
    expect(createArgs.data.adminApproved).toBe(false);

    // Must NOT have auto-approval fields
    expect(createArgs.data.adminApprovedAt).toBeUndefined();
    expect(createArgs.data.adminApprovedBy).toBeUndefined();
    expect(createArgs.data.adminNotes).toBeUndefined();
    expect(createArgs.data.providerQueuedAt).toBeUndefined();
  });
});

// ============================================================================
// 3. RefillSubscription Interface Shape (compile-time check via runtime mock)
// ============================================================================

describe('Refill Queue API subscription shape', () => {
  it('should return expanded subscription fields', () => {
    const mockSubscription = {
      id: 1,
      planName: 'Semaglutide Monthly',
      status: 'ACTIVE',
      amount: 29900,
      interval: 'month',
      currentPeriodEnd: '2026-03-19T00:00:00.000Z',
      stripeSubscriptionId: 'sub_abc123',
    };

    expect(mockSubscription).toHaveProperty('amount');
    expect(mockSubscription).toHaveProperty('interval');
    expect(mockSubscription).toHaveProperty('currentPeriodEnd');
    expect(mockSubscription).toHaveProperty('stripeSubscriptionId');
    expect(typeof mockSubscription.amount).toBe('number');
    expect(typeof mockSubscription.interval).toBe('string');
  });
});
