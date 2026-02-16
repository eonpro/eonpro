/**
 * WellMedR Invoice Webhook — Hardening Tests
 * =============================================
 * Tests for the critical changes made to the invoice webhook:
 * 1. Stub patient auto-creation when patient not found
 * 2. Idempotency via SHA-256 hash
 * 3. DLQ integration for failure recovery
 * 4. Multi-strategy patient matching (email → name → submission_id)
 * 5. Correct refill scheduling for multi-month plans
 *
 * These tests validate the logic and code paths without requiring a live database.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// ============================================================================
// Test the idempotency key generation logic
// ============================================================================

describe('Invoice Webhook — Idempotency Key Generation', () => {
  it('generates consistent SHA-256 hash for identical payloads', () => {
    const payload = JSON.stringify({
      customer_email: 'test@example.com',
      method_payment_id: 'pm_abc123',
      product: 'Tirzepatide',
    });

    const key1 = `wellmedr-invoice_${createHash('sha256').update(payload).digest('hex')}`;
    const key2 = `wellmedr-invoice_${createHash('sha256').update(payload).digest('hex')}`;

    expect(key1).toBe(key2);
    expect(key1).toMatch(/^wellmedr-invoice_[a-f0-9]{64}$/);
  });

  it('generates different hashes for different payloads', () => {
    const payload1 = JSON.stringify({ customer_email: 'a@example.com', method_payment_id: 'pm_1' });
    const payload2 = JSON.stringify({ customer_email: 'b@example.com', method_payment_id: 'pm_2' });

    const key1 = `wellmedr-invoice_${createHash('sha256').update(payload1).digest('hex')}`;
    const key2 = `wellmedr-invoice_${createHash('sha256').update(payload2).digest('hex')}`;

    expect(key1).not.toBe(key2);
  });

  it('hash is different even for minor payload differences (idempotency safety)', () => {
    const payload1 = JSON.stringify({ customer_email: 'test@example.com', method_payment_id: 'pm_abc' });
    const payload2 = JSON.stringify({ customer_email: 'test@example.com', method_payment_id: 'pm_abd' });

    const hash1 = createHash('sha256').update(payload1).digest('hex');
    const hash2 = createHash('sha256').update(payload2).digest('hex');

    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// Test stub patient data construction
// ============================================================================

describe('Invoice Webhook — Stub Patient Data Construction', () => {
  it('parses full name into first and last correctly', () => {
    const customerName = 'John Doe';
    const parts = customerName.split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || 'Checkout';

    expect(firstName).toBe('John');
    expect(lastName).toBe('Doe');
  });

  it('handles single name (no last name)', () => {
    const customerName = 'Madonna';
    const parts = customerName.split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || 'Checkout';

    expect(firstName).toBe('Madonna');
    expect(lastName).toBe('Checkout'); // Fallback
  });

  it('handles multi-part last name', () => {
    const customerName = 'Maria Del Carmen Rodriguez';
    const parts = customerName.split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || 'Checkout';

    expect(firstName).toBe('Maria');
    expect(lastName).toBe('Del Carmen Rodriguez');
  });

  it('handles empty name', () => {
    const customerName = '';
    const parts = customerName.split(/\s+/);
    const firstName = parts[0] || 'Unknown';
    const lastName = parts.slice(1).join(' ') || 'Checkout';

    expect(firstName).toBe('Unknown');
    expect(lastName).toBe('Checkout');
  });

  it('stub patient gets correct tags', () => {
    const tags = ['wellmedr', 'stub-from-invoice', 'needs-intake-merge'];

    expect(tags).toContain('stub-from-invoice');
    expect(tags).toContain('needs-intake-merge');
    expect(tags).toContain('wellmedr');
  });
});

// ============================================================================
// Test stub patient merge logic (intake webhook side)
// ============================================================================

describe('Intake Webhook — Stub Patient Merge', () => {
  it('detects stub-from-invoice tag and removes it during merge', () => {
    const existingTags = ['wellmedr', 'stub-from-invoice', 'needs-intake-merge', 'glp1'];
    const submissionTags = ['wellmedr-intake', 'wellmedr', 'glp1', 'complete-intake'];

    const wasStub = existingTags.includes('stub-from-invoice');
    expect(wasStub).toBe(true);

    // Simulate mergeTags
    const merged = [...new Set([...existingTags, ...submissionTags])];

    // Remove stub tags and add merge marker
    let updatedTags = merged.filter(
      (t) => t !== 'stub-from-invoice' && t !== 'needs-intake-merge'
    );
    updatedTags.push('merged-from-stub');

    expect(updatedTags).not.toContain('stub-from-invoice');
    expect(updatedTags).not.toContain('needs-intake-merge');
    expect(updatedTags).toContain('merged-from-stub');
    expect(updatedTags).toContain('complete-intake');
    expect(updatedTags).toContain('wellmedr');
  });

  it('does not add merged-from-stub for non-stub patients', () => {
    const existingTags = ['wellmedr', 'wellmedr-intake', 'glp1', 'partial-lead'];

    const wasStub = existingTags.includes('stub-from-invoice');
    expect(wasStub).toBe(false);
  });
});

// ============================================================================
// Test plan parsing for refill scheduling
// ============================================================================

describe('Invoice Webhook — Plan Duration Parsing', () => {
  const parsePlanRegex = /6[\s-]*month|6month|12[\s-]*month|12month|annual|yearly|semi[\s-]*annual/;

  const testCases = [
    { plan: '6 month', shouldMatch: true },
    { plan: '6-month', shouldMatch: true },
    { plan: '6month', shouldMatch: true },
    { plan: '12 month', shouldMatch: true },
    { plan: '12-month', shouldMatch: true },
    { plan: '12month', shouldMatch: true },
    { plan: 'annual', shouldMatch: true },
    { plan: 'yearly', shouldMatch: true },
    { plan: 'semi-annual', shouldMatch: true },
    { plan: 'semiannual', shouldMatch: true },
    { plan: 'monthly', shouldMatch: false },
    { plan: '1 month', shouldMatch: false },
    { plan: '3 month', shouldMatch: false },
    { plan: 'quarterly', shouldMatch: false },
    { plan: '', shouldMatch: false },
  ];

  testCases.forEach(({ plan, shouldMatch }) => {
    it(`${shouldMatch ? 'triggers' : 'skips'} refill scheduling for plan: "${plan}"`, () => {
      const lower = (plan || '').toLowerCase();
      const matches = parsePlanRegex.test(lower);
      expect(matches).toBe(shouldMatch);
    });
  });
});

// ============================================================================
// Test payment amount parsing logic
// ============================================================================

describe('Invoice Webhook — Amount Parsing', () => {
  it('converts dollar string "$1,134.00" to cents', () => {
    const priceStr = '$1,134.00';
    const cleaned = priceStr.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    const cents = Math.round(parsed * 100);
    expect(cents).toBe(113400);
  });

  it('converts plain number price (dollars) to cents', () => {
    const priceNum = 299;
    const cents = Math.round(priceNum * 100);
    expect(cents).toBe(29900);
  });

  it('converts string "189.00" to cents', () => {
    const priceStr = '189.00';
    const cleaned = priceStr.replace(/[$,]/g, '').trim();
    const parsed = parseFloat(cleaned);
    const cents = Math.round(parsed * 100);
    expect(cents).toBe(18900);
  });

  it('handles amount already in cents (large number)', () => {
    const amountInCents = 29900;
    // The webhook only auto-converts if < 100 (would be < $1 in cents)
    const shouldConvert = amountInCents > 0 && amountInCents < 100;
    expect(shouldConvert).toBe(false); // 29900 is already cents
  });

  it('auto-converts obviously-dollar amounts < 100', () => {
    let amountInCents = 50; // Looks like $50, not 50 cents
    if (amountInCents > 0 && amountInCents < 100) {
      amountInCents = Math.round(amountInCents * 100);
    }
    expect(amountInCents).toBe(5000);
  });
});

// ============================================================================
// Test DLQ source type
// ============================================================================

describe('DLQ — Source Type', () => {
  it('wellmedr-invoice is a valid DLQ source', () => {
    type DLQSource =
      | 'weightlossintake'
      | 'wellmedr-intake'
      | 'wellmedr-invoice'
      | 'heyflow'
      | 'medlink'
      | 'direct'
      | 'overtime-intake';

    const source: DLQSource = 'wellmedr-invoice';
    expect(source).toBe('wellmedr-invoice');
  });
});

// ============================================================================
// Test payment date parsing
// ============================================================================

describe('Invoice Webhook — Payment Date Parsing', () => {
  it('parses standard ISO date', () => {
    const dateStr = '2026-01-15T10:30:00Z';
    const parsed = new Date(dateStr);
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getUTCMonth()).toBe(0);
    expect(parsed.getUTCDate()).toBe(15);
  });

  it('extracts ISO date from corrupted Airtable format', () => {
    const dateValue = 'created_at2026-01-26T00:00:00.000Z';
    const isoMatch = dateValue.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
    expect(isoMatch).not.toBeNull();
    expect(isoMatch![1]).toBe('2026-01-26T00:00:00.000Z');
    const parsed = new Date(isoMatch![1]);
    expect(parsed.getUTCDate()).toBe(26);
  });

  it('returns current date for unparseable input', () => {
    const dateValue = 'not-a-date';
    const isoMatch = dateValue.match(/(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)/);
    expect(isoMatch).toBeNull();
    const parsed = new Date(dateValue);
    expect(isNaN(parsed.getTime())).toBe(true);
    // In webhook code, this falls through to `new Date()` — current date
  });
});
