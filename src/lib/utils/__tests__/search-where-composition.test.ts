/**
 * Targeted test for search WHERE clause composition in admin patient routes.
 * Validates that the AND-based composition preserves the base OR constraint
 * (invoice/order requirement) when combined with search filters.
 *
 * Also tests fuzzy search variant generation and the buildFuzzySearchOr utility.
 */
import { describe, it, expect } from 'vitest';
import {
  buildPatientSearchWhere,
  splitSearchTerms,
  isSearchIndexIncomplete,
  buildPatientSearchIndex,
  generateSearchVariants,
  fuzzyTermMatch,
  scoreMatch,
  buildFuzzySearchOr,
  sortBySearchRelevance,
} from '../search';

describe('generateSearchVariants', () => {
  it('returns empty for very short terms', () => {
    expect(generateSearchVariants('ab')).toEqual([]);
    expect(generateSearchVariants('a')).toEqual([]);
  });

  it('returns empty for very long terms', () => {
    expect(generateSearchVariants('abcdefghijklmnop')).toEqual([]);
  });

  it('generates transpositions for "jhon"', () => {
    const variants = generateSearchVariants('jhon');
    expect(variants).toContain('john');
  });

  it('generates deletions', () => {
    const variants = generateSearchVariants('joohn');
    expect(variants).toContain('john');
  });

  it('generates double-letter reduction', () => {
    const variants = generateSearchVariants('johnn');
    expect(variants).toContain('john');
  });

  it('generates phonetic substitution ph→f', () => {
    const variants = generateSearchVariants('phred');
    expect(variants).toContain('fred');
  });

  it('does not include the original term', () => {
    const variants = generateSearchVariants('john');
    expect(variants).not.toContain('john');
  });

  it('generates reasonable number of variants', () => {
    const variants = generateSearchVariants('smith');
    expect(variants.length).toBeGreaterThan(3);
    expect(variants.length).toBeLessThan(50);
  });
});

describe('fuzzyTermMatch (increased threshold)', () => {
  it('matches exact substring', () => {
    expect(fuzzyTermMatch('john', 'john smith')).toBe(true);
  });

  it('matches with 1 edit on short terms', () => {
    expect(fuzzyTermMatch('jhon', 'john smith')).toBe(true);
  });

  it('matches with 2 edits on 6+ char terms', () => {
    expect(fuzzyTermMatch('jontan', 'jonathan smith')).toBe(true);
  });

  it('rejects distant mismatches', () => {
    expect(fuzzyTermMatch('xyz', 'john smith')).toBe(false);
  });
});

