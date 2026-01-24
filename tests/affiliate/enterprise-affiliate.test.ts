/**
 * Enterprise Affiliate Platform Tests
 * 
 * Tests for the new enterprise affiliate features:
 * - Commission calculation
 * - Cookie utilities
 * - Fingerprint generation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing modules
vi.mock('@/lib/db', () => ({
  prisma: {
    affiliate: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    affiliateTouch: {
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    affiliateRefCode: {
      findFirst: vi.fn(),
    },
    affiliateCommissionPlan: {
      findFirst: vi.fn(),
    },
    affiliatePlanAssignment: {
      findFirst: vi.fn(),
    },
    affiliateCommissionTier: {
      findMany: vi.fn(),
    },
    affiliateProductRate: {
      findMany: vi.fn(),
    },
    affiliatePromotion: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    affiliateCommissionEvent: {
      findUnique: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
    },
    affiliateAttributionConfig: {
      findUnique: vi.fn(),
    },
    affiliateFraudConfig: {
      findUnique: vi.fn(),
    },
    affiliatePayout: {
      aggregate: vi.fn(),
    },
    affiliateTaxDocument: {
      findFirst: vi.fn(),
    },
    affiliateProgram: {
      findUnique: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
    payment: {
      count: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import after mocks
import { calculateCommission } from '@/services/affiliate/affiliateCommissionService';
import { hashIp } from '@/services/affiliate/ipIntelService';
import {
  generateCookieId,
  parseUtmParams,
  getRefCodeFromUrl,
} from '@/lib/affiliate/cookie';
import { AffiliateTracker } from '@/lib/affiliate/tracking-client';

describe('Commission Calculation', () => {
  describe('calculateCommission', () => {
    it('should calculate flat commission correctly', () => {
      const result = calculateCommission(10000, 'FLAT', 500, null);
      expect(result).toBe(500);
    });

    it('should calculate percentage commission correctly', () => {
      // 10% commission (1000 bps) on $100 = $10
      const result = calculateCommission(10000, 'PERCENT', null, 1000);
      expect(result).toBe(1000);
    });

    it('should return 0 for percentage with no rate', () => {
      const result = calculateCommission(10000, 'PERCENT', null, null);
      expect(result).toBe(0);
    });

    it('should handle 5% commission correctly', () => {
      // 5% commission (500 bps) on $200 = $10
      const result = calculateCommission(20000, 'PERCENT', null, 500);
      expect(result).toBe(1000);
    });

    it('should round percentage commissions correctly', () => {
      // 10% commission on $33.33 = $3.33 (rounded)
      const result = calculateCommission(3333, 'PERCENT', null, 1000);
      expect(result).toBe(333);
    });

    it('should handle 15% commission on $50', () => {
      // 15% (1500 bps) on $50 (5000 cents) = $7.50 (750 cents)
      const result = calculateCommission(5000, 'PERCENT', null, 1500);
      expect(result).toBe(750);
    });

    it('should handle very small amounts', () => {
      // 10% on $0.50 = $0.05 (5 cents)
      const result = calculateCommission(50, 'PERCENT', null, 1000);
      expect(result).toBe(5);
    });

    it('should handle 100% commission', () => {
      // 100% (10000 bps) on $100 = $100
      const result = calculateCommission(10000, 'PERCENT', null, 10000);
      expect(result).toBe(10000);
    });
  });
});

describe('IP Hashing', () => {
  describe('hashIp', () => {
    it('should hash IP addresses consistently', () => {
      const ip = '192.168.1.1';
      const hash1 = hashIp(ip);
      const hash2 = hashIp(ip);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
    });

    it('should produce different hashes for different IPs', () => {
      const hash1 = hashIp('192.168.1.1');
      const hash2 = hashIp('192.168.1.2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle IPv6 addresses', () => {
      const hash = hashIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toHaveLength(64);
    });
  });
});

describe('Cookie Utilities', () => {
  beforeEach(() => {
    // @ts-expect-error - mocking global
    global.window = { 
      location: { 
        href: 'https://example.com?ref=TEST123&utm_source=google',
        protocol: 'https:',
      } 
    };
    // @ts-expect-error - mocking global
    global.document = {
      cookie: '',
    };
  });

  describe('generateCookieId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateCookieId();
      const id2 = generateCookieId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toContain('_');
    });

    it('should generate IDs of reasonable length', () => {
      const id = generateCookieId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(50);
    });
  });

  describe('parseUtmParams', () => {
    it('should parse UTM parameters from URL', () => {
      const result = parseUtmParams('https://example.com?utm_source=google&utm_medium=cpc&utm_campaign=test');
      
      expect(result.source).toBe('google');
      expect(result.medium).toBe('cpc');
      expect(result.campaign).toBe('test');
    });

    it('should return empty object for URL without UTM params', () => {
      const result = parseUtmParams('https://example.com');
      expect(Object.keys(result)).toHaveLength(0);
    });

    it('should handle partial UTM parameters', () => {
      const result = parseUtmParams('https://example.com?utm_source=facebook');
      expect(result.source).toBe('facebook');
      expect(result.medium).toBeUndefined();
    });
  });

  describe('getRefCodeFromUrl', () => {
    it('should extract ref code from URL', () => {
      const result = getRefCodeFromUrl('https://example.com?ref=SUMMER2024');
      expect(result).toBe('SUMMER2024');
    });

    it('should handle different parameter names', () => {
      expect(getRefCodeFromUrl('https://example.com?affiliate=AFF123')).toBe('AFF123');
      expect(getRefCodeFromUrl('https://example.com?partner=PARTNER1')).toBe('PARTNER1');
      expect(getRefCodeFromUrl('https://example.com?via=VIA123')).toBe('VIA123');
    });

    it('should return null for URL without ref code', () => {
      const result = getRefCodeFromUrl('https://example.com');
      expect(result).toBeNull();
    });

    it('should handle URL with multiple parameters', () => {
      const result = getRefCodeFromUrl('https://example.com?foo=bar&ref=CODE123&baz=qux');
      expect(result).toBe('CODE123');
    });
  });
});

describe('Tracking Client', () => {
  // These tests require browser environment, testing exports only
  it('should export AffiliateTracker class', () => {
    expect(AffiliateTracker).toBeDefined();
    expect(typeof AffiliateTracker).toBe('function');
  });

  it('should have static methods exported', async () => {
    const { autoTrack, getConversionAttribution, getDefaultTracker } = await import('@/lib/affiliate/tracking-client');
    
    expect(typeof autoTrack).toBe('function');
    expect(typeof getConversionAttribution).toBe('function');
    expect(typeof getDefaultTracker).toBe('function');
  });
});

describe('Commission Calculation Edge Cases', () => {
  describe('basis points conversion', () => {
    it('should correctly convert 1% (100 bps)', () => {
      const result = calculateCommission(10000, 'PERCENT', null, 100);
      expect(result).toBe(100); // $1 on $100
    });

    it('should correctly convert 0.5% (50 bps)', () => {
      const result = calculateCommission(10000, 'PERCENT', null, 50);
      expect(result).toBe(50); // $0.50 on $100
    });

    it('should correctly convert 25% (2500 bps)', () => {
      const result = calculateCommission(10000, 'PERCENT', null, 2500);
      expect(result).toBe(2500); // $25 on $100
    });
  });

  describe('flat rate', () => {
    it('should return flat rate regardless of order amount', () => {
      expect(calculateCommission(100, 'FLAT', 500, null)).toBe(500);
      expect(calculateCommission(10000, 'FLAT', 500, null)).toBe(500);
      expect(calculateCommission(100000, 'FLAT', 500, null)).toBe(500);
    });

    it('should return 0 for null flat rate', () => {
      const result = calculateCommission(10000, 'FLAT', null, null);
      expect(result).toBe(0);
    });
  });
});
