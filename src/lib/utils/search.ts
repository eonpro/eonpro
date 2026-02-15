/**
 * Search Query Normalization & Index Utilities
 *
 * Ensures all search bars behave intuitively:
 * - Leading/trailing whitespace is stripped
 * - Multiple internal spaces are collapsed to a single space
 * - Queries are lowercased for case-insensitive matching
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
