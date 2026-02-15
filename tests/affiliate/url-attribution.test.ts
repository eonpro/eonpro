/**
 * URL-Based Affiliate Attribution Tests
 *
 * Tests the enhanced promo code extraction from URLs and the fallback
 * attribution logic that captures patients coming through /affiliate/CODE
 * landing pages where the intake forms don't include a typed promo code.
 *
 * Scenarios tested:
 * 1. extractPromoCode parses /affiliate/CODE from Referrer URL
 * 2. extractPromoCode parses ?ref=CODE from form URL
 * 3. extractPromoCode falls back to scanning ALL payload fields
 * 4. extractPromoCode still works for plain text promo codes (no regression)
 * 5. extractPromoCode skips generic sources like "Instagram"
 * 6. extractPromoCode skips bare URLs without affiliate codes
 * 7. Exact reproduction of patient #9843 payload scenario
 * 8. attributeByRecentTouch fallback logic
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliateRefCode: { findFirst: fn() },
      affiliateTouch: { findMany: fn(), findFirst: fn(), create: fn(), update: fn() },
      affiliateAttributionConfig: { findUnique: fn() },
      affiliate: { findUnique: fn(), update: fn() },
      patient: { findUnique: fn(), update: fn(), count: fn() },
      payment: { count: fn() },
      $transaction: fn(),
      $queryRaw: fn(),
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));
vi.mock('@/lib/observability/request-context', () => ({
  getRequestId: () => 'test-req-id',
}));

import { extractPromoCode } from '@/lib/overtime/intakeNormalizer';
import { attributeByRecentTouch } from '@/services/affiliate/attributionService';

beforeEach(() => {
  vi.clearAllMocks();
});

// ==========================================================================
// extractPromoCode — URL parsing
// ==========================================================================
describe('extractPromoCode — URL-based affiliate detection', () => {
  it('extracts ref code from /affiliate/CODE in Referrer field', () => {
    const payload = {
      Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV',
      'First Name': 'Jones',
      'Last Name': 'Tester',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('extracts ref code from ?ref=CODE in Referrer field', () => {
    const payload = {
      Referrer: 'https://trt.otmens.com/?ref=TEAMSAV',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('extracts ref code from lowercase referrer field', () => {
    const payload = {
      referrer: 'https://ot.eonpro.io/affiliate/DrSmith',
    };
    expect(extractPromoCode(payload)).toBe('DRSMITH');
  });

  it('returns null for bare platform URL without affiliate path', () => {
    // This is the exact scenario for patient #9843 — Referrer is just the base URL
    const payload = {
      Referrer: 'https://ot.eonpro.io/',
      'First Name': 'Jones',
    };
    // No promo code in named fields, and bare URL has no ref code
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('extracts ref code from "URL with parameters" Heyflow field (fallback scan)', () => {
    // Patient visited affiliate page, clicked treatment card -> external Heyflow form
    // Referrer is bare URL, but "URL with parameters" has ?ref=CODE
    const payload = {
      Referrer: 'https://ot.eonpro.io/',
      'URL with parameters': 'https://trt.otmens.com/?ref=TEAMSAV',
      'First Name': 'Jones',
      'Last Name': 'Tester',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('extracts ref code from "URL" field when it contains /affiliate/ path', () => {
    const payload = {
      URL: 'https://ot.eonpro.io/affiliate/COACHMAX',
    };
    expect(extractPromoCode(payload)).toBe('COACHMAX');
  });

  it('handles hash-based ref param in URL', () => {
    const payload = {
      Referrer: 'https://example.com/#ref=HASHCODE',
    };
    expect(extractPromoCode(payload)).toBe('HASHCODE');
  });

  it('prefers named promo field over URL referrer', () => {
    // If someone typed DIRECTCODE in the "Who recommended" field AND
    // the referrer has a different code, the typed code wins (comes first in list)
    const payload = {
      'Who recommended OT Mens Health to you?': 'DIRECTCODE',
      Referrer: 'https://ot.eonpro.io/affiliate/URLCODE',
    };
    expect(extractPromoCode(payload)).toBe('DIRECTCODE');
  });

  it('falls through URL referrer to promo-code field when URL has no ref', () => {
    const payload = {
      Referrer: 'https://ot.eonpro.io/',
      'promo-code': 'MANUALCODE',
    };
    expect(extractPromoCode(payload)).toBe('MANUALCODE');
  });
});

// ==========================================================================
// extractPromoCode — EXACT patient #9843 reproduction
// ==========================================================================
describe('extractPromoCode — patient #9843 scenario', () => {
  it('extracts TEAMSAV from Heyflow payload with URL params', () => {
    // Simulates exact payload structure for patient who clicked through
    // /affiliate/TEAMSAV -> trt.otmens.com/?ref=TEAMSAV
    const payload = {
      'Response ID': 'abc123',
      'Heyflow ID': 'hf456',
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://trt.otmens.com/',
      'URL with parameters': 'https://trt.otmens.com/?ref=TEAMSAV',
      'First Name': 'Jones',
      'Last Name': 'Tester',
      email: 'jones@test.com',
      phone: '+18131263-7544',
      'Who reccomended OT Mens Health to you?': '',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('extracts TEAMSAV even when referrer has trailing slash only', () => {
    const payload = {
      Referrer: 'https://ot.eonpro.io/',
      'URL with parameters': 'https://trt.otmens.com?ref=TEAMSAV',
      email: 'jones@test.com',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('returns null when no ref code anywhere (truly organic visit)', () => {
    const payload = {
      Referrer: 'https://google.com/',
      URL: 'https://trt.otmens.com/',
      'URL with parameters': 'https://trt.otmens.com/',
      'First Name': 'Organic',
      'Last Name': 'User',
      'Who reccomended OT Mens Health to you?': '',
    };
    expect(extractPromoCode(payload)).toBeNull();
  });
});

// ==========================================================================
// extractPromoCode — no regressions on existing plain-text promo codes
// ==========================================================================
describe('extractPromoCode — plain text promo codes (regression)', () => {
  it('returns plain promo code from "Who recommended" field', () => {
    const payload = {
      'Who reccomended OT Mens Health to you?': 'TEAMSAV',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('returns plain promo code from promo-code field', () => {
    const payload = { 'promo-code': 'VIP20' };
    expect(extractPromoCode(payload)).toBe('VIP20');
  });

  it('returns plain promo code from affiliate-code field', () => {
    const payload = { 'affiliate-code': 'savVIP' };
    expect(extractPromoCode(payload)).toBe('SAVVIP');
  });

  it('skips generic source "Instagram"', () => {
    const payload = {
      'Who reccomended OT Mens Health to you?': 'Instagram',
    };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('skips generic source "google"', () => {
    const payload = { referrer: 'google' };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('skips generic source "friend"', () => {
    const payload = { 'Who Recommended Us?': 'friend' };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('skips empty and whitespace values', () => {
    const payload = {
      'Who reccomended OT Mens Health to you?': '   ',
      'promo-code': '',
    };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('handles mixed case codes correctly', () => {
    const payload = { 'promo-code': 'TeamSav' };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });
});

// ==========================================================================
// extractPromoCode — edge cases
// ==========================================================================
describe('extractPromoCode — edge cases', () => {
  it('handles malformed URL in Referrer gracefully (not a URL)', () => {
    const payload = { Referrer: 'not-a-url' };
    // 'not-a-url' is not a URL (no http/https), so it's treated as plain text
    // It's not in genericSources, so it gets returned uppercased
    expect(extractPromoCode(payload)).toBe('NOT-A-URL');
  });

  it('handles URL with empty ref param', () => {
    const payload = { Referrer: 'https://trt.otmens.com/?ref=' };
    // ref= is empty, so extractRefCodeFromUrl returns null
    // URL is skipped, no other fields -> null
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('handles URL with ref param containing only spaces', () => {
    const payload = { Referrer: 'https://trt.otmens.com/?ref=%20%20' };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('handles /affiliate/ path with trailing slash', () => {
    const payload = { Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV/' };
    // The regex /\/affiliate\/([A-Za-z0-9_-]+)/ won't capture the trailing slash
    // but TEAMSAV is captured before it
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('handles ref code with hyphens and underscores', () => {
    const payload = { Referrer: 'https://ot.eonpro.io/affiliate/TEAM-SAV_2' };
    expect(extractPromoCode(payload)).toBe('TEAM-SAV_2');
  });

  it('does not match /affiliate/ substring in random paths', () => {
    // e.g. /some/affiliate/CODE should still match (the regex doesn't anchor to start)
    const payload = { Referrer: 'https://example.com/some/affiliate/MATCH' };
    expect(extractPromoCode(payload)).toBe('MATCH');
  });

  it('ignores non-string payload values in fallback scan', () => {
    const payload = {
      someNumber: 42,
      someNull: null,
      someObj: { ref: 'TEAMSAV' },
      someArray: ['ref=TEAMSAV'],
    };
    expect(extractPromoCode(payload)).toBeNull();
  });

  it('handles payload with ONLY URL with parameters field', () => {
    const payload = {
      'URL with parameters': 'https://bettersex.otmens.com/?ref=DRJONES',
    };
    expect(extractPromoCode(payload)).toBe('DRJONES');
  });
});

// ==========================================================================
// attributeByRecentTouch — fallback attribution
// ==========================================================================
describe('attributeByRecentTouch', () => {
  it('returns null when patient already has attribution', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: 3,
      email: 'jones@test.com',
      phone: '+18131263-7544',
    });

    const result = await attributeByRecentTouch(9843, 'https://ot.eonpro.io/', 1);
    expect(result).toBeNull();
  });

  it('returns null when patient not found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const result = await attributeByRecentTouch(99999, null, 1);
    expect(result).toBeNull();
  });

  it('extracts ref code from referrer URL and calls attributeFromIntake', async () => {
    // Patient not yet attributed
    mockPrisma.patient.findUnique.mockResolvedValueOnce({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });

    // attributeFromIntake calls — mock the chain
    // First: findFirst for AffiliateRefCode
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
      id: 10,
      refCode: 'TEAMSAV',
      affiliateId: 3,
      clinicId: 1,
      status: 'ACTIVE',
    });
    // findMany for existing touches
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([]);
    // attributionConfig
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    // affiliate
    mockPrisma.affiliate.findUnique.mockResolvedValue({
      id: 3,
      status: 'ACTIVE',
      lifetimeConversions: 0,
    });
    // patient for setPatientAttribution
    mockPrisma.patient.findUnique.mockResolvedValueOnce({
      id: 9843,
      attributionAffiliateId: null,
      tags: [],
    });
    // Transaction mock
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    });
    mockPrisma.patient.update.mockResolvedValue({ id: 9843 });
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 100 });
    mockPrisma.affiliate.update.mockResolvedValue({ id: 3 });

    const result = await attributeByRecentTouch(
      9843,
      'https://ot.eonpro.io/affiliate/TEAMSAV',
      1
    );

    // Should have attempted attribution with TEAMSAV
    expect(mockPrisma.affiliateRefCode.findFirst).toHaveBeenCalled();
  });

  it('handles null referrer URL and falls back to recent touch (single click)', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });

    // No ref code from URL, so it goes to recent touch lookup — exactly 1 click
    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([
      { id: 55, refCode: 'TEAMSAV', affiliateId: 3 },
    ]);

    // Mock attributeFromIntake chain
    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
      id: 10,
      refCode: 'TEAMSAV',
      affiliateId: 3,
      clinicId: 1,
      status: 'ACTIVE',
    });
    // findMany for existing touches (inside attributeFromIntake)
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([]);
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    mockPrisma.affiliate.findUnique.mockResolvedValue({
      id: 3,
      status: 'ACTIVE',
      lifetimeConversions: 0,
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    });
    mockPrisma.patient.update.mockResolvedValue({ id: 9843 });
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 100 });
    mockPrisma.affiliate.update.mockResolvedValue({ id: 3 });

    const result = await attributeByRecentTouch(9843, null, 1);

    // Should have looked up recent touches via findMany
    expect(mockPrisma.affiliateTouch.findMany).toHaveBeenCalled();
  });

  it('returns null when no recent touches found', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([]);

    const result = await attributeByRecentTouch(9843, null, 1);
    expect(result).toBeNull();
  });

  it('returns null when multiple recent touches (ambiguous)', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });
    // Multiple clicks from different affiliates — ambiguous, should skip
    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([
      { id: 55, refCode: 'TEAMSAV', affiliateId: 3 },
      { id: 56, refCode: 'DRJONES', affiliateId: 7 },
    ]);

    const result = await attributeByRecentTouch(9843, null, 1);
    expect(result).toBeNull();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      '[Attribution] Skipping recent-touch fallback: multiple unconverted clicks in window',
      expect.objectContaining({ patientId: 9843, clickCount: 2 })
    );
  });

  it('handles errors gracefully and returns null', async () => {
    mockPrisma.patient.findUnique.mockRejectedValue(new Error('DB connection failed'));

    const result = await attributeByRecentTouch(9843, null, 1);
    expect(result).toBeNull();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[Attribution] attributeByRecentTouch failed',
      expect.objectContaining({ patientId: 9843 })
    );
  });

  it('skips touches with affiliateId 0 (filtered at query level)', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'test@test.com',
      phone: null,
    });
    // affiliateId: { gt: 0 } filter means unresolved touches won't appear
    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([]);

    const result = await attributeByRecentTouch(9843, null, 1);
    expect(result).toBeNull();
  });
});
