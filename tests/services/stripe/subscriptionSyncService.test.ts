/**
 * Subscription Sync Service Tests
 * ================================
 *
 * Specifically covers the patient-resolution chain and the Connect-event
 * loud-skip tripwire required by .cursor/rules/07-stripe-payments.mdc:
 *
 *   "Never silent-skip paid events.
 *    Any path that decides not to create a local record for a paid Stripe
 *    invoice MUST either (a) log at DEBUG with a clear 'owned by X automation'
 *    comment and unit-test the owned-by-X claim, or (b) log at ERROR + emit
 *    Sentry."
 *
 * The leak we're fixing: 9,836 of 11,664 active WellMedR subs had no local
 * Subscription row because syncSubscriptionFromStripe silently skipped on a
 * race condition (patient created by Airtable AFTER Stripe webhook fired,
 * customer.email transient unavailable). These tests pin the new behavior:
 *
 *  1. When patient resolution fails on a Connect event, log at error level
 *     and emit Sentry.captureMessage(level: 'error') so the next leak is
 *     visible immediately.
 *  2. When customer.email is null but subscription.metadata.email is present,
 *     fall through to that as a third resolution path (covers WellMedR
 *     custom-checkout path which writes metadata.{email,firstName,lastName}).
 *  3. Same for customer.metadata.email as a fourth path.
 *  4. Non-Connect events still skip silently (no Sentry spam).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ---------- mocks ----------

const mocks = vi.hoisted(() => ({
  sentryCaptureMessage: vi.fn(),
  loggerDebug: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
  loggerSecurity: vi.fn(),
  patientFindFirst: vi.fn(),
  patientUpdate: vi.fn(),
  subscriptionUpsert: vi.fn(),
  findPatientByEmail: vi.fn(),
  stripeCustomersRetrieve: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: mocks.sentryCaptureMessage,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: mocks.loggerDebug,
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    security: mocks.loggerSecurity,
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findFirst: mocks.patientFindFirst,
      update: mocks.patientUpdate,
    },
    subscription: {
      upsert: mocks.subscriptionUpsert,
    },
  },
}));

vi.mock('@/services/stripe/paymentMatchingService', () => ({
  findPatientByEmail: mocks.findPatientByEmail,
}));

vi.mock('@/services/refill/refillQueueService', () => ({
  calculateIntervalDays: vi.fn(() => 30),
}));

vi.mock('@/lib/shipment-schedule/shipmentScheduleService', () => ({
  parsePackageMonthsFromPlan: vi.fn(() => 1),
}));

vi.mock('@/lib/stripe/config', () => ({
  getStripeClient: () => ({
    customers: { retrieve: mocks.stripeCustomersRetrieve },
  }),
}));

vi.mock('@/lib/stripe/connect', () => ({
  getStripeForPlatform: () => ({
    stripe: {
      customers: { retrieve: mocks.stripeCustomersRetrieve },
    },
    isPlatformAccount: true,
  }),
}));

// ---------- import under test (after mocks) ----------

import { syncSubscriptionFromStripe } from '@/services/stripe/subscriptionSyncService';

// ---------- helpers ----------

function makeStripeSub(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: 'sub_test_123',
    object: 'subscription',
    customer: 'cus_test_abc',
    status: 'active',
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          price: {
            id: 'price_1',
            product: 'prod_1',
            unit_amount: 24900,
            currency: 'usd',
            recurring: { interval: 'month', interval_count: 1 },
          },
          current_period_start: 1735689600,
          current_period_end: 1738368000,
        } as unknown as Stripe.SubscriptionItem,
      ],
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
    start_date: 1735689600,
    created: 1735689600,
    billing_cycle_anchor: 1735689600,
    canceled_at: null,
    ended_at: null,
    metadata: {},
    cancel_at_period_end: false,
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function resetAllMocks() {
  vi.clearAllMocks();
  mocks.patientFindFirst.mockReset();
  mocks.patientUpdate.mockReset();
  mocks.subscriptionUpsert.mockReset();
  mocks.findPatientByEmail.mockReset();
  mocks.stripeCustomersRetrieve.mockReset();
  mocks.sentryCaptureMessage.mockReset();
  mocks.loggerError.mockReset();
  mocks.loggerInfo.mockReset();
}

// ---------- tests ----------

describe('syncSubscriptionFromStripe - patient resolution + tripwires', () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.subscriptionUpsert.mockResolvedValue({ id: 999 });
    mocks.patientUpdate.mockResolvedValue({ id: 1 });
  });

  describe('happy path: stripeCustomerId fast match', () => {
    it('upserts subscription when patient is found by stripeCustomerId', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce({ id: 1, clinicId: 7 });

      const result = await syncSubscriptionFromStripe(makeStripeSub(), 'evt_1', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe(999);
      expect(result.skipped).toBeFalsy();
      expect(mocks.stripeCustomersRetrieve).not.toHaveBeenCalled();
      expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    });
  });

  describe('email fallback: customer.email match', () => {
    it('falls back to customer.email when stripeCustomerId not linked', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_test_abc',
        deleted: false,
        email: 'PATIENT@example.com',
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue({ id: 42, clinicId: 7 });

      const result = await syncSubscriptionFromStripe(makeStripeSub(), 'evt_2', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe(999);
      expect(mocks.findPatientByEmail).toHaveBeenCalledWith('patient@example.com', 7);
      expect(mocks.patientUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 42 },
          data: { stripeCustomerId: 'cus_test_abc' },
        })
      );
      expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    });
  });

  describe('NEW: subscription.metadata.email fallback', () => {
    it('falls through to subscription.metadata.email when customer.email is null', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_test_abc',
        deleted: false,
        email: null,
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue({ id: 77, clinicId: 7 });

      const sub = makeStripeSub({
        metadata: {
          email: 'meta-patient@example.com',
          firstName: 'Sarah',
          lastName: 'Clark',
        },
      });

      const result = await syncSubscriptionFromStripe(sub, 'evt_3', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe(999);
      expect(mocks.findPatientByEmail).toHaveBeenCalledWith('meta-patient@example.com', 7);
      expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    });
  });

  describe('NEW: customer.metadata.email fallback', () => {
    it('falls through to customer.metadata.email when both customer.email and subscription.metadata.email are null', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_test_abc',
        deleted: false,
        email: null,
        metadata: { email: 'cust-meta@example.com' },
      });
      mocks.findPatientByEmail.mockResolvedValue({ id: 88, clinicId: 7 });

      const sub = makeStripeSub({ metadata: {} });

      const result = await syncSubscriptionFromStripe(sub, 'evt_4', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe(999);
      expect(mocks.findPatientByEmail).toHaveBeenCalledWith('cust-meta@example.com', 7);
    });
  });

  describe('NEW: loud skip (Sentry tripwire) on Connect events', () => {
    it('emits Sentry.captureMessage(error) when no patient resolved AND event is from a Connect account', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_test_abc',
        deleted: false,
        email: null,
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue(null);

      const result = await syncSubscriptionFromStripe(makeStripeSub({ metadata: {} }), 'evt_5', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      // Still returns success:true so Stripe doesn't retry-storm; safety-net
      // cron + Sentry alert handle the recovery path.
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);

      expect(mocks.loggerError).toHaveBeenCalledWith(
        expect.stringContaining('REGRESSION'),
        expect.objectContaining({
          stripeSubscriptionId: 'sub_test_123',
          stripeCustomerId: 'cus_test_abc',
          stripeAccountId: 'acct_wellmedr',
          clinicId: 7,
        })
      );

      expect(mocks.sentryCaptureMessage).toHaveBeenCalledTimes(1);
      const [message, captureContext] = mocks.sentryCaptureMessage.mock.calls[0];
      expect(message).toMatch(/Connect subscription event silent-skip/i);
      expect(captureContext).toMatchObject({
        level: 'error',
        tags: expect.objectContaining({
          component: 'subscription-sync-service',
          regression: 'connect-subscription-silent-skip',
        }),
      });
    });

    it('does NOT emit Sentry when event is NOT from a Connect account (platform-direct)', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_test_abc',
        deleted: false,
        email: null,
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue(null);

      const result = await syncSubscriptionFromStripe(makeStripeSub({ metadata: {} }), 'evt_6', {
        clinicId: 1,
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
      expect(mocks.loggerError).not.toHaveBeenCalled();
    });
  });

  describe('NEW: Connect-vs-platform client selection (root cause of WellMedR leak)', () => {
    it('uses the Connect platform client when stripeAccountId is set (Connect event)', async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      // Both platform and Connect mocks resolve to the same retrieve mock,
      // so we just assert it gets called with the correct stripeAccount opt.
      mocks.stripeCustomersRetrieve.mockResolvedValueOnce({
        id: 'cus_test_abc',
        deleted: false,
        email: 'patient@example.com',
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue({ id: 1, clinicId: 7 });

      await syncSubscriptionFromStripe(makeStripeSub(), 'evt_connect', {
        clinicId: 7,
        stripeAccountId: 'acct_wellmedr',
      });

      expect(mocks.stripeCustomersRetrieve).toHaveBeenCalledWith(
        'cus_test_abc',
        {},
        { stripeAccount: 'acct_wellmedr' }
      );
    });
  });

  describe('Sarah Clark regression case', () => {
    it("matches Sarah's WellMedR signup (subscription.metadata has email/firstName/lastName/source=wellmedr-custom-checkout)", async () => {
      mocks.patientFindFirst.mockResolvedValueOnce(null);
      mocks.stripeCustomersRetrieve.mockResolvedValue({
        id: 'cus_UG1GfdeRI5ubzJ',
        deleted: false,
        email: 'sjclark05@yahoo.com',
        metadata: {},
      });
      mocks.findPatientByEmail.mockResolvedValue({ id: 104174, clinicId: 7 });

      const sub = makeStripeSub({
        id: 'sub_1THVE7DfH4PWyxxdZrTYr0K6',
        customer: 'cus_UG1GfdeRI5ubzJ',
        metadata: {
          email: 'sjclark05@yahoo.com',
          firstName: 'Sarah',
          lastName: 'Clark',
          plan: 'monthly',
          product: 'Tirzepatide Injection - 1 Month Supply',
          source: 'wellmedr-custom-checkout',
          userId: '57e145b3-88d5-4a23-a851-a288cc5f6986',
        },
      });

      const result = await syncSubscriptionFromStripe(sub, 'evt_sarah', {
        clinicId: 7,
        stripeAccountId: 'acct_1SrNVgDfH4PWyxxd',
      });

      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe(999);
      expect(mocks.sentryCaptureMessage).not.toHaveBeenCalled();
    });
  });
});
