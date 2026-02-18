/**
 * Search Query Normalization, Fuzzy Matching & Index Utilities
 *
 * Ensures all search bars behave intuitively:
 * - Leading/trailing whitespace is stripped
 * - Multiple internal spaces are collapsed to a single space
 * - Queries are lowercased for case-insensitive matching
 * - Fuzzy matching catches typos and close matches
 * - Multi-term queries match in any order (first + last name)
 *
 * Also provides `buildPatientSearchIndex()` to generate a DB-level search
 * index column that enables SQL LIKE queries via pg_trgm GIN index.
 * This replaces in-memory decryption-based search, scaling to 10M+ records.
 *
 * These utilities should be used at EVERY layer:
 * - API routes: normalize before passing to repositories/in-memory filters
 * - Frontend: trim before sending search queries to the API
 * - Client-side filters: normalize before comparing
 * - Patient create/update: build searchIndex from plain-text PHI BEFORE encryption
 */

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a raw search query for consistent matching.
 * - Trims leading/trailing whitespace
 * - Collapses multiple internal spaces to one
 * - Lowercases
 *
 * @example
 * normalizeSearch('  John   Smith  ') // 'john smith'
 * normalizeSearch(' john') // 'john'
 */
export function normalizeSearch(query: string): string {
  return query.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Split a search query into individual search terms.
 * Handles any whitespace pattern gracefully.
 *
 * @example
 * splitSearchTerms('  John   Smith  ') // ['john', 'smith']
 * splitSearchTerms('   ')              // []
 */
export function splitSearchTerms(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean);
}

/**
 * Drop-in replacement for `.toLowerCase().includes(searchTerm.toLowerCase())`.
 * Normalizes BOTH sides (trim, collapse whitespace, lowercase) before comparing.
 *
 * Use this in every client-side filter to make search whitespace-proof.
 *
 * @example
 * normalizedIncludes('Becky Heinrich', '  becky   heinrich  ') // true
 * normalizedIncludes('Becky Heinrich', 'becky heinrich ')       // true
 * normalizedIncludes('Becky Heinrich', 'heinrich')              // true
 */
export function normalizedIncludes(text: string, search: string): boolean {
  if (!search || !search.trim()) return true;
  return normalizeSearch(text || '').includes(normalizeSearch(search));
}

// ============================================================================
// Fuzzy Matching
// ============================================================================

/**
 * Calculate Levenshtein edit distance between two strings.
 * Lower = more similar. 0 = identical.
 */
