/**
 * WellMedR Subscription Sync Cron - Smoke Tests
 * ==============================================
 *
 * Verifies the safety-net cron mirrors the wellmedr-renewal-invoice-sync
 * pattern correctly:
 *  - Auth gate via verifyCronAuth.
 *  - Reconciles missing subscriptions (calls syncSubscriptionFromStripe).
 *  - Skips already-existing rows.
 *  - Surfaces a Slack warning when reconciled > 0.
 *
 * Full integration testing happens by deploying + observing the cron run
 * (which triggers the Slack alert if the primary webhook is still leaking).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  alertWarning: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  clinicFindFirst: vi.fn(),
  subscriptionFindUnique: vi.fn(),
  syncSubscriptionFromStripe: vi.fn(),
  getStripeForClinic: vi.fn(),
  stripeSubscriptionsList: vi.fn(),
}));

vi.mock('@/lib/cron/tenant-isolation', () => ({
  verifyCronAuth: mocks.verifyCronAuth,
}));

vi.mock('@/lib/observability/slack-alerts', () => ({
  alertWarning: mocks.alertWarning,
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: mocks.loggerInfo,
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    clinic: { findFirst: mocks.clinicFindFirst },
    subscription: { findUnique: mocks.subscriptionFindUnique },
  },
  runWithClinicContext: vi.fn(async (_clinicId: number, fn: () => unknown) => fn()),
}));

vi.mock('@/services/stripe/subscriptionSyncService', () => ({
  syncSubscriptionFromStripe: mocks.syncSubscriptionFromStripe,
}));

vi.mock('@/lib/stripe/connect', () => ({
  getStripeForClinic: mocks.getStripeForClinic,
}));

import { GET } from '@/app/api/cron/wellmedr-subscription-sync/route';

function makeReq(): NextRequest {
  return {} as NextRequest;
}

function makeStripeSub(id: string, createdAtMs: number) {
  return {
    id,
    object: 'subscription',
    customer: 'cus_x',
    status: 'active',
    created: Math.floor(createdAtMs / 1000),
  };
}

describe('GET /api/cron/wellmedr-subscription-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(true);
    mocks.clinicFindFirst.mockResolvedValue({ id: 7, stripeAccountId: 'acct_wellmedr' });
    mocks.getStripeForClinic.mockResolvedValue({
      stripe: { subscriptions: { list: mocks.stripeSubscriptionsList } },
      stripeAccountId: 'acct_wellmedr',
    });
  });

  it('rejects unauthorized requests', async () => {
    mocks.verifyCronAuth.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it('reconciles missing subs and alerts when reconciled > 0', async () => {
    const subA = makeStripeSub('sub_a', Date.now() - 3600 * 1000);
    const subB = makeStripeSub('sub_b', Date.now() - 7200 * 1000);

    mocks.stripeSubscriptionsList.mockResolvedValueOnce({
      data: [subA, subB],
      has_more: false,
    });

    // sub_a missing, sub_b already exists
    mocks.subscriptionFindUnique
      .mockResolvedValueOnce(null) // sub_a
      .mockResolvedValueOnce({ id: 1234 }); // sub_b

    mocks.syncSubscriptionFromStripe.mockResolvedValueOnce({
      success: true,
      subscriptionId: 9999,
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.scanned).toBe(2);
    expect(body.alreadyExists).toBe(1);
    expect(body.reconciled).toBe(1);
    expect(body.replayFailed).toBe(0);
    expect(body.skippedNoPatient).toBe(0);

    expect(mocks.syncSubscriptionFromStripe).toHaveBeenCalledTimes(1);
    expect(mocks.alertWarning).toHaveBeenCalledTimes(1);
    const [title] = mocks.alertWarning.mock.calls[0];
    expect(title).toMatch(/WellMedR subscription sync/i);
  });

  it('counts skipped_no_patient when sync still skips after metadata fallbacks', async () => {
    const subStuck = makeStripeSub('sub_stuck', Date.now() - 1800 * 1000);
    mocks.stripeSubscriptionsList.mockResolvedValueOnce({
      data: [subStuck],
      has_more: false,
    });
    mocks.subscriptionFindUnique.mockResolvedValueOnce(null);
    mocks.syncSubscriptionFromStripe.mockResolvedValueOnce({
      success: true,
      skipped: true,
      reason: 'No patient linked to Stripe customer',
    });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.skippedNoPatient).toBe(1);
    expect(body.reconciled).toBe(0);
    expect(mocks.alertWarning).toHaveBeenCalledTimes(1);
  });

  it('does NOT alert when nothing missing', async () => {
    mocks.stripeSubscriptionsList.mockResolvedValueOnce({
      data: [makeStripeSub('sub_only', Date.now() - 3600 * 1000)],
      has_more: false,
    });
    mocks.subscriptionFindUnique.mockResolvedValueOnce({ id: 5555 });

    const res = await GET(makeReq());
    const body = await res.json();

    expect(body.scanned).toBe(1);
    expect(body.alreadyExists).toBe(1);
    expect(body.reconciled).toBe(0);
    expect(mocks.alertWarning).not.toHaveBeenCalled();
  });

  it('returns success: false on fatal error', async () => {
    mocks.clinicFindFirst.mockRejectedValueOnce(new Error('db down'));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/db down/);
  });
});
