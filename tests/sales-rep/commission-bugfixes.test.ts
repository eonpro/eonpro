/**
 * Sales Rep Commission Bug Fix Tests
 *
 * Tests for critical fixes to the commission system:
 * 1. BUG-1: Cron override approval (tested in integration context)
 * 2. BUG-2: Override reconciliation on webhook retry after crash
 * 3. BUG-3: Subscription payment double-counting prevention
 * 4. ISSUE-4: Timezone-aware volume tier week bounds
 * 5. ISSUE-5: Override events inherit holdUntil from plan
 * 6. ISSUE-7: FIRST_PAYMENT_ONLY blocks all non-first payments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockLogger, mockGetDatePartsInTz, mockMidnightInTz } = vi.hoisted(() => {
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
      payment: { count: fn(), findFirst: fn() },
      $transaction: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn(), security: fn() },
    mockGetDatePartsInTz: fn(),
    mockMidnightInTz: fn(),
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/utils/timezone', () => ({
  getDatePartsInTz: mockGetDatePartsInTz,
  midnightInTz: mockMidnightInTz,
}));

import {
  processPaymentForSalesRepCommission,
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
    reactivationDays: null,
    ...overrides,
  };
}

function makePaymentEvent(overrides: Partial<SalesRepPaymentEventData> = {}): SalesRepPaymentEventData {
  return {
    clinicId: 1, patientId: 500,
    stripeEventId: `evt_bugfix_${Date.now()}`, stripeObjectId: 'pi_bugfix_test',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 100000, occurredAt: new Date('2026-03-10T12:00:00Z'),
    isFirstPayment: true,
    ...overrides,
  };
}

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
  mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/New_York' });

  const txProxy = {
    salesRepCommissionEvent: {
      create: vi.fn().mockImplementation(({ data }: any) => ({
        id: 99, salesRepId: 10, clinicId: 1, ...data,
      })),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(txProxy));
  return { plan, txProxy };
}

function setupTimezone() {
  mockGetDatePartsInTz.mockReturnValue({
    year: 2026, month: 2, day: 10, dayOfWeek: 2,
  });
  mockMidnightInTz.mockImplementation((y: number, m: number, d: number) =>
    new Date(Date.UTC(y, m, d, 5, 0, 0))
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupTimezone();
});

// =========================================================================
// BUG-2: Override Reconciliation on Webhook Retry
// =========================================================================

describe('BUG-2: Override reconciliation on webhook retry', () => {
  it('creates missing override events when direct commission already exists', async () => {
    const existingEvent = {
      id: 99, salesRepId: 10, clinicId: 1,
      eventAmountCents: 100000, stripeEventId: 'evt_retry_test',
      stripeObjectId: 'pi_retry_test', stripeEventType: 'payment_intent.succeeded',
      patientId: 500, occurredAt: new Date('2026-03-10T12:00:00Z'),
      holdUntil: null, status: 'PENDING',
    };

    mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(existingEvent);
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 150, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
    mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ stripeEventId: 'evt_retry_test' })
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Event already processed');

    expect(mockPrisma.salesRepOverrideCommissionEvent.create).toHaveBeenCalledTimes(1);
    const createData = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0].data;
    expect(createData.overrideRepId).toBe(20);
    expect(createData.commissionAmountCents).toBe(1500);
    expect(createData.sourceCommissionEventId).toBe(99);
  });

  it('skips override creation when overrides already exist (idempotent)', async () => {
    const existingEvent = {
      id: 99, salesRepId: 10, clinicId: 1,
      eventAmountCents: 100000, stripeEventId: 'evt_retry_test2',
      stripeObjectId: 'pi_retry_test2', stripeEventType: 'payment_intent.succeeded',
      patientId: 500, occurredAt: new Date('2026-03-10T12:00:00Z'),
      holdUntil: null, status: 'PENDING',
    };

    mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(existingEvent);
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 150, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue({ id: 200 });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ stripeEventId: 'evt_retry_test2' })
    );

    expect(result.skipped).toBe(true);
    expect(mockPrisma.salesRepOverrideCommissionEvent.create).not.toHaveBeenCalled();
  });
});

// =========================================================================
// BUG-3: Subscription Payment Double-Counting Prevention
// =========================================================================

describe('BUG-3: Subscription payment double-counting', () => {
  it('skips when same payment already commissioned via different event type', async () => {
    mockPrisma.salesRepCommissionEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 88, stripeEventType: 'payment_intent.succeeded',
        clinicId: 1, patientId: 500, eventAmountCents: 100000,
      });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      stripeEventId: 'evt_invoice_paid_1',
      stripeEventType: 'invoice.paid',
      amountCents: 100000,
      occurredAt: new Date('2026-03-10T12:00:01Z'),
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toContain('already commissioned via payment_intent.succeeded');
    expect(result.commissionEventId).toBe(88);
  });

  it('does NOT dedup when event types are the same (unrelated events)', async () => {
    setupPipeline();
    mockPrisma.salesRepCommissionEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      stripeEventId: 'evt_pi_second',
      stripeEventType: 'payment_intent.succeeded',
      amountCents: 100000,
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('does NOT dedup when amounts differ (separate purchases)', async () => {
    setupPipeline();
    mockPrisma.salesRepCommissionEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      stripeEventId: 'evt_diff_amount',
      stripeEventType: 'invoice.paid',
      amountCents: 50000,
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('does NOT dedup when time gap is > 2 minutes', async () => {
    setupPipeline();
    mockPrisma.salesRepCommissionEvent.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      stripeEventId: 'evt_far_apart',
      stripeEventType: 'invoice.paid',
      occurredAt: new Date('2026-03-10T12:05:00Z'),
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });
});

// =========================================================================
// ISSUE-4: Timezone-Aware Volume Tier Week Bounds
// =========================================================================

describe('ISSUE-4: Timezone-aware volume tier bounds', () => {
  it('uses clinic timezone for week bounds via getDatePartsInTz', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);
    mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/Chicago' });

    await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 10000 }));

    expect(mockPrisma.clinic.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, select: { timezone: true } })
    );
    expect(mockGetDatePartsInTz).toHaveBeenCalledWith('America/Chicago');
  });

  it('falls back to America/New_York when clinic has no timezone', async () => {
    setupPipeline({ volumeTierEnabled: true });
    mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([
      { id: 1, planId: 1, minSales: 1, maxSales: null, amountCents: 500, sortOrder: 0 },
    ]);
    mockPrisma.salesRepCommissionEvent.count.mockResolvedValue(0);
    mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: null });

    await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 10000 }));

    expect(mockGetDatePartsInTz).toHaveBeenCalledWith('America/New_York');
  });

  it('does NOT query clinic timezone when volumeTierEnabled is false', async () => {
    setupPipeline({ volumeTierEnabled: false });

    await processPaymentForSalesRepCommission(makePaymentEvent({ amountCents: 10000 }));

    expect(mockPrisma.clinic.findUnique).not.toHaveBeenCalled();
  });
});

// =========================================================================
// ISSUE-5: Override Events Inherit holdUntil from Plan
// =========================================================================

describe('ISSUE-5: Override events inherit holdUntil', () => {
  it('passes holdUntil from direct commission to override events', async () => {
    const holdDate = new Date('2026-03-17T12:00:00Z');
    setupPipeline({ holdDays: 7 });
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 100, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
    mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

    await processPaymentForSalesRepCommission(makePaymentEvent({
      occurredAt: new Date('2026-03-10T12:00:00Z'),
    }));

    const createData = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0].data;
    expect(createData.holdUntil).toEqual(holdDate);
  });

  it('sets holdUntil to null when plan has holdDays=0', async () => {
    setupPipeline({ holdDays: 0 });
    mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([{
      id: 1, overrideRepId: 20, subordinateRepId: 10,
      overridePercentBps: 100, clinicId: 1, isActive: true,
      effectiveFrom: new Date('2020-01-01'), effectiveTo: null,
    }]);
    mockPrisma.salesRepOverrideCommissionEvent.findFirst.mockResolvedValue(null);
    mockPrisma.salesRepOverrideCommissionEvent.create.mockResolvedValue({ id: 200 });

    await processPaymentForSalesRepCommission(makePaymentEvent());

    const createData = mockPrisma.salesRepOverrideCommissionEvent.create.mock.calls[0][0].data;
    expect(createData.holdUntil).toBeNull();
  });
});

// =========================================================================
// ISSUE-7: FIRST_PAYMENT_ONLY Blocks All Non-First Payments
// =========================================================================

describe('ISSUE-7: FIRST_PAYMENT_ONLY blocks all non-first', () => {
  it('skips recurring payments on FIRST_PAYMENT_ONLY plans', async () => {
    setupPipeline({ appliesTo: 'FIRST_PAYMENT_ONLY', recurringEnabled: true });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isFirstPayment: false, isRecurring: true })
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });

  it('skips non-first non-recurring payments on FIRST_PAYMENT_ONLY plans', async () => {
    setupPipeline({ appliesTo: 'FIRST_PAYMENT_ONLY' });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isFirstPayment: false, isRecurring: false })
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });

  it('allows first payment through on FIRST_PAYMENT_ONLY plans', async () => {
    setupPipeline({ appliesTo: 'FIRST_PAYMENT_ONLY' });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isFirstPayment: true, isRecurring: false })
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('recurring on ALL_PAYMENTS with recurringEnabled=true still works', async () => {
    setupPipeline({ appliesTo: 'ALL_PAYMENTS', recurringEnabled: true });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isFirstPayment: false, isRecurring: true })
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });

  it('recurring on ALL_PAYMENTS with recurringEnabled=false is blocked', async () => {
    setupPipeline({ appliesTo: 'ALL_PAYMENTS', recurringEnabled: false });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ isFirstPayment: false, isRecurring: true })
    );

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Recurring commissions not enabled on plan');
  });
});

// =========================================================================
// BUG-1: Approval approves BOTH direct and override events
// =========================================================================

describe('BUG-1: approvePendingSalesRepCommissions approves overrides', () => {
  it('approves both direct and override commission events in parallel', async () => {
    mockPrisma.salesRepCommissionEvent.updateMany.mockResolvedValue({ count: 5 });
    mockPrisma.salesRepOverrideCommissionEvent.updateMany.mockResolvedValue({ count: 3 });

    const result = await approvePendingSalesRepCommissions();

    expect(result.approved).toBe(5);
    expect(result.overrideApproved).toBe(3);
    expect(result.errors).toBe(0);

    const overrideCall = mockPrisma.salesRepOverrideCommissionEvent.updateMany.mock.calls[0][0];
    expect(overrideCall.where.status).toBe('PENDING');
    expect(overrideCall.where.OR).toEqual([
      { holdUntil: null },
      { holdUntil: expect.objectContaining({ lte: expect.any(Date) }) },
    ]);
    expect(overrideCall.data.status).toBe('APPROVED');
    expect(overrideCall.data.approvedAt).toBeInstanceOf(Date);
  });
});

// =========================================================================
// NEW-VS-RECURRING: Smart Default Inference
// =========================================================================

describe('New vs Recurring: Smart default isRecurring inference', () => {
  it('infers isRecurring=true when isFirstPayment=false and isRecurring not provided', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS', recurringEnabled: true,
      percentBps: 1000, initialPercentBps: 700, recurringPercentBps: 200,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(2000);
  });

  it('uses initial rate when isFirstPayment=true and isRecurring not provided', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS', recurringEnabled: true,
      percentBps: 1000, initialPercentBps: 700, recurringPercentBps: 200,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: true,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(7000);
  });

  it('explicit isRecurring=true overrides the smart default', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS', recurringEnabled: true,
      percentBps: 1000, initialPercentBps: 700, recurringPercentBps: 200,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: true,
      isRecurring: true,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(2000);
  });

  it('explicit isRecurring=false overrides the smart default', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS', recurringEnabled: true,
      percentBps: 1000, initialPercentBps: 700, recurringPercentBps: 200,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
      isRecurring: false,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(7000);
  });

  it('stores effectiveIsRecurring on the commission event record', async () => {
    const { txProxy } = setupPipeline({
      appliesTo: 'ALL_PAYMENTS', recurringEnabled: true,
      percentBps: 1000, recurringPercentBps: 200,
    });

    await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
    }));

    const createData = txProxy.salesRepCommissionEvent.create.mock.calls[0][0].data;
    expect(createData.isRecurring).toBe(true);
  });
});

// =========================================================================
// NEW-VS-RECURRING: OT Clinic Scenario (7% new / 2% recurring)
// =========================================================================

describe('OT Clinic: 7% new sale, 2% recurring', () => {
  function setupOTPlan() {
    return setupPipeline({
      appliesTo: 'ALL_PAYMENTS',
      recurringEnabled: true,
      percentBps: 700,
      initialPercentBps: 700,
      recurringPercentBps: 200,
    });
  }

  it('new patient first payment: 7% of $500 = $35', async () => {
    setupOTPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 50000,
      isFirstPayment: true,
    }));

    expect(result.commissionAmountCents).toBe(3500);
  });

  it('existing patient recurring payment: 2% of $500 = $10', async () => {
    setupOTPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 50000,
      isFirstPayment: false,
    }));

    expect(result.commissionAmountCents).toBe(1000);
  });

  it('subscription renewal via billing_reason: 2% of $500 = $10', async () => {
    setupOTPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 50000,
      isFirstPayment: false,
      isRecurring: true,
    }));

    expect(result.commissionAmountCents).toBe(1000);
  });

  it('migrated patient (has synthetic payment marker): 2% of $500 = $10', async () => {
    setupOTPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 50000,
      isFirstPayment: false,
    }));

    expect(result.commissionAmountCents).toBe(1000);
  });
});

// =========================================================================
// NEW-VS-RECURRING: EONMEDS Clinic Scenario (new sales only)
// =========================================================================

describe('EONMEDS Clinic: commission on new sales only', () => {
  function setupEONMEDSPlan() {
    return setupPipeline({
      appliesTo: 'FIRST_PAYMENT_ONLY',
      recurringEnabled: false,
      percentBps: 700,
    });
  }

  it('new patient first payment: 7% of $300 = $21', async () => {
    setupEONMEDSPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: true,
    }));

    expect(result.commissionAmountCents).toBe(2100);
  });

  it('existing patient second payment: skipped (FIRST_PAYMENT_ONLY)', async () => {
    setupEONMEDSPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: false,
    }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });

  it('recurring subscription payment: skipped (FIRST_PAYMENT_ONLY)', async () => {
    setupEONMEDSPlan();

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: false,
      isRecurring: true,
    }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });
});

// =========================================================================
// NEW-VS-RECURRING: recurringEnabled guard with smart default
// =========================================================================

describe('recurringEnabled guard with smart default', () => {
  it('skips when recurringEnabled=false and isRecurring inferred true', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS',
      recurringEnabled: false,
      percentBps: 1000,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
    }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Recurring commissions not enabled on plan');
  });

  it('processes when recurringEnabled=true and isRecurring inferred true', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS',
      recurringEnabled: true,
      percentBps: 1000,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
  });
});

// =========================================================================
// REACTIVATION WINDOW: Patient lapse resets to new sale
// =========================================================================

describe('Reactivation Window: patient lapse resets to new sale', () => {
  it('EONMEDS: patient lapsed 90+ days gets new-sale commission on FIRST_PAYMENT_ONLY plan', async () => {
    setupPipeline({
      appliesTo: 'FIRST_PAYMENT_ONLY',
      recurringEnabled: false,
      percentBps: 700,
      reactivationDays: 90,
    });
    // No recent payment found within the 90-day window
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: false,
      occurredAt: new Date('2026-06-15T12:00:00Z'),
    }));

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.commissionAmountCents).toBe(2100);
  });

  it('EONMEDS: patient paid within 90 days is still blocked by FIRST_PAYMENT_ONLY', async () => {
    setupPipeline({
      appliesTo: 'FIRST_PAYMENT_ONLY',
      recurringEnabled: false,
      percentBps: 700,
      reactivationDays: 90,
    });
    // Recent payment found within window
    mockPrisma.payment.findFirst.mockResolvedValue({ id: 999 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: false,
    }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });

  it('reactivation does not apply when reactivationDays is null', async () => {
    setupPipeline({
      appliesTo: 'FIRST_PAYMENT_ONLY',
      recurringEnabled: false,
      percentBps: 700,
      reactivationDays: null,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: false,
    }));

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('Plan only applies to first payment');
  });

  it('reactivation with ALL_PAYMENTS plan: lapsed patient gets initial rate, not recurring', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS',
      recurringEnabled: true,
      initialPercentBps: 700,
      recurringPercentBps: 200,
      percentBps: 700,
      reactivationDays: 90,
    });
    mockPrisma.payment.findFirst.mockResolvedValue(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
      occurredAt: new Date('2026-06-15T12:00:00Z'),
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(7000);
  });

  it('reactivation with ALL_PAYMENTS plan: active patient still gets recurring rate', async () => {
    setupPipeline({
      appliesTo: 'ALL_PAYMENTS',
      recurringEnabled: true,
      initialPercentBps: 700,
      recurringPercentBps: 200,
      percentBps: 700,
      reactivationDays: 90,
    });
    mockPrisma.payment.findFirst.mockResolvedValue({ id: 888 });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 100000,
      isFirstPayment: false,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(2000);
  });

  it('first-ever payment is unaffected by reactivation window', async () => {
    setupPipeline({
      appliesTo: 'FIRST_PAYMENT_ONLY',
      recurringEnabled: false,
      percentBps: 700,
      reactivationDays: 90,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent({
      amountCents: 30000,
      isFirstPayment: true,
    }));

    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(2100);
  });
});