export function levenshteinDistance(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  const m = s1.length;
  const n = s2.length;

  if (m === 0) return n;
  if (n === 0) return m;

  // Use single-row optimization for memory efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

/**
 * Calculate similarity score (0–1) between two strings.
 * 1 = identical, 0 = completely different.
 */
export function similarityScore(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Check if a search term fuzzy-matches a target string.
 * Returns true for:
 *  - Exact substring match
 *  - "Starts with" match on any word in the target
 *  - Fuzzy match within the edit distance threshold
 *
 * The threshold is adaptive: shorter terms require closer matches.
 */
export function fuzzyTermMatch(term: string, target: string): boolean {
  if (!term || !target) return false;

  const t = term.toLowerCase();
  const tgt = target.toLowerCase();

  // Exact substring — always wins
  if (tgt.includes(t)) return true;

  // "Starts with" on individual words in target
  const words = tgt.split(/\s+/);
  if (words.some((w) => w.startsWith(t) || t.startsWith(w))) return true;

  // Fuzzy: compare against each word in target
  // Adaptive threshold: allow 1 error per 4 chars, minimum 1
  const maxDistance = Math.max(1, Math.floor(t.length / 4));

  for (const word of words) {
    if (levenshteinDistance(t, word) <= maxDistance) return true;
    // Also check if term is a fuzzy prefix of a longer word
    if (word.length > t.length) {
      const prefix = word.slice(0, t.length);
      if (levenshteinDistance(t, prefix) <= maxDistance) return true;
    }
  }

  return false;
}

// ============================================================================
// Smart Search Scoring
// ============================================================================

/**
 * Score how well a search query matches a set of searchable fields.
 *
 * Returns a number from 0 (no match) to 100 (perfect exact match).
 * Score breakdown:
 *  - 100: all terms match exactly (substring)
 *  -  80: all terms match via starts-with
 *  -  60: all terms match fuzzily
 *  -  40: partial term matches (some but not all)
 *  -   0: no meaningful match
 *
 * Multi-term queries check all terms against all fields (any order).
 */
export function scoreMatch(query: string, fields: string[]): number {
  const terms = splitSearchTerms(query);
  if (terms.length === 0) return 100; // empty search matches everything

  const combined = fields.map((f) => (f || '').toLowerCase()).join(' ');
  if (!combined) return 0;

  let exactCount = 0;
  let startsWithCount = 0;
  let fuzzyCount = 0;

  const words = combined.split(/\s+/);

  for (const term of terms) {
    // Exact substring in combined text
    if (combined.includes(term)) {
      exactCount++;
      continue;
    }

    // Starts-with on any word
    if (words.some((w) => w.startsWith(term) || term.startsWith(w))) {
      startsWithCount++;
      continue;
    }

    // Fuzzy match on any word
    const maxDist = Math.max(1, Math.floor(term.length / 4));
    const hasFuzzy = words.some((w) => {
      if (levenshteinDistance(term, w) <= maxDist) return true;
      if (w.length > term.length) {
        return levenshteinDistance(term, w.slice(0, term.length)) <= maxDist;
      }
      return false;
    });

    if (hasFuzzy) {
      fuzzyCount++;
      continue;
    }
  }

  const matched = exactCount + startsWithCount + fuzzyCount;
  if (matched === 0) return 0;

  // All terms matched
  if (matched === terms.length) {
    if (exactCount === terms.length) return 100;
    if (exactCount + startsWithCount === terms.length) return 80;
    return 60;
  }

  // Partial match — scale by proportion matched
  const proportion = matched / terms.length;
  return Math.round(40 * proportion);
}

// ============================================================================
// Smart Filter for Queue / List Items
// ============================================================================

export interface SmartSearchResult<T> {
  /** Items with strong matches (score >= 60), sorted best first */
  matches: T[];
  /** Items with partial/close matches (score 20–59) when no strong matches found */
  closeMatches: T[];
  /** Whether the results include fuzzy/close matches rather than exact */
  isFuzzy: boolean;
}

/**
 * Smart filter for arrays of items. Given a search query and an array of items,
 * returns matches sorted by relevance. If no strong matches exist, returns close
 * matches so the user isn't left with an empty screen.
 *
 * @param items - The array to filter
 * @param query - Raw search input (whitespace, casing handled automatically)
 * @param getFields - Function returning searchable string fields for an item
 *
 * @example
 * const result = smartSearch(queueItems, searchTerm, (item) => [
 *   item.patientName,
 *   item.patientEmail,
 *   item.treatment,
 *   item.invoiceNumber,
 * ]);
 * // result.matches = strong matches
 * // result.closeMatches = shown only when matches is empty
 */
export function smartSearch<T>(
  items: T[],
  query: string,
  getFields: (item: T) => string[],
): SmartSearchResult<T> {
  const normalized = normalizeSearch(query);
  if (!normalized) {
    return { matches: items, closeMatches: [], isFuzzy: false };
  }

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const fields = getFields(item);
    const score = scoreMatch(normalized, fields);
    if (score > 0) {
      scored.push({ item, score });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  const strong = scored.filter((s) => s.score >= 60).map((s) => s.item);
  const close = scored.filter((s) => s.score >= 20 && s.score < 60).map((s) => s.item);

  if (strong.length > 0) {
    return { matches: strong, closeMatches: [], isFuzzy: false };
  }

  // No strong matches — surface close matches so the user isn't stuck
  return { matches: [], closeMatches: close, isFuzzy: true };
}

// ============================================================================
// Name-Aware Matching (for server-side patient search in API routes)
// ============================================================================

/**
 * Check if a patient name matches a search query with full intelligence:
 * normalization, multi-term, starts-with, and fuzzy matching.
 *
 * Use this in API routes where you iterate over decrypted records.
 */
export function nameMatchesSearch(patientName: string, search: string): boolean {
  const score = scoreMatch(search, [patientName]);
  return score >= 40; // Allow partial fuzzy matches for server-side filtering
}

// ============================================================================
// Patient Search Index
// ============================================================================

/**
 * Build a searchable index string from patient fields.
 *
 * This produces a lowercased, space-separated string containing:
 *   "firstname lastname email phone_digits patientid"
 *
 * Stored in `Patient.searchIndex` for DB-level ILIKE queries with a
 * pg_trgm GIN index, enabling O(1) substring search at any scale.
 *
 * IMPORTANT: Call this with PLAIN-TEXT (unencrypted) patient data,
 * BEFORE encrypting PHI fields. The original PHI fields remain encrypted.
 *
 * @example
 * buildPatientSearchIndex({
 *   firstName: 'Italo',
 *   lastName: 'Pignano',
 *   email: 'italo@eonmeds.com',
 *   phone: '(813) 263-7844',
 *   patientId: 'EON-19',
 * })
 * // Returns: "italo pignano italo@eonmeds.com 8132637844 eon-19"
 */
export function buildPatientSearchIndex(patient: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  patientId?: string | null;
}): string {
  const parts: string[] = [];

  if (patient.firstName?.trim()) {
    parts.push(patient.firstName.toLowerCase().trim());
  }
  if (patient.lastName?.trim()) {
    parts.push(patient.lastName.toLowerCase().trim());
  }
  if (patient.email?.trim()) {
    parts.push(patient.email.toLowerCase().trim());
  }
  if (patient.phone?.trim()) {
    // Store digits only for phone — enables searching "8132637844" or "263"
    const digits = patient.phone.replace(/\D/g, '');
    if (digits.length > 0) {
      parts.push(digits);
    }
  }
  if (patient.patientId?.trim()) {
    parts.push(patient.patientId.toLowerCase().trim());
  }

  return parts.join(' ');
}

// ============================================================================
// Unified Patient Search WHERE Clause Builder
// ============================================================================

/**
 * Prisma-compatible filter shape returned by buildPatientSearchWhere.
 * Using a generic record type so callers don't need to import Prisma types.
 */
export interface PatientSearchFilter {
  AND?: Array<Record<string, unknown>>;
  searchIndex?: Record<string, unknown>;
}

/**
 * Build a Prisma WHERE fragment for patient search that works consistently
 * across ALL endpoints. This is the single source of truth for patient search.
 *
 * Handles:
 * - Multi-term queries: "chad lee" → each term must appear in searchIndex (any order)
 * - Single-term queries: also checks patientId for wider coverage
 * - Phone search: digit-only queries match phone digits in searchIndex
 * - Empty/blank queries: returns empty object (no filter)
 *
 * @example
 * // Single term
 * buildPatientSearchWhere('chad')
 * // → { AND: [{ OR: [{ searchIndex: { contains: 'chad', mode: 'insensitive' } }, { patientId: { contains: 'chad', mode: 'insensitive' } }] }] }
 *
 * // Multi-term — name in any order
 * buildPatientSearchWhere('lee chad')
 * // → { AND: [{ OR: [{ searchIndex: ... 'lee' }, { patientId: ... 'lee' }] }, { OR: [{ searchIndex: ... 'chad' }, { patientId: ... 'chad' }] }] }
 *
 * // Phone
 * buildPatientSearchWhere('8132637844')
 * // → { searchIndex: { contains: '8132637844', mode: 'insensitive' } }
 */
export function buildPatientSearchWhere(rawSearch: string): PatientSearchFilter {
  const search = rawSearch.trim();
  if (!search) return {};

  const searchDigitsOnly = search.replace(/\D/g, '');
  const isPhoneSearch = searchDigitsOnly.length >= 3 && searchDigitsOnly === search.trim();

  if (isPhoneSearch) {
    return {
      searchIndex: { contains: searchDigitsOnly, mode: 'insensitive' },
    };
  }

  const terms = splitSearchTerms(search);
  if (terms.length === 0) return {};

  return {
    AND: terms.map((term) => ({
      OR: [
        { searchIndex: { contains: term, mode: 'insensitive' } },
        { patientId: { contains: term, mode: 'insensitive' } },
      ],
    })),
  };
}
