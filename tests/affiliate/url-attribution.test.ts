/**
 * COMPREHENSIVE Affiliate Attribution Test Suite
 *
 * This is the CRITICAL test suite for the affiliate program's attribution accuracy.
 * It ensures that EVERY patient who completes an intake from an affiliate URL
 * gets correctly attributed to the right affiliate.
 *
 * Test coverage:
 *
 * A. extractRefCodeFromUrl — URL parsing engine
 *    - Path-based (/affiliate/CODE)
 *    - Query-based (?ref=CODE)
 *    - Hash-based (#ref=CODE)
 *    - Edge cases (malformed URLs, encoding, special chars)
 *
 * B. extractPromoCode — PHASE 1: URL-based fields (HIGHEST PRIORITY)
 *    - "URL with parameters" (the CRITICAL Heyflow field)
 *    - "URL" field
 *    - "Referrer" field
 *    - All field name variants
 *    URLs are machine-generated and CANNOT contain typos — always trusted first.
 *
 * C. extractPromoCode — PHASE 2: Fallback URL scan
 *    - Non-standard field names containing affiliate URLs
 *    - Mixed payloads
 *
 * D. extractPromoCode — PHASE 3: Direct code fields (FALLBACK)
 *    - Every promo field name variant
 *    - Generic source filtering (Instagram, Google, etc.)
 *    - URL values in promo fields
 *    Human-typed codes — useful when no URL attribution exists.
 *
 * E. extractPromoCode — Priority ordering
 *    - URL detection (Phase 1) ALWAYS wins over typed promo codes (Phase 3)
 *    - Phase 1 wins over Phase 2 wins over Phase 3
 *    - Within each phase: first match wins
 *
 * F. Real-world Airtable/Heyflow payload simulations
 *    - Patient #9843 (original TEAMSAV case)
 *    - Patient #17821 (Affiliate Tester — optimize.otmens.com/?ref=TEAMSAV#check-out)
 *    - Peptide Therapy intake
 *    - TRT intake
 *    - Better Sex intake
 *    - Weight Loss intake
 *    - NAD+ intake
 *    - Organic visit (no affiliate)
 *    - Direct Google traffic (no affiliate)
 *
 * G. attributeByRecentTouch — fallback attribution
 *    - Already attributed patients
 *    - URL-based fallback
 *    - Recent touch matching
 *    - Ambiguity handling
 *    - Error resilience
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

// ============================================================================
// A. extractRefCodeFromUrl — URL parsing engine (tested via extractPromoCode)
// ============================================================================
describe('A. URL Parsing — /affiliate/CODE paths', () => {
  it('extracts code from standard /affiliate/CODE path', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV' })).toBe('TEAMSAV');
  });

  it('extracts code from /affiliate/CODE with trailing slash', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV/' })).toBe('TEAMSAV');
  });

  it('uppercases lowercase affiliate codes', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/teamsav' })).toBe('TEAMSAV');
  });

  it('preserves mixed-case and uppercases', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/DrSmith' })).toBe('DRSMITH');
  });

  it('handles hyphens and underscores in codes', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/TEAM-SAV_2' })).toBe('TEAM-SAV_2');
  });

  it('handles /affiliate/ path nested in longer paths', () => {
    expect(extractPromoCode({ Referrer: 'https://example.com/some/affiliate/MATCH' })).toBe('MATCH');
  });

  it('returns null for /affiliate/ without a code', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/affiliate/' })).toBeNull();
  });

  it('returns null for bare domain URL', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io/' })).toBeNull();
  });

  it('returns null for bare domain without trailing slash', () => {
    expect(extractPromoCode({ Referrer: 'https://ot.eonpro.io' })).toBeNull();
  });
});

describe('A. URL Parsing — ?ref=CODE query params', () => {
  it('extracts ref from query param', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?ref=TEAMSAV' })).toBe('TEAMSAV');
  });

  it('extracts ref from query param without leading slash', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com?ref=TEAMSAV' })).toBe('TEAMSAV');
  });

  it('extracts ref alongside other query params', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?utm_source=facebook&ref=TEAMSAV&step=1' })).toBe('TEAMSAV');
  });

  it('handles URL-encoded ref values', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?ref=TEAM%20SAV' })).toBe('TEAM SAV');
  });

  it('returns null for empty ref param', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?ref=' })).toBeNull();
  });

  it('returns null for ref param with only spaces', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?ref=%20%20' })).toBeNull();
  });

  it('returns null for URL with no ref param', () => {
    expect(extractPromoCode({ Referrer: 'https://trt.otmens.com/?utm_source=facebook' })).toBeNull();
  });
});

describe('A. URL Parsing — #ref=CODE hash fragments', () => {
  it('extracts ref from hash fragment', () => {
    expect(extractPromoCode({ Referrer: 'https://example.com/#ref=HASHCODE' })).toBe('HASHCODE');
  });

  it('extracts ref from hash with other params', () => {
    expect(extractPromoCode({ Referrer: 'https://example.com/#step=3&ref=HASHCODE' })).toBe('HASHCODE');
  });

  it('returns null for hash without ref param', () => {
    expect(extractPromoCode({ Referrer: 'https://optimize.otmens.com/#check-out' })).toBeNull();
  });
});

describe('A. URL Parsing — ?ref=CODE before #hash (CRITICAL Heyflow pattern)', () => {
  it('extracts ref from query param when hash follows', () => {
    // This is the EXACT pattern from Heyflow "URL with parameters" field:
    // https://optimize.otmens.com/?ref=TEAMSAV#check-out
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV#check-out',
    })).toBe('TEAMSAV');
  });

  it('extracts ref from query param with complex hash', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://bettersex.otmens.com/?ref=DRJONES#step=2&page=checkout',
    })).toBe('DRJONES');
  });

  it('extracts ref from query param with anchor-only hash', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://weightloss.otmens.com/?ref=FITPRO#logo',
    })).toBe('FITPRO');
  });
});

describe('A. URL Parsing — malformed/edge URLs', () => {
  it('returns null for non-URL strings', () => {
    expect(extractPromoCode({ 'promo-code': 'not-a-url-but-a-code' })).toBe('NOT-A-URL-BUT-A-CODE');
  });

  it('returns null for completely invalid URLs', () => {
    expect(extractPromoCode({ 'URL with parameters': 'not a valid url at all' })).toBeNull();
  });

  it('handles http (non-https) URLs', () => {
    expect(extractPromoCode({ Referrer: 'http://ot.eonpro.io/affiliate/TEAMSAV' })).toBe('TEAMSAV');
  });

  it('ignores non-string payload values', () => {
    expect(extractPromoCode({
      someNumber: 42,
      someNull: null,
      someObj: { ref: 'TEAMSAV' },
      someArray: ['ref=TEAMSAV'],
    })).toBeNull();
  });
});

// ============================================================================
// B. extractPromoCode — PHASE 1: Direct code fields
// ============================================================================
describe('B. Phase 1 — Direct promo/affiliate code fields', () => {
  it.each([
    ['promo-code', 'TEAMSAV'],
    ['promoCode', 'TEAMSAV'],
    ['promo_code', 'TEAMSAV'],
    ['PROMO CODE', 'TEAMSAV'],
    ['Promo Code', 'TEAMSAV'],
    ['influencer-code', 'DRJONES'],
    ['influencerCode', 'DRJONES'],
    ['influencer_code', 'DRJONES'],
    ['INFLUENCER CODE', 'DRJONES'],
    ['Influencer Code', 'DRJONES'],
    ['affiliate-code', 'VIP20'],
    ['affiliateCode', 'VIP20'],
    ['affiliate_code', 'VIP20'],
    ['AFFILIATE CODE', 'VIP20'],
    ['Affiliate Code', 'VIP20'],
    ['partner-code', 'PARTNER1'],
    ['partnerCode', 'PARTNER1'],
    ['partner_code', 'PARTNER1'],
    ['PARTNER CODE', 'PARTNER1'],
    ['Partner Code', 'PARTNER1'],
    ['referral-code', 'REF123'],
    ['referralCode', 'REF123'],
    ['referral_code', 'REF123'],
    ['REFERRAL CODE', 'REF123'],
    ['Referral Code', 'REF123'],
  ])('extracts code from "%s" field', (fieldName, expectedCode) => {
    expect(extractPromoCode({ [fieldName]: expectedCode })).toBe(expectedCode);
  });

  it('extracts from "Who reccomended OT Mens Health to you?" (Airtable typo)', () => {
    expect(extractPromoCode({ 'Who reccomended OT Mens Health to you?': 'TEAMSAV' })).toBe('TEAMSAV');
  });

  it('extracts from "Who recommended OT Mens Health to you?" (correct spelling)', () => {
    expect(extractPromoCode({ 'Who recommended OT Mens Health to you?': 'TEAMSAV' })).toBe('TEAMSAV');
  });

  it('extracts from "Who Recommended Us?"', () => {
    expect(extractPromoCode({ 'Who Recommended Us?': 'TEAMSAV' })).toBe('TEAMSAV');
  });

  it('uppercases mixed-case codes', () => {
    expect(extractPromoCode({ 'promo-code': 'TeamSav' })).toBe('TEAMSAV');
  });

  it('trims whitespace from codes', () => {
    expect(extractPromoCode({ 'promo-code': '  TEAMSAV  ' })).toBe('TEAMSAV');
  });

  it('skips empty string values', () => {
    expect(extractPromoCode({ 'promo-code': '' })).toBeNull();
  });

  it('skips whitespace-only values', () => {
    expect(extractPromoCode({ 'promo-code': '   ' })).toBeNull();
  });
});

describe('B. Phase 1 — Generic source filtering', () => {
  it.each([
    'instagram', 'Instagram', 'INSTAGRAM',
    'facebook', 'Facebook', 'FACEBOOK',
    'google', 'Google', 'GOOGLE',
    'tiktok', 'TikTok', 'TIKTOK',
    'youtube', 'YouTube', 'YOUTUBE',
    'twitter', 'Twitter', 'TWITTER',
    'friend', 'Friend', 'FRIEND',
    'family', 'Family', 'FAMILY',
    'other', 'Other', 'OTHER',
    'n/a', 'N/A', 'N/a',
    'none', 'None', 'NONE',
    '-',
  ])('filters out generic source "%s"', (source) => {
    expect(extractPromoCode({
      'Who reccomended OT Mens Health to you?': source,
    })).toBeNull();
  });

  it('does NOT filter actual affiliate codes that happen to contain generic words', () => {
    // "INSTAGRAM_VIP" is NOT the same as "instagram"
    expect(extractPromoCode({ 'promo-code': 'INSTAGRAM_VIP' })).toBe('INSTAGRAM_VIP');
  });
});

describe('B. Phase 1 — URL values in promo fields', () => {
  it('extracts ref code from URL in "Who recommended" field', () => {
    expect(extractPromoCode({
      'Who recommended OT Mens Health to you?': 'https://ot.eonpro.io/affiliate/TEAMSAV',
    })).toBe('TEAMSAV');
  });

  it('skips bare URL without ref code in "Who recommended" field', () => {
    expect(extractPromoCode({
      'Who recommended OT Mens Health to you?': 'https://ot.eonpro.io/',
    })).toBeNull();
  });

  it('extracts ref code from URL with ?ref= in promo-code field', () => {
    expect(extractPromoCode({
      'promo-code': 'https://trt.otmens.com/?ref=DRJONES',
    })).toBe('DRJONES');
  });
});

// ============================================================================
// C. extractPromoCode — PHASE 2: URL-based fields (CRITICAL)
// ============================================================================
describe('C. Phase 2 — "URL with parameters" field (CRITICAL Heyflow field)', () => {
  it('extracts from "URL with parameters" with ?ref=', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV#check-out',
    })).toBe('TEAMSAV');
  });

  it('extracts from "url with parameters" (lowercase)', () => {
    expect(extractPromoCode({
      'url with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV',
    })).toBe('TEAMSAV');
  });

  it('extracts from "URL With Parameters" (title case)', () => {
    expect(extractPromoCode({
      'URL With Parameters': 'https://bettersex.otmens.com/?ref=DRJONES#check-out',
    })).toBe('DRJONES');
  });

  it('extracts from "urlWithParameters" (camelCase)', () => {
    expect(extractPromoCode({
      urlWithParameters: 'https://trt.otmens.com/?ref=COACHMAX',
    })).toBe('COACHMAX');
  });

  it('extracts from "url_with_parameters" (snake_case)', () => {
    expect(extractPromoCode({
      url_with_parameters: 'https://weightloss.otmens.com/?ref=FITPRO',
    })).toBe('FITPRO');
  });

  it('returns null when URL with parameters has no ref code', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
    })).toBeNull();
  });
});

describe('C. Phase 2 — "URL" field', () => {
  it('extracts from "URL" field with /affiliate/ path', () => {
    expect(extractPromoCode({
      URL: 'https://ot.eonpro.io/affiliate/COACHMAX',
    })).toBe('COACHMAX');
  });

  it('extracts from "url" (lowercase) field with ?ref=', () => {
    expect(extractPromoCode({
      url: 'https://trt.otmens.com/?ref=TEAMSAV',
    })).toBe('TEAMSAV');
  });

  it('returns null for "URL" without ref code', () => {
    expect(extractPromoCode({
      URL: 'https://optimize.otmens.com/',
    })).toBeNull();
  });
});

describe('C. Phase 2 — "Referrer" field', () => {
  it('extracts from "Referrer" with /affiliate/ path', () => {
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV',
    })).toBe('TEAMSAV');
  });

  it('extracts from "referrer" (lowercase) with ?ref=', () => {
    expect(extractPromoCode({
      referrer: 'https://trt.otmens.com/?ref=DRJONES',
    })).toBe('DRJONES');
  });

  it('returns null for "Referrer" with bare domain', () => {
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/',
    })).toBeNull();
  });

  it('returns null for "Referrer" with external domain', () => {
    expect(extractPromoCode({
      Referrer: 'https://www.otmens.com/',
    })).toBeNull();
  });

  it('returns null for "Referrer" with google.com', () => {
    expect(extractPromoCode({
      Referrer: 'https://www.google.com/',
    })).toBeNull();
  });

  it('ignores non-URL text in Referrer (Phase 2 only checks URLs)', () => {
    expect(extractPromoCode({
      Referrer: 'some-text-not-a-url',
    })).toBeNull();
  });
});

// ============================================================================
// D. extractPromoCode — PHASE 3: Fallback scan
// ============================================================================
describe('D. Phase 3 — Fallback scan of all payload fields', () => {
  it('finds ref code in a non-standard field name', () => {
    expect(extractPromoCode({
      'custom-tracking-field': 'https://trt.otmens.com/?ref=HIDDEN_CODE',
    })).toBe('HIDDEN_CODE');
  });

  it('finds /affiliate/ URL in a random field', () => {
    expect(extractPromoCode({
      notes: 'https://ot.eonpro.io/affiliate/TEAMSAV',
    })).toBe('TEAMSAV');
  });

  it('does not trigger for URLs without /affiliate/ or ref=', () => {
    expect(extractPromoCode({
      'some-url-field': 'https://www.google.com/search?q=otmens',
    })).toBeNull();
  });

  it('ignores non-string values in fallback scan', () => {
    expect(extractPromoCode({
      someNumber: 42,
      someObj: { url: 'https://ot.eonpro.io/affiliate/TEAMSAV' },
      someArray: ['https://ot.eonpro.io/affiliate/TEAMSAV'],
    })).toBeNull();
  });
});

// ============================================================================
// E. extractPromoCode — Priority ordering
// ============================================================================
describe('E. Priority — URL (Phase 1) > URL fallback (Phase 2) > Typed code (Phase 3)', () => {
  // -------------------------------------------------------------------------
  // THE CORE RULE: URL-based detection ALWAYS beats typed promo codes.
  // URLs are machine-generated and cannot contain typos. Promo codes are
  // human-typed and may have errors. The URL is the source of truth.
  // -------------------------------------------------------------------------

  it('URL ref param (Phase 1) ALWAYS beats typed promo code (Phase 3)', () => {
    // Patient typed "DIRECTCODE" but arrived via ?ref=URLCODE — URL wins
    expect(extractPromoCode({
      'promo-code': 'DIRECTCODE',
      'URL with parameters': 'https://optimize.otmens.com/?ref=URLCODE#check-out',
      Referrer: 'https://ot.eonpro.io/affiliate/REFERRERCODE',
    })).toBe('URLCODE');
  });

  it('URL ref param beats "Who recommended" text (even if different code)', () => {
    // Patient typed "FRIEND_CODE" in the field but the URL has the real code
    expect(extractPromoCode({
      'Who recommended OT Mens Health to you?': 'FRIEND_CODE',
      'URL with parameters': 'https://optimize.otmens.com/?ref=REAL_CODE',
    })).toBe('REAL_CODE');
  });

  it('Referrer /affiliate/ path beats typed promo code', () => {
    expect(extractPromoCode({
      'promo-code': 'TYPED_CODE',
      Referrer: 'https://ot.eonpro.io/affiliate/URL_CODE',
    })).toBe('URL_CODE');
  });

  it('"URL with parameters" beats "Referrer" (comes first in Phase 1 list)', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=URL_PARAMS',
      Referrer: 'https://ot.eonpro.io/affiliate/REFERRER_CODE',
    })).toBe('URL_PARAMS');
  });

  it('Phase 1 URL beats Phase 2 fallback URL scan', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=PHASE1_URL',
      'some-random-field': 'https://ot.eonpro.io/affiliate/PHASE2_FALLBACK',
    })).toBe('PHASE1_URL');
  });

  it('Phase 2 fallback URL scan beats Phase 3 typed code', () => {
    expect(extractPromoCode({
      'promo-code': 'TYPED_CODE',
      'weird_custom_field': 'https://ot.eonpro.io/affiliate/SCAN_CODE',
    })).toBe('SCAN_CODE');
  });

  it('Phase 3 promo-code field beats "Who recommended" (within Phase 3)', () => {
    expect(extractPromoCode({
      'promo-code': 'PROMO',
      'Who recommended OT Mens Health to you?': 'RECOMMENDED',
    })).toBe('PROMO');
  });

  it('URL wins even when promo code is set AND generic source is set', () => {
    expect(extractPromoCode({
      'Who reccomended OT Mens Health to you?': 'Instagram',
      'promo-code': 'TYPED_WRONG',
      'URL with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV#check-out',
    })).toBe('TEAMSAV');
  });

  it('falls through to Phase 3 typed code when URLs have no ref', () => {
    expect(extractPromoCode({
      'promo-code': 'TYPED_CODE',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      Referrer: 'https://www.otmens.com/',
    })).toBe('TYPED_CODE');
  });

  it('falls through to Phase 2 fallback when Phase 1 URLs have no ref', () => {
    expect(extractPromoCode({
      Referrer: 'https://www.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      'weird_custom_field': 'https://ot.eonpro.io/affiliate/FALLBACK',
    })).toBe('FALLBACK');
  });

  it('returns null when ALL phases find nothing', () => {
    expect(extractPromoCode({
      'Who reccomended OT Mens Health to you?': 'Instagram',
      Referrer: 'https://www.otmens.com/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      'First Name': 'John',
      'Last Name': 'Doe',
    })).toBeNull();
  });
});

// ============================================================================
// F. Real-world Airtable/Heyflow payload simulations
// ============================================================================
describe('F. Real-world — Patient #9843 (original TEAMSAV case)', () => {
  it('extracts TEAMSAV from exact payload structure', () => {
    const payload = {
      'Response ID': 'abc123',
      'Heyflow ID': 'hf456',
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://trt.otmens.com/',
      'URL with parameters': 'https://trt.otmens.com/?ref=TEAMSAV',
      'First name': 'Jones',
      'Last name': 'Tester',
      email: 'jones@test.com',
      'phone number': '+18131263-7544',
      'Who reccomended OT Mens Health to you?': '',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });
});

describe('F. Real-world — Patient #17821 (Affiliate Tester, optimize.otmens.com)', () => {
  it('extracts TEAMSAV from exact Airtable row 1132 payload', () => {
    // This is the EXACT payload structure from the Airtable screenshot:
    // - Row 1132 in "OT Mens - Peptide Therapy"
    // - Referrer: https://ot.eonpro.io/
    // - URL with parameters: https://optimize.otmens.com/?ref=TEAMSAV#check-out
    const payload = {
      'Response ID': '7Pdtu25EPljrYelgzhp0',
      'Heyflow ID': 'uCLot8VMKQPi3U2aNub4',
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV#check-out',
      'First name': 'Affiliate',
      'Last name': 'Tester',
      email: 'affiliate@test.com',
      'phone number': '+17275112536',
      DOB: '09/10/2000',
      Gender: 'Male',
      State: 'FL',
      'Who reccomended OT Mens Health to you?': '',
      'Checkout Completed': 'true',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });

  it('still finds TEAMSAV even without the Referrer field', () => {
    const payload = {
      'URL with parameters': 'https://optimize.otmens.com/?ref=TEAMSAV#check-out',
      'First name': 'Affiliate',
      'Last name': 'Tester',
    };
    expect(extractPromoCode(payload)).toBe('TEAMSAV');
  });
});

describe('F. Real-world — every treatment type intake from affiliate', () => {
  // These simulate the exact Heyflow forms for each OT Mens treatment
  // when a visitor arrives from /affiliate/CODE and clicks a treatment card.

  it('Peptide Therapy — optimize.otmens.com/?ref=CODE#check-out', () => {
    expect(extractPromoCode({
      'Heyflow ID': 'uCLot8VMKQPi3U2aNub4',
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/?ref=PEPTIDE_AFF#check-out',
      'Who reccomended OT Mens Health to you?': '',
      'First name': 'Test', 'Last name': 'Patient',
    })).toBe('PEPTIDE_AFF');
  });

  it('TRT — trt.otmens.com/?ref=CODE', () => {
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://trt.otmens.com/',
      'URL with parameters': 'https://trt.otmens.com/?ref=TRT_AFF',
      'Who recommended OT Mens Health to you?': '',
      'First name': 'Test', 'Last name': 'Patient',
    })).toBe('TRT_AFF');
  });

  it('Better Sex — bettersex.otmens.com/?ref=CODE#check-out', () => {
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://bettersex.otmens.com/',
      'URL with parameters': 'https://bettersex.otmens.com/?ref=SEX_AFF#check-out',
      'Who reccomended OT Mens Health to you?': '',
    })).toBe('SEX_AFF');
  });

  it('Weight Loss — weightloss.otmens.com/?ref=CODE', () => {
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://weightloss.otmens.com/',
      'URL with parameters': 'https://weightloss.otmens.com/?ref=WLOSS_AFF#check-out',
    })).toBe('WLOSS_AFF');
  });

  it('NAD+ — optimize.otmens.com/?ref=CODE#logo', () => {
    // NAD+ intake uses optimize.otmens.com with #logo hash
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/?ref=NAD_AFF#logo',
    })).toBe('NAD_AFF');
  });

  it('Baseline Bloodwork — from /affiliate/CODE landing page', () => {
    // Baseline might use the /affiliate/ path directly
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/affiliate/BLOOD_AFF',
      URL: 'https://ot.eonpro.io/baseline',
    })).toBe('BLOOD_AFF');
  });
});

describe('F. Real-world — non-affiliate traffic (should return null)', () => {
  it('Organic Google traffic — no ref anywhere', () => {
    expect(extractPromoCode({
      'Heyflow ID': 'uCLot8VMKQPi3U2aNub4',
      Referrer: 'https://www.google.com/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      'Who reccomended OT Mens Health to you?': '',
      'First name': 'Organic', 'Last name': 'User',
    })).toBeNull();
  });

  it('Direct traffic from otmens.com — no ref', () => {
    expect(extractPromoCode({
      Referrer: 'https://www.otmens.com/',
      URL: 'https://trt.otmens.com/',
      'URL with parameters': 'https://trt.otmens.com/#check-out',
    })).toBeNull();
  });

  it('Social media referral (Instagram answer) — no code', () => {
    expect(extractPromoCode({
      Referrer: 'https://www.instagram.com/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      'Who reccomended OT Mens Health to you?': 'Instagram',
    })).toBeNull();
  });

  it('Friend referral (text answer) — no code', () => {
    expect(extractPromoCode({
      Referrer: '',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/',
      'Who reccomended OT Mens Health to you?': 'friend',
    })).toBeNull();
  });

  it('Empty payload — no crash', () => {
    expect(extractPromoCode({})).toBeNull();
  });

  it('Payload with only non-relevant fields', () => {
    expect(extractPromoCode({
      'First name': 'John',
      'Last name': 'Doe',
      email: 'john@doe.com',
      DOB: '01/01/1990',
    })).toBeNull();
  });
});

describe('F. Real-world — standard non-affiliate Heyflow rows (bulk pattern)', () => {
  // Simulates the majority of Airtable rows from the screenshot that have NO affiliate ref
  it('standard Heyflow row (no ref) — most common pattern', () => {
    expect(extractPromoCode({
      'Response ID': '6riv0JbcZxlkzzFzlzxh',
      'Heyflow ID': 'uCLot8VMKQPi3U2aNub4',
      Referrer: 'https://www.otmens.com/',
      URL: 'https://optimize.otmens.com/',
      'URL with parameters': 'https://optimize.otmens.com/#check-out',
      'First name': 'John',
      'Last name': 'Doe',
    })).toBeNull();
  });
});

// ============================================================================
// G. attributeByRecentTouch — fallback attribution
// ============================================================================
describe('G. attributeByRecentTouch', () => {
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
    mockPrisma.patient.findUnique.mockResolvedValueOnce({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });

    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
      id: 10, refCode: 'TEAMSAV', affiliateId: 3, clinicId: 1, status: 'ACTIVE',
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([]);
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    mockPrisma.affiliate.findUnique.mockResolvedValue({
      id: 3, status: 'ACTIVE', lifetimeConversions: 0,
    });
    mockPrisma.patient.findUnique.mockResolvedValueOnce({
      id: 9843, attributionAffiliateId: null, tags: [],
    });
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

    expect(mockPrisma.affiliateRefCode.findFirst).toHaveBeenCalled();
  });

  it('handles null referrer URL and falls back to recent touch (single click)', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });

    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([
      { id: 55, refCode: 'TEAMSAV', affiliateId: 3 },
    ]);

    mockPrisma.affiliateRefCode.findFirst.mockResolvedValue({
      id: 10, refCode: 'TEAMSAV', affiliateId: 3, clinicId: 1, status: 'ACTIVE',
    });
    mockPrisma.affiliateTouch.findMany.mockResolvedValue([]);
    mockPrisma.affiliateAttributionConfig.findUnique.mockResolvedValue(null);
    mockPrisma.affiliate.findUnique.mockResolvedValue({
      id: 3, status: 'ACTIVE', lifetimeConversions: 0,
    });
    mockPrisma.$transaction.mockImplementation(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    });
    mockPrisma.patient.update.mockResolvedValue({ id: 9843 });
    mockPrisma.affiliateTouch.create.mockResolvedValue({ id: 100 });
    mockPrisma.affiliate.update.mockResolvedValue({ id: 3 });

    const result = await attributeByRecentTouch(9843, null, 1);

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

  it('returns null when multiple recent touches (ambiguous — prevents misattribution)', async () => {
    mockPrisma.patient.findUnique.mockResolvedValue({
      id: 9843,
      attributionAffiliateId: null,
      email: 'jones@test.com',
      phone: null,
    });
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

  it('handles errors gracefully and returns null (never crashes)', async () => {
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
    mockPrisma.affiliateTouch.findMany.mockResolvedValueOnce([]);

    const result = await attributeByRecentTouch(9843, null, 1);
    expect(result).toBeNull();
  });
});

// ============================================================================
// H. Stress / comprehensive edge cases
// ============================================================================
describe('H. Comprehensive edge cases', () => {
  it('handles extremely long URLs gracefully', () => {
    const longCode = 'A'.repeat(100);
    expect(extractPromoCode({
      'URL with parameters': `https://optimize.otmens.com/?ref=${longCode}#check-out`,
    })).toBe(longCode);
  });

  it('handles URL with multiple ref params (first one wins)', () => {
    // URLSearchParams.get() returns the first occurrence
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=FIRST&ref=SECOND',
    })).toBe('FIRST');
  });

  it('handles URL with ref in both query and hash (query wins)', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=QUERY#ref=HASH',
    })).toBe('QUERY');
  });

  it('handles payload with ALL empty string values', () => {
    expect(extractPromoCode({
      'promo-code': '',
      'affiliate-code': '',
      Referrer: '',
      'URL with parameters': '',
      'Who reccomended OT Mens Health to you?': '',
    })).toBeNull();
  });

  it('handles payload with undefined values', () => {
    expect(extractPromoCode({
      'promo-code': undefined as any,
      Referrer: undefined as any,
    })).toBeNull();
  });

  it('handles payload with null values', () => {
    expect(extractPromoCode({
      'promo-code': null as any,
      Referrer: null as any,
    })).toBeNull();
  });

  it('handles payload with numeric values in string fields', () => {
    expect(extractPromoCode({
      'promo-code': 12345 as any,
    })).toBeNull(); // typeof check filters non-strings
  });

  it('handles URL with special characters in ref code', () => {
    expect(extractPromoCode({
      'URL with parameters': 'https://optimize.otmens.com/?ref=CODE%2B123',
    })).toBe('CODE+123');
  });

  it('all treatment URLs from affiliate landing page work with buildTreatmentUrl pattern', () => {
    // These are the actual URLs generated by buildTreatmentUrl() in the affiliate landing page
    const treatmentUrls = [
      'https://bettersex.otmens.com/?ref=TEAMSAV',
      'https://optimize.otmens.com/?ref=TEAMSAV',
      'https://optimize.otmens.com/?ref=TEAMSAV#logo',
      'https://trt.otmens.com/?ref=TEAMSAV',
      'https://weightloss.otmens.com/?ref=TEAMSAV',
    ];

    for (const url of treatmentUrls) {
      expect(extractPromoCode({ 'URL with parameters': url })).toBe('TEAMSAV');
    }
  });

  it('all CTA URLs from affiliate landing page work with buildCtaUrl pattern', () => {
    // buildCtaUrl generates: https://ot.eonpro.io/trt?ref=CODE
    const ctaUrls = [
      'https://ot.eonpro.io/trt?ref=TEAMSAV',
      'https://ot.eonpro.io/peptides?ref=TEAMSAV',
      'https://ot.eonpro.io/weight-loss?ref=TEAMSAV',
      'https://ot.eonpro.io/better-sex?ref=TEAMSAV',
      'https://ot.eonpro.io/nad?ref=TEAMSAV',
      'https://ot.eonpro.io/bloodwork?ref=TEAMSAV',
    ];

    for (const url of ctaUrls) {
      expect(extractPromoCode({ 'URL with parameters': url })).toBe('TEAMSAV');
    }
  });

  it('affiliate landing page URL itself is captured via /affiliate/ path', () => {
    // When someone visits /affiliate/TEAMSAV, the Referrer might show this URL
    expect(extractPromoCode({
      Referrer: 'https://ot.eonpro.io/affiliate/TEAMSAV',
    })).toBe('TEAMSAV');
  });
});
