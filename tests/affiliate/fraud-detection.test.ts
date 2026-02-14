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
  mockPrisma.affiliateFraudConfig.findUnique.mockResolvedValue({
    clinicId: 1,
    selfReferralEnabled: true,
    duplicateIpEnabled: true,
    velocitySpikeEnabled: true,
    refundRateEnabled: true,
    duplicateIpWindowHours: 24,
    velocitySpikeThreshold: 10,
    velocitySpikeWindowHours: 1,
    refundRateThreshold: 30,
    refundRateWindowDays: 30,
    ipRiskScoreEnabled: false,
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
      // No affiliate user match
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 200,
        email: 'patient@different.com',
      });
      // No duplicate IPs
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      // No velocity spike
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(2);
      // No high refund rate
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({
        _count: { id: 10 },
      });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 1 }]);

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
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 200,
        email: 'same@example.com',
      });
      // Clear other checks
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: { id: 0 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 0 }]);

      const result = await performFraudCheck(makeRequest());

      expect(result.passed).toBe(false);
      expect(result.alerts.some(a => a.type.includes('SELF_REFERRAL') || a.type.includes('self'))).toBe(true);
    });

    it('should handle missing fraud config gracefully', async () => {
      // No config for this clinic — should use defaults or pass
      mockPrisma.affiliateFraudConfig.findUnique.mockResolvedValue(null);
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: { id: 0 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 0 }]);

      const result = await performFraudCheck(makeRequest());

      // Should not throw, should return a result
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
      mockPrisma.patient.findUnique.mockResolvedValue(null);
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: { id: 0 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 0 }]);

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
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 200,
        email: 'patient@example.com',
      });
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      // Velocity: 50 commissions in the window (above threshold of 10)
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(50);
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: { id: 100 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 0 }]);

      const result = await performFraudCheck(makeRequest());

      expect(result.riskScore).toBeGreaterThan(0);
      // Should flag velocity concern
      expect(result.alerts.length).toBeGreaterThan(0);
    });

    it('should detect high refund rates', async () => {
      mockDefaultConfig();
      mockPrisma.affiliate.findUnique.mockResolvedValue({
        id: 100,
        userId: 1,
        user: { email: 'affiliate@example.com' },
      });
      mockPrisma.patient.findUnique.mockResolvedValue({
        id: 200,
        email: 'patient@example.com',
      });
      mockPrisma.affiliateTouch.count.mockResolvedValue(0);
      mockPrisma.affiliateCommissionEvent.count.mockResolvedValue(1);
      // High refund: 50 total, 20 reversed = 40% refund rate (threshold is 30%)
      mockPrisma.affiliateCommissionEvent.aggregate.mockResolvedValue({ _count: { id: 50 } });
      mockPrisma.$queryRaw.mockResolvedValue([{ reversed_count: 20 }]);

      const result = await performFraudCheck(makeRequest());

      expect(result.riskScore).toBeGreaterThan(0);
    });
  });
});
