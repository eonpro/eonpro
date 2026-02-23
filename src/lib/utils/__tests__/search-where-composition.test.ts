/**
 * Targeted test for search WHERE clause composition in admin patient routes.
 * Validates that the AND-based composition preserves the base OR constraint
 * (invoice/order requirement) when combined with search filters.
 */
import { describe, it, expect } from 'vitest';
import { buildPatientSearchWhere, splitSearchTerms, isSearchIndexIncomplete, buildPatientSearchIndex } from '../search';

describe('buildPatientSearchWhere', () => {
  it('returns empty object for empty search', () => {
    expect(buildPatientSearchWhere('')).toEqual({});
    expect(buildPatientSearchWhere('   ')).toEqual({});
  });

  it('returns searchIndex filter for phone-only search', () => {
    const result = buildPatientSearchWhere('5551234567');
    expect(result).toHaveProperty('searchIndex');
    expect(result.searchIndex).toEqual({ contains: '5551234567', mode: 'insensitive' });
    expect(result).not.toHaveProperty('OR');
    expect(result).not.toHaveProperty('AND');
  });

  it('returns AND with nested OR for single term', () => {
    const result = buildPatientSearchWhere('john');
    expect(result).toHaveProperty('AND');
    expect(Array.isArray(result.AND)).toBe(true);
    const andArray = result.AND as any[];
    expect(andArray).toHaveLength(1);
    expect(andArray[0]).toHaveProperty('OR');
  });

  it('returns AND with nested OR for multi-term search', () => {
    const result = buildPatientSearchWhere('john doe');
    expect(result).toHaveProperty('AND');
    const andArray = result.AND as any[];
    expect(andArray).toHaveLength(2);
    expect(andArray[0]).toHaveProperty('OR');
    expect(andArray[1]).toHaveProperty('OR');
  });
});

describe('AND composition (admin patients route pattern)', () => {
  it('preserves base OR when composing with single-term search', () => {
    const whereClause: Record<string, any> = {
      OR: [
        { invoices: { some: {} } },
        { orders: { some: {} } },
      ],
      clinicId: 1,
    };

    const search = 'john';
    const searchFilter = buildPatientSearchWhere(search);

    // This is the fix pattern: use AND array composition
    whereClause.AND = [
      ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
      searchFilter,
    ];

    // Base OR must be preserved
    expect(whereClause.OR).toEqual([
      { invoices: { some: {} } },
      { orders: { some: {} } },
    ]);
    expect(whereClause.clinicId).toBe(1);
    expect(whereClause.AND).toHaveLength(1);
    expect(whereClause.AND[0]).toHaveProperty('AND');
  });

  it('preserves base OR when composing with phone search', () => {
    const whereClause: Record<string, any> = {
      OR: [
        { invoices: { some: {} } },
        { orders: { some: {} } },
      ],
    };

    const searchFilter = buildPatientSearchWhere('5551234567');
    whereClause.AND = [
      ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
      searchFilter,
    ];

    expect(whereClause.OR).toEqual([
      { invoices: { some: {} } },
      { orders: { some: {} } },
    ]);
    expect(whereClause.AND).toHaveLength(1);
    expect(whereClause.AND[0]).toHaveProperty('searchIndex');
  });

  it('handles pre-existing AND array', () => {
    const whereClause: Record<string, any> = {
      OR: [{ invoices: { some: {} } }],
      AND: [{ clinicId: 1 }],
    };

    const searchFilter = buildPatientSearchWhere('john');
    whereClause.AND = [
      ...(Array.isArray(whereClause.AND) ? whereClause.AND : whereClause.AND ? [whereClause.AND] : []),
      searchFilter,
    ];

    expect(whereClause.AND).toHaveLength(2);
    expect(whereClause.AND[0]).toEqual({ clinicId: 1 });
    expect(whereClause.AND[1]).toHaveProperty('AND');
  });
});

describe('splitSearchTerms', () => {
  it('splits multi-word searches', () => {
    expect(splitSearchTerms('john doe')).toEqual(['john', 'doe']);
  });

  it('handles extra whitespace', () => {
    expect(splitSearchTerms('  john   doe  ')).toEqual(['john', 'doe']);
  });

  it('lowercases terms', () => {
    expect(splitSearchTerms('John DOE')).toEqual(['john', 'doe']);
  });

  it('returns empty for blank input', () => {
    expect(splitSearchTerms('')).toEqual([]);
    expect(splitSearchTerms('   ')).toEqual([]);
  });
});

describe('isSearchIndexIncomplete', () => {
  it('returns true for null or empty', () => {
    expect(isSearchIndexIncomplete(null)).toBe(true);
    expect(isSearchIndexIncomplete(undefined)).toBe(true);
    expect(isSearchIndexIncomplete('')).toBe(true);
    expect(isSearchIndexIncomplete('   ')).toBe(true);
  });

  it('returns true for single token (patientId only)', () => {
    expect(isSearchIndexIncomplete('eon-7914')).toBe(true);
    expect(isSearchIndexIncomplete('EON-108')).toBe(true);
    expect(isSearchIndexIncomplete('wel-78887152')).toBe(true);
    expect(isSearchIndexIncomplete('ot-4352')).toBe(true);
  });

  it('returns false for two or more tokens', () => {
    expect(isSearchIndexIncomplete('alexis adkins')).toBe(false);
    expect(isSearchIndexIncomplete('john doe')).toBe(false);
    expect(isSearchIndexIncomplete('alexis adkins alexisaadkins117@gmail.com 9417265935 eon-7914')).toBe(false);
    expect(isSearchIndexIncomplete('a b')).toBe(false);
  });

  it('trims before counting tokens', () => {
    expect(isSearchIndexIncomplete('  eon-7914  ')).toBe(true);
    expect(isSearchIndexIncomplete('  alexis adkins  ')).toBe(false);
  });
});

describe('buildPatientSearchIndex', () => {
  it('produces at least two tokens when name or email present', () => {
    const idx = buildPatientSearchIndex({
      firstName: 'Alexis',
      lastName: 'Adkins',
      email: 'a@b.com',
      phone: '9417265935',
      patientId: 'EON-7914',
    });
    expect(idx).toContain('alexis');
    expect(idx).toContain('adkins');
    expect(idx).toContain('eon-7914');
    expect(isSearchIndexIncomplete(idx)).toBe(false);
  });

  it('single patientId only yields one token', () => {
    const idx = buildPatientSearchIndex({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      patientId: 'EON-7914',
    });
    expect(idx).toBe('eon-7914');
    expect(isSearchIndexIncomplete(idx)).toBe(true);
  });
});
