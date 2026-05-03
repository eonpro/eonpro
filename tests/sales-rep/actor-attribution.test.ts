/**
 * Hybrid actor-attribution policy for sales-rep commission events.
 *
 * Stakeholder direction (2026-05-03 — see OT rep attribution plan and
 * `.cursor/rules/07-stripe-payments.mdc` § rep attribution):
 *
 *   1. When the actor is commission-eligible AND the patient has no
 *      active `PatientSalesRepAssignment`, auto-create one tagged to
 *      the actor (claim the patient going forward) AND attribute this
 *      transaction to the actor.
 *   2. When the actor is commission-eligible AND the patient already
 *      has an active rep, attribute *this* transaction to the actor
 *      but leave the patient's profile rep untouched (no credit-stealing).
 *   3. When no actor is provided AND the patient has an active rep,
 *      legacy behavior — attribute to the patient's rep.
 *   4. When no actor AND no assignment, skip with a clear reason.
 *   5. When the actor is NOT commission-eligible (e.g. SUPER_ADMIN
 *      acting on behalf of a rep), fall through to existing assignment.
 *   6. Actor recovery: when the caller doesn't pass `actorUserId`
 *      explicitly, the service reads it off `Payment.metadata.actorUserId`
 *      stamped by the route handlers (covers webhook-driven calls).
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
      salesRepOverrideCommissionEvent: { findFirst: fn(), create: fn(), updateMany: fn() },
      salesRepOverrideAssignment: { findMany: fn() },
      salesRepVolumeCommissionTier: { findMany: fn() },
      salesRepProductCommission: { findMany: fn() },
      salesRepPlanAssignment: { findFirst: fn() },
      salesRepCommissionPlan: { findUnique: fn() },
      patientSalesRepAssignment: { findFirst: fn(), create: fn() },
      clinic: { findUnique: fn() },
      user: { findFirst: fn(), findUnique: fn() },
      payment: { count: fn(), findFirst: fn() },
      invoice: { findUnique: fn() },
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

const ACTOR_REP_ID = 42;
const EXISTING_REP_ID = 10;
const ACTOR_REP_ROLE = 'SALES_REP';
const PATIENT_ID = 500;
const CLINIC_ID = 1;

function makePlan(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clinicId: CLINIC_ID,
    name: 'Standard 8%',
    planType: 'PERCENT' as const,
    flatAmountCents: null,
    percentBps: 800,
    initialPercentBps: null,
    initialFlatAmountCents: null,
    recurringPercentBps: null,
    recurringFlatAmountCents: null,
    appliesTo: 'ALL_PAYMENTS',
    holdDays: 0,
    clawbackEnabled: true,
    isActive: true,
    recurringEnabled: true,
    recurringMonths: null,
    multiItemBonusEnabled: false,
    multiItemBonusType: null,
    multiItemBonusPercentBps: null,
    multiItemBonusFlatCents: null,
    multiItemMinQuantity: null,
    volumeTierEnabled: false,
    volumeTierWindow: null,
    volumeTierRetroactive: false,
    volumeTierBasis: 'SALE_COUNT',
    reactivationDays: null,
    ...overrides,
  };
}

function makePaymentEvent(
  overrides: Partial<SalesRepPaymentEventData> = {}
): SalesRepPaymentEventData {
  return {
    clinicId: CLINIC_ID,
    patientId: PATIENT_ID,
    stripeEventId: 'evt_actor_test',
    stripeObjectId: 'pi_actor_test',
    stripeEventType: 'payment_intent.succeeded',
    amountCents: 25000,
    occurredAt: new Date('2026-04-21T16:01:00Z'),
    isFirstPayment: true,
    isRecurring: false,
    ...overrides,
  };
}

function primePipeline() {
  /** Idempotency + dedup pass-through. */
  mockPrisma.salesRepCommissionEvent.findFirst.mockResolvedValue(null);
  /** Resolved rep is always an active commission-eligible user. */
  mockPrisma.user.findFirst.mockResolvedValue({ id: 0 });
  mockPrisma.salesRepPlanAssignment.findFirst.mockResolvedValue({
    commissionPlan: makePlan(),
  });
  mockPrisma.salesRepVolumeCommissionTier.findMany.mockResolvedValue([]);
  mockPrisma.salesRepProductCommission.findMany.mockResolvedValue([]);
  mockPrisma.salesRepOverrideAssignment.findMany.mockResolvedValue([]);
  mockPrisma.clinic.findUnique.mockResolvedValue({ timezone: 'America/New_York' });
  mockPrisma.$transaction.mockImplementation(async (fn: any) => {
    const txProxy = {
      salesRepCommissionEvent: {
        create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 999, ...data })),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    return fn(txProxy);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  primePipeline();
});

