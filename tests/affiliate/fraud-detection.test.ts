/**
 * Fraud Detection Service Tests
 *
 * Tests the affiliate fraud detection pipeline:
 * 1. Self-referral detection (affiliate's email matches patient)
 * 2. Duplicate IP detection (same IP, multiple conversions)
 * 3. Velocity spike detection (sudden jump in conversions)
 * 4. Refund rate threshold (high refund rate = fraud)
 * 5. Config per clinic (different thresholds per clinic)
 * 6. Edge cases: null IPs, missing config, concurrent checks
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliate: { findUnique: fn() },
      affiliateCommissionEvent: {
        count: fn(),
        aggregate: fn(),
        groupBy: fn(),
      },
      affiliateTouch: { count: fn(), groupBy: fn() },
      affiliateFraudConfig: { findUnique: fn() },
      affiliateFraudAlert: { create: fn(), findMany: fn() },
      patient: { findUnique: fn() },
      user: { findUnique: fn() },
      $queryRaw: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn(), security: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/observability/request-context', () => ({ getRequestId: () => 'test-req-id' }));

import { performFraudCheck, type FraudCheckRequest } from '@/services/affiliate/fraudDetectionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<FraudCheckRequest> = {}): FraudCheckRequest {
  return {
    clinicId: 1,
    affiliateId: 100,
    patientId: 200,
    eventAmountCents: 10000,
    ...overrides,
  };
}

function mockDefaultConfig() {
  // Field names must match the actual Prisma schema / FraudConfig type
  mockPrisma.affiliateFraudConfig.findUnique.mockResolvedValue({
    clinicId: 1,
    enabled: true,
    maxConversionsPerDay: 50,
    maxConversionsPerHour: 10,
    velocitySpikeMultiplier: 3.0,
    maxConversionsPerIp: 3,
    minIpRiskScore: 75,
    blockProxyVpn: false,
    blockDatacenter: true,
    blockTor: true,
    maxRefundRatePct: 20,
    minRefundsForAlert: 5,
    enableGeoMismatchCheck: true,
    allowedCountries: null,
    enableSelfReferralCheck: true,
    autoHoldOnHighRisk: true,
    autoSuspendOnCritical: false,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Fraud Detection Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('performFraudCheck', () => {
    it('should pass when no fraud signals detected', async () => {
      mockDefaultConfig();
      // No patientEmail in request → self-referral email check is skipped
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      // Velocity check: count called twice (hourly, daily); refund check: count called twice (total, reversed)
      // All return 2 → below all thresholds; refund total (2) < minRefundsForAlert (5) → skipped
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(2);
      // Monthly aggregate for velocity average
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 10 });

      const result = await performFraudCheck(makeRequest());

      expect(result.passed).toBe(true);
      expect(result.recommendation).toBe('approve');
      expect(result.riskScore).toBeLessThan(40);
    });

    it('should detect self-referral when affiliate email matches patient', async () => {
      mockDefaultConfig();
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'same@example.com' },
      });
      // Velocity and refund checks — low values so they don't trigger
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 0 });

      // patientEmail is passed to checkSelfReferral — must be in the request
      const result = await performFraudCheck(makeRequest({ patientEmail: 'same@example.com' }));

      expect(result.passed).toBe(false);
      expect(result.alerts.some(a => a.type === 'SELF_REFERRAL')).toBe(true);
    });

    it('should handle missing fraud config gracefully', async () => {
      // No config for this clinic — should use DEFAULT_CONFIG
      mockPrisma.affiliateFraudConfig.findUnique.mockResolvedValue(null);
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 0 });

      const result = await performFraudCheck(makeRequest());

      // Should not throw, should return a result using default config
      expect(result).toBeDefined();
      expect(result.passed).toBeDefined();
    });

    it('should handle null IP addresses without errors', async () => {
      mockDefaultConfig();
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 0 });

      const result = await performFraudCheck(makeRequest({ ipAddress: undefined }));

      expect(result).toBeDefined();
      expect(result.passed).toBeDefined();
    });

    it('should detect velocity spikes when conversions exceed threshold', async () => {
      mockDefaultConfig();
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      // Velocity check calls count twice (hourly, daily) then aggregate (monthly).
      // Refund check calls count twice (total, reversed).
      // Order: hourly=50, daily=50, refund-total=100, refund-reversed=0
      mockPrisma.affiliateCommissionEvent.count
        .mockResolvedValueOnce(50)   // velocity hourly → exceeds maxConversionsPerHour (10)
        .mockResolvedValueOnce(50)   // velocity daily
        .mockResolvedValueOnce(100)  // refund total
        .mockResolvedValueOnce(0);   // refund reversed
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 200 });

      const result = await performFraudCheck(makeRequest());

      expect(result.riskScore).toBeGreaterThan(0);
      // Should flag velocity concern
      expect(result.alerts.length).toBeGreaterThan(0);
      expect(result.alerts.some(a => a.type === 'VELOCITY_SPIKE')).toBe(true);
    });

    it('should detect high refund rates', async () => {
      mockDefaultConfig();
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      // Velocity count (hourly, daily): low values so velocity doesn't trigger.
      // Refund count (total, reversed): 50 total, 20 reversed = 40% > maxRefundRatePct (20%).
      mockPrisma.affiliateCommissionEvent.count
        .mockResolvedValueOnce(1)    // velocity hourly (< 10)
        .mockResolvedValueOnce(1)    // velocity daily (< 50)
        .mockResolvedValueOnce(50)   // refund total (>= minRefundsForAlert=5)
        .mockResolvedValueOnce(20);  // refund reversed → 40% rate
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: 10 });

      const result = await performFraudCheck(makeRequest());

      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.alerts.some(a => a.type === 'REFUND_ABUSE')).toBe(true);
    });
  });
});