describe('scoreMatch (increased threshold)', () => {
  it('scores 100 for exact match', () => {
    expect(scoreMatch('john', ['john smith'])).toBe(100);
  });

  it('scores >= 60 for fuzzy match on all terms', () => {
    expect(scoreMatch('jhon', ['john smith'])).toBeGreaterThanOrEqual(60);
  });

  it('scores 0 for completely unrelated', () => {
    expect(scoreMatch('xyz123', ['john smith'])).toBe(0);
  });
});

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

  it('returns AND with nested OR for single term (includes variants)', () => {
    const result = buildPatientSearchWhere('john');
    expect(result).toHaveProperty('AND');
    expect(Array.isArray(result.AND)).toBe(true);
    const andArray = result.AND as any[];
    expect(andArray).toHaveLength(1);
    expect(andArray[0]).toHaveProperty('OR');
    // Should have more than 2 OR conditions (exact + patientId + variants)
    expect(andArray[0].OR.length).toBeGreaterThan(2);
  });

  it('includes exact searchIndex and patientId in OR conditions', () => {
    const result = buildPatientSearchWhere('chad');
    const orConditions = (result.AND as any[])[0].OR;
    const searchIndexContains = orConditions.filter(
      (c: any) => c.searchIndex?.contains === 'chad'
    );
    const patientIdContains = orConditions.filter(
      (c: any) => c.patientId?.contains === 'chad'
    );
    expect(searchIndexContains.length).toBe(1);
    expect(patientIdContains.length).toBe(1);
  });

  it('includes transposition variants in OR conditions', () => {
    const result = buildPatientSearchWhere('jhon');
    const orConditions = (result.AND as any[])[0].OR;
    const hasJohnVariant = orConditions.some(
      (c: any) => c.searchIndex?.contains === 'john'
    );
    expect(hasJohnVariant).toBe(true);
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

describe('buildFuzzySearchOr', () => {
  it('returns empty array for blank search', () => {
    expect(buildFuzzySearchOr('', ['email'], ['firstName'])).toEqual([]);
    expect(buildFuzzySearchOr('   ', ['email'], ['firstName'])).toEqual([]);
  });

  it('includes exact contains for both exact and fuzzy fields', () => {
    const result = buildFuzzySearchOr('john', ['email'], ['firstName']);
    const emailExact = result.filter((c: any) => c.email?.contains === 'john');
    const nameExact = result.filter((c: any) => c.firstName?.contains === 'john');
    expect(emailExact.length).toBe(1);
    expect(nameExact.length).toBe(1);
  });

  it('includes variants only for fuzzy fields', () => {
    const result = buildFuzzySearchOr('jhon', ['email'], ['firstName']);
    // Email should NOT have "john" variant (it's an exact field)
    const emailJohn = result.filter((c: any) => c.email?.contains === 'john');
    expect(emailJohn.length).toBe(0);
    // firstName SHOULD have "john" variant (it's a fuzzy field)
    const nameJohn = result.filter((c: any) => c.firstName?.contains === 'john');
    expect(nameJohn.length).toBe(1);
  });

  it('handles multi-term search', () => {
    const result = buildFuzzySearchOr('john doe', ['email'], ['firstName', 'lastName']);
    // Should have conditions for both terms
    const johnConditions = result.filter((c: any) =>
      Object.values(c).some((v: any) => v?.contains === 'john')
    );
    const doeConditions = result.filter((c: any) =>
      Object.values(c).some((v: any) => v?.contains === 'doe')
    );
    expect(johnConditions.length).toBeGreaterThan(0);
    expect(doeConditions.length).toBeGreaterThan(0);
  });

  it('generates reasonable condition count', () => {
    const result = buildFuzzySearchOr('john', ['email'], ['firstName', 'lastName']);
    // Should have: 3 exact (email, firstName, lastName) + variants for each fuzzy field
    expect(result.length).toBeGreaterThan(3);
    expect(result.length).toBeLessThan(100);
  });
});

describe('sortBySearchRelevance', () => {
  const items = [
    { name: 'Alice Johnson', email: 'alice@test.com' },
    { name: 'John Smith', email: 'john@test.com' },
    { name: 'Bob Johnston', email: 'bob@test.com' },
    { name: 'Jonathan Lee', email: 'jonathan@test.com' },
  ];
  const getFields = (item: typeof items[number]) => [item.name, item.email];

  it('returns items unchanged when no search', () => {
    expect(sortBySearchRelevance(items, '', getFields)).toBe(items);
    expect(sortBySearchRelevance(items, '   ', getFields)).toBe(items);
  });

  it('puts exact match first', () => {
    const sorted = sortBySearchRelevance(items, 'john smith', getFields);
    expect(sorted[0].name).toBe('John Smith');
  });

  it('ranks exact substring higher than fuzzy match', () => {
    const sorted = sortBySearchRelevance(items, 'smith', getFields);
    // "John Smith" has exact "smith" → should rank above others
    expect(sorted[0].name).toBe('John Smith');
  });

  it('preserves original order for equal relevance', () => {
    const sorted = sortBySearchRelevance(items, 'test.com', getFields);
    // All items have "test.com" in email — same score, preserve original order
    expect(sorted[0].name).toBe('Alice Johnson');
    expect(sorted[1].name).toBe('John Smith');
    expect(sorted[2].name).toBe('Bob Johnston');
    expect(sorted[3].name).toBe('Jonathan Lee');
  });

  it('handles single item array', () => {
    const single = [items[0]];
    expect(sortBySearchRelevance(single, 'alice', getFields)).toBe(single);
  });
});