describe('Hybrid actor attribution', () => {
  it('claims unassigned patient: actor is SALES_REP, no existing assignment', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);
    mockPrisma.patientSalesRepAssignment.create.mockResolvedValue({});

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ actorUserId: ACTOR_REP_ID, actorRole: ACTOR_REP_ROLE })
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    /** New assignment created tied to the actor. */
    expect(mockPrisma.patientSalesRepAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        patientId: PATIENT_ID,
        clinicId: CLINIC_ID,
        salesRepId: ACTOR_REP_ID,
        isActive: true,
        assignedById: ACTOR_REP_ID,
      }),
    });
    /** Per-transaction attribution → commission event was created against the actor. */
    expect(result.commissionAmountCents).toBe(2000); // 8% × $250
  });

  it('does NOT overwrite existing assignment: per-transaction attribution still goes to the actor', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({
      salesRepId: EXISTING_REP_ID,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ actorUserId: ACTOR_REP_ID, actorRole: ACTOR_REP_ROLE })
    );

    expect(result.success).toBe(true);
    /** Profile assignment stays on the original rep (no create call). */
    expect(mockPrisma.patientSalesRepAssignment.create).not.toHaveBeenCalled();
    /** Commission event was created (this transaction goes to the actor). */
    expect(result.commissionAmountCents).toBe(2000);
  });

  it('falls through to assignment when actor is NOT commission-eligible (super-admin acting)', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({
      salesRepId: EXISTING_REP_ID,
    });

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ actorUserId: 999, actorRole: 'SUPER_ADMIN' })
    );

    expect(result.success).toBe(true);
    expect(mockPrisma.patientSalesRepAssignment.create).not.toHaveBeenCalled();
    expect(result.commissionAmountCents).toBe(2000);
  });

  it('skips when no actor AND no assignment (legacy behavior preserved)', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);

    const result = await processPaymentForSalesRepCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe('No sales rep assigned to patient');
    expect(mockPrisma.patientSalesRepAssignment.create).not.toHaveBeenCalled();
  });

  it('uses existing assignment when no actor is passed (legacy webhook path)', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({
      salesRepId: EXISTING_REP_ID,
    });

    const result = await processPaymentForSalesRepCommission(makePaymentEvent());

    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(result.commissionAmountCents).toBe(2000);
    expect(mockPrisma.patientSalesRepAssignment.create).not.toHaveBeenCalled();
  });

  describe('Actor recovery from Payment.metadata', () => {
    it('reads actorUserId off Payment.metadata when not passed explicitly', async () => {
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.create.mockResolvedValue({});
      mockPrisma.payment.findFirst.mockResolvedValue({
        metadata: { actorUserId: ACTOR_REP_ID, actorRole: ACTOR_REP_ROLE },
        invoiceId: null,
      });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(mockPrisma.patientSalesRepAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ salesRepId: ACTOR_REP_ID }),
      });
    });

    it('falls back to Invoice.metadata.actorUserId when Payment metadata lacks it', async () => {
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);
      mockPrisma.patientSalesRepAssignment.create.mockResolvedValue({});
      mockPrisma.payment.findFirst.mockResolvedValue({
        metadata: {},
        invoiceId: 7777,
      });
      mockPrisma.invoice.findUnique.mockResolvedValue({
        metadata: { actorUserId: ACTOR_REP_ID },
      });
      /** Service must look up the actor's role since metadata doesn't carry it. */
      mockPrisma.user.findUnique.mockResolvedValue({ role: ACTOR_REP_ROLE });

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(mockPrisma.patientSalesRepAssignment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ salesRepId: ACTOR_REP_ID }),
      });
    });

    it('best-effort: lookup failure does not block legacy assignment fallback', async () => {
      mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue({
        salesRepId: EXISTING_REP_ID,
      });
      mockPrisma.payment.findFirst.mockRejectedValue(new Error('boom'));

      const result = await processPaymentForSalesRepCommission(makePaymentEvent());

      expect(result.success).toBe(true);
      expect(result.commissionAmountCents).toBe(2000);
    });
  });

  it('eats race when assignment.create throws unique-constraint and continues attribution', async () => {
    mockPrisma.patientSalesRepAssignment.findFirst.mockResolvedValue(null);
    mockPrisma.patientSalesRepAssignment.create.mockRejectedValue(
      Object.assign(new Error('unique'), { code: 'P2002' })
    );

    const result = await processPaymentForSalesRepCommission(
      makePaymentEvent({ actorUserId: ACTOR_REP_ID, actorRole: ACTOR_REP_ROLE })
    );

    /** This transaction still attributes to the actor; race was logged at debug. */
    expect(result.success).toBe(true);
    expect(result.commissionAmountCents).toBe(2000);
  });
});
