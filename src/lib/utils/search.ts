/**
 * Search Query Normalization Utilities
 *
 * Ensures all search bars behave intuitively:
 * - Leading/trailing whitespace is stripped
 * - Multiple internal spaces are collapsed to a single space
 * - Queries are lowercased for case-insensitive matching
 *
 * These utilities should be used at EVERY layer:
 * - API routes: normalize before passing to repositories/in-memory filters
 * - Frontend: trim before sending search queries to the API
 * - Client-side filters: normalize before comparing
 */

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
