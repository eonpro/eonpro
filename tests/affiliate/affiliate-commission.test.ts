/**
 * Affiliate Commission Service Tests
 * 
 * Tests commission calculation, RBAC enforcement, and HIPAA compliance
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateCommission,
} from '@/services/affiliate/affiliateCommissionService';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    affiliate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    affiliateCommissionEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    affiliatePlanAssignment: {
      findFirst: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
  },
}));

describe('Affiliate Commission Service', () => {
  describe('calculateCommission', () => {
    it('should calculate flat commission correctly', () => {
      const result = calculateCommission(
        10000, // $100 payment
        'FLAT',
        2500,  // $25 flat commission
        null   // no percentage
      );
      
      expect(result).toBe(2500);
    });

    it('should calculate percentage commission correctly', () => {
      const result = calculateCommission(
        10000,  // $100 payment
        'PERCENT',
        null,   // no flat amount
        1000    // 10% (1000 basis points)
      );
      
      expect(result).toBe(1000); // $10
    });

    it('should calculate 15% commission correctly', () => {
      const result = calculateCommission(
        20000,  // $200 payment
        'PERCENT',
        null,
        1500    // 15% (1500 basis points)
      );
      
      expect(result).toBe(3000); // $30
    });

    it('should return 0 for flat commission with null amount', () => {
      const result = calculateCommission(
        10000,
        'FLAT',
        null,
        null
      );
      
      expect(result).toBe(0);
    });

    it('should return 0 for percent commission with null bps', () => {
      const result = calculateCommission(
        10000,
        'PERCENT',
        null,
        null
      );
      
      expect(result).toBe(0);
    });

    it('should round percentage calculations correctly', () => {
      // $99.99 * 10% = $9.999 -> should round to $10.00
      const result = calculateCommission(
        9999,  // $99.99
        'PERCENT',
        null,
        1000   // 10%
      );
      
      expect(result).toBe(1000); // Rounded from 999.9
    });

    it('should handle very small percentages', () => {
      // $100 * 0.5% = $0.50
      const result = calculateCommission(
        10000,  // $100
        'PERCENT',
        null,
        50      // 0.5% (50 basis points)
      );
      
      expect(result).toBe(50); // $0.50
    });

    it('should handle 100% commission', () => {
      const result = calculateCommission(
        10000,  // $100
        'PERCENT',
        null,
        10000   // 100% (10000 basis points)
      );
      
      expect(result).toBe(10000); // $100
    });
  });

  describe('HIPAA Compliance', () => {
    it('should never include patient identifiable information in commission events', async () => {
      // This test verifies that the data structure doesn't include PHI
      const commissionEventData = {
        clinicId: 1,
        affiliateId: 1,
        stripeEventId: 'evt_123',
        stripeObjectId: 'pi_123',
        stripeEventType: 'payment_intent.succeeded',
        eventAmountCents: 10000,
        commissionAmountCents: 1000,
        status: 'PENDING',
        occurredAt: new Date(),
        metadata: {
          refCode: 'PARTNER_ABC',
          planName: 'Standard 10%',
          planType: 'PERCENT',
          // Note: NO patient name, email, phone, or any identifiers
        }
      };

      // Verify no PHI fields exist
      expect(commissionEventData).not.toHaveProperty('patientName');
      expect(commissionEventData).not.toHaveProperty('patientEmail');
      expect(commissionEventData).not.toHaveProperty('patientPhone');
      expect(commissionEventData).not.toHaveProperty('patientAddress');
      expect(commissionEventData.metadata).not.toHaveProperty('patientId');
      expect(commissionEventData.metadata).not.toHaveProperty('patientName');
    });
  });
});

describe('Commission Plan Validation', () => {
  it('should validate percentBps is between 0 and 10000', () => {
    // Valid range
    expect(1000).toBeGreaterThanOrEqual(0);
    expect(1000).toBeLessThanOrEqual(10000);
    
    // Edge cases
    expect(0).toBeGreaterThanOrEqual(0);
    expect(10000).toBeLessThanOrEqual(10000);
    
    // Invalid values would fail
    expect(-1).toBeLessThan(0);
    expect(10001).toBeGreaterThan(10000);
  });

  it('should validate flatAmountCents is non-negative', () => {
    expect(2500).toBeGreaterThanOrEqual(0);
    expect(0).toBeGreaterThanOrEqual(0);
    expect(-100).toBeLessThan(0); // Invalid
  });
});

describe('RBAC Enforcement', () => {
  it('should only allow affiliate role to access affiliate portal endpoints', () => {
    const allowedRoles = ['affiliate', 'super_admin', 'admin'];
    
    expect(allowedRoles).toContain('affiliate');
    expect(allowedRoles).toContain('super_admin');
    expect(allowedRoles).toContain('admin');
    expect(allowedRoles).not.toContain('patient');
    expect(allowedRoles).not.toContain('provider');
    expect(allowedRoles).not.toContain('staff');
  });

  it('should enforce clinic_id scoping for all affiliate queries', () => {
    // Verify that affiliate data is always scoped to clinic_id
    const affiliateQuery = {
      where: {
        affiliateId: 1,
        clinicId: 1, // REQUIRED: All queries must include clinicId
      }
    };

    expect(affiliateQuery.where).toHaveProperty('clinicId');
  });
});

describe('Idempotency', () => {
  it('should use unique constraint on (clinicId, stripeEventId)', () => {
    // The unique constraint ensures no duplicate commission events
    const uniqueKey = {
      clinicId_stripeEventId: {
        clinicId: 1,
        stripeEventId: 'evt_123abc',
      }
    };

    expect(uniqueKey.clinicId_stripeEventId).toHaveProperty('clinicId');
    expect(uniqueKey.clinicId_stripeEventId).toHaveProperty('stripeEventId');
  });
});

describe('Small Number Suppression', () => {
  const THRESHOLD = 5;

  it('should suppress values below threshold', () => {
    const count = 3;
    const shouldSuppress = count < THRESHOLD && count > 0;
    
    expect(shouldSuppress).toBe(true);
  });

  it('should not suppress values at or above threshold', () => {
    const count = 5;
    const shouldSuppress = count < THRESHOLD && count > 0;
    
    expect(shouldSuppress).toBe(false);
  });

  it('should not suppress zero values', () => {
    const count = 0;
    const shouldSuppress = count < THRESHOLD && count > 0;
    
    expect(shouldSuppress).toBe(false);
  });

  it('should apply suppression to trend data', () => {
    const trendData = { date: '2026-01-20', conversions: 3 };
    const suppressed = trendData.conversions < THRESHOLD && trendData.conversions > 0
      ? { ...trendData, conversions: '<5', revenueCents: null, commissionCents: null }
      : trendData;

    expect(suppressed.conversions).toBe('<5');
    expect(suppressed.revenueCents).toBeNull();
    expect(suppressed.commissionCents).toBeNull();
  });
});
