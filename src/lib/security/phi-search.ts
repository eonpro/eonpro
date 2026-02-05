/**
 * PHI-Aware Search Service
 * ========================
 *
 * ENTERPRISE SOLUTION for searching encrypted PHI (Protected Health Information)
 *
 * PROBLEM:
 * Patient PHI fields (firstName, lastName, email, phone, dob) are encrypted at rest
 * using AES-256-GCM with random IVs. This means:
 * - SQL LIKE/contains queries CANNOT match plaintext search terms
 * - Each encryption of the same value produces different ciphertext
 * - Direct database queries on encrypted fields will ALWAYS fail to find matches
 *
 * SOLUTION:
 * This service provides a centralized, type-safe way to search encrypted data:
 * 1. Fetch records from database (with non-PHI filters applied)
 * 2. Decrypt PHI fields in application memory
 * 3. Filter by search term on decrypted values
 * 4. Apply pagination to filtered results
 *
 * USAGE:
 * ```typescript
 * import { PHISearchService, PATIENT_PHI_FIELDS } from '@/lib/security/phi-search';
 *
 * const result = await PHISearchService.searchPatients({
 *   baseQuery: { clinicId: 7, profileStatus: 'ACTIVE' },
 *   search: 'john smith',
 *   searchFields: ['firstName', 'lastName', 'email'],
 *   pagination: { limit: 20, offset: 0 },
 * });
 * ```
 *
 * @module lib/security/phi-search
 * @since 2026-02-05
 */

import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { decryptPHI } from '@/lib/security/phi-encryption';
import { logger } from '@/lib/logger';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Fields that are encrypted in the Patient table
 * NEVER use these in SQL WHERE clauses with contains/like/equals
 */
export const PATIENT_PHI_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dob',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
] as const;

export type PatientPHIField = (typeof PATIENT_PHI_FIELDS)[number];

/**
 * Fields that are safe to query directly in SQL
 */
export const PATIENT_SAFE_FIELDS = [
  'id',
  'patientId',
  'clinicId',
  'profileStatus',
  'source',
  'createdAt',
  'updatedAt',
  'stripeCustomerId',
] as const;

export type PatientSafeField = (typeof PATIENT_SAFE_FIELDS)[number];

/**
 * Search configuration options
 */
export interface PHISearchOptions<T> {
  /** Base Prisma where clause (should ONLY contain safe fields) */
  baseQuery: Prisma.PatientWhereInput;
  /** Search term to match against decrypted PHI */
  search: string;
  /** Which PHI fields to search (defaults to firstName, lastName) */
  searchFields?: PatientPHIField[];
  /** Pagination options */
  pagination?: {
    limit?: number;
    offset?: number;
  };
  /** Fields to select from the database */
  select?: Prisma.PatientSelect;
  /** Include relations */
  include?: Prisma.PatientInclude;
  /** Order by (should be safe fields only) */
  orderBy?: Prisma.PatientOrderByWithRelationInput;
  /** Maximum records to fetch for in-memory filtering (default: 2000) */
  maxFetchSize?: number;
  /** Custom transform function after decryption */
  transform?: (record: T) => T;
}

export interface PHISearchResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  /** Performance metrics */
  metrics: {
    fetchedCount: number;
    filteredCount: number;
    processingTimeMs: number;
  };
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validates that a where clause doesn't contain searches on encrypted fields
 * This is a RUNTIME CHECK to catch developer mistakes
 *
 * @throws Error if encrypted fields are found in search conditions
 */
export function validateWhereClause(
  where: Prisma.PatientWhereInput,
  context?: string
): void {
  const violations: string[] = [];

  function checkObject(obj: Record<string, unknown>, path: string = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      // Check if this is a PHI field being searched
      if (PATIENT_PHI_FIELDS.includes(key as PatientPHIField)) {
        if (
          value &&
          typeof value === 'object' &&
          ('contains' in value ||
            'startsWith' in value ||
            'endsWith' in value ||
            'equals' in value ||
            'in' in value)
        ) {
          violations.push(
            `Attempted to search encrypted field '${key}' at '${currentPath}'`
          );
        }
      }

      // Recursively check nested objects (OR, AND, NOT conditions)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        checkObject(value as Record<string, unknown>, currentPath);
      }

      // Check arrays (OR conditions)
      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (item && typeof item === 'object') {
            checkObject(item as Record<string, unknown>, `${currentPath}[${index}]`);
          }
        });
      }
    }
  }

  checkObject(where as Record<string, unknown>);

  if (violations.length > 0) {
    const errorMessage = [
      '🚨 PHI SEARCH VIOLATION DETECTED 🚨',
      '',
      'You are attempting to search encrypted PHI fields directly in SQL.',
      'This will NEVER find matches because the data is encrypted with random IVs.',
      '',
      'Violations found:',
      ...violations.map((v) => `  - ${v}`),
      '',
      'SOLUTION: Use PHISearchService.searchPatients() instead:',
      '',
      '  import { PHISearchService } from "@/lib/security/phi-search";',
      '',
      '  const results = await PHISearchService.searchPatients({',
      '    baseQuery: { clinicId: 7 }, // Safe fields only',
      '    search: "john smith",',
      '    searchFields: ["firstName", "lastName"],',
      '  });',
      '',
      context ? `Context: ${context}` : '',
    ].join('\n');

    logger.error('[PHI-SEARCH] Validation failed', {
      violations,
      context,
    });

    throw new Error(errorMessage);
  }
}

// ============================================================================
// DECRYPTION UTILITIES
// ============================================================================

/**
 * Safely decrypt a PHI field value
 * Returns original value if decryption fails (might already be plaintext)
 */
function safeDecrypt(value: string | null | undefined): string {
  if (!value) return '';

  try {
    // Check if value looks encrypted (IV:tag:ciphertext format)
    const parts = value.split(':');
    if (parts.length === 3) {
      // Validate base64 format
      const isBase64 = parts.every(
        (p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2
      );
      if (isBase64) {
        return decryptPHI(value) || value;
      }
    }
    return value;
  } catch {
    // Return original value if decryption fails
    return value;
  }
}

/**
 * Decrypt all PHI fields in a patient record
 */
export function decryptPatientRecord<T extends Record<string, unknown>>(
  record: T,
  fields: readonly PatientPHIField[] = PATIENT_PHI_FIELDS
): T {
  const decrypted = { ...record };

  for (const field of fields) {
    if (field in record && typeof record[field] === 'string') {
      (decrypted as Record<string, unknown>)[field] = safeDecrypt(
        record[field] as string
      );
    }
  }

  return decrypted;
}

// ============================================================================
// SEARCH MATCHING
// ============================================================================

/**
 * Check if a record matches the search term
 * Supports single terms and multi-word searches (name matching)
 */
export function matchesSearch(
  record: Record<string, unknown>,
  search: string,
  fields: PatientPHIField[]
): boolean {
  const searchLower = search.toLowerCase().trim();
  if (!searchLower) return true;

  const searchTerms = searchLower.split(/\s+/).filter(Boolean);

  // Get field values
  const fieldValues: Record<string, string> = {};
  for (const field of fields) {
    fieldValues[field] = ((record[field] as string) || '').toLowerCase();
  }

  // Single term: match any field
  if (searchTerms.length === 1) {
    const term = searchTerms[0];
    return fields.some((field) => fieldValues[field].includes(term));
  }

  // Multi-term: smart name matching
  const firstName = fieldValues.firstName || '';
  const lastName = fieldValues.lastName || '';
  const fullName = `${firstName} ${lastName}`;
  const reverseName = `${lastName} ${firstName}`;

  // Check full search against full name
  if (fullName.includes(searchLower) || reverseName.includes(searchLower)) {
    return true;
  }

  // Check if all terms appear somewhere in searchable fields
  return searchTerms.every((term) =>
    fields.some((field) => fieldValues[field].includes(term))
  );
}

// ============================================================================
// MAIN SEARCH SERVICE
// ============================================================================

export const PHISearchService = {
  /**
   * Search patients with encrypted PHI fields
   *
   * This is the CORRECT way to search patient data in this application.
   * It handles encryption transparently and efficiently.
   */
  async searchPatients<T extends Record<string, unknown>>(
    options: PHISearchOptions<T>
  ): Promise<PHISearchResult<T>> {
    const startTime = Date.now();

    const {
      baseQuery,
      search,
      searchFields = ['firstName', 'lastName'],
      pagination = {},
      select,
      include,
      orderBy = { createdAt: 'desc' },
      maxFetchSize = 2000,
      transform,
    } = options;

    const limit = pagination.limit || 20;
    const offset = pagination.offset || 0;

    // Validate the base query doesn't search encrypted fields
    validateWhereClause(baseQuery, 'PHISearchService.searchPatients');

    // Fetch records from database
    const queryOptions: Prisma.PatientFindManyArgs = {
      where: baseQuery,
      orderBy,
      take: maxFetchSize,
    };

    if (select) queryOptions.select = select;
    if (include) queryOptions.include = include;

    const records = (await db.patient.findMany(queryOptions)) as T[];
    const fetchedCount = records.length;

    // Decrypt and filter
    const decryptedRecords = records.map((r) =>
      decryptPatientRecord(r, searchFields)
    );

    const filteredRecords = search
      ? decryptedRecords.filter((r) =>
          matchesSearch(r as Record<string, unknown>, search, searchFields)
        )
      : decryptedRecords;

    const filteredCount = filteredRecords.length;

    // Apply pagination
    const paginatedRecords = filteredRecords.slice(offset, offset + limit);

    // Apply transform if provided
    const finalRecords = transform
      ? paginatedRecords.map(transform)
      : paginatedRecords;

    const processingTimeMs = Date.now() - startTime;

    // Log performance metrics for monitoring
    if (processingTimeMs > 1000) {
      logger.warn('[PHI-SEARCH] Slow search detected', {
        processingTimeMs,
        fetchedCount,
        filteredCount,
        search: search ? `${search.substring(0, 20)}...` : null,
      });
    }

    return {
      data: finalRecords,
      total: filteredCount,
      limit,
      offset,
      hasMore: offset + paginatedRecords.length < filteredCount,
      metrics: {
        fetchedCount,
        filteredCount,
        processingTimeMs,
      },
    };
  },

  /**
   * Count patients matching search criteria
   * Useful for pagination without fetching all data
   */
  async countPatients(options: {
    baseQuery: Prisma.PatientWhereInput;
    search?: string;
    searchFields?: PatientPHIField[];
    maxFetchSize?: number;
  }): Promise<number> {
    const {
      baseQuery,
      search,
      searchFields = ['firstName', 'lastName'],
      maxFetchSize = 2000,
    } = options;

    // Validate the base query
    validateWhereClause(baseQuery, 'PHISearchService.countPatients');

    if (!search) {
      // No search term - use direct count
      return db.patient.count({ where: baseQuery });
    }

    // With search term - need to fetch and filter
    const records = await db.patient.findMany({
      where: baseQuery,
      select: searchFields.reduce(
        (acc, field) => ({ ...acc, [field]: true }),
        {} as Record<string, boolean>
      ),
      take: maxFetchSize,
    });

    const decrypted = records.map((r) =>
      decryptPatientRecord(r as Record<string, unknown>, searchFields)
    );

    return decrypted.filter((r) =>
      matchesSearch(r, search, searchFields)
    ).length;
  },

  /**
   * Find a single patient by PHI field value
   * Use this instead of findFirst with PHI conditions
   */
  async findPatientByPHI(options: {
    baseQuery: Prisma.PatientWhereInput;
    field: PatientPHIField;
    value: string;
    select?: Prisma.PatientSelect;
    include?: Prisma.PatientInclude;
  }): Promise<Record<string, unknown> | null> {
    const { baseQuery, field, value, select, include } = options;

    // Validate the base query
    validateWhereClause(baseQuery, 'PHISearchService.findPatientByPHI');

    const valueLower = value.toLowerCase().trim();

    const queryOptions: Prisma.PatientFindManyArgs = {
      where: baseQuery,
      take: 1000, // Reasonable limit for single-value lookup
    };

    if (select) queryOptions.select = { ...select, [field]: true };
    if (include) queryOptions.include = include;

    const records = await db.patient.findMany(queryOptions);

    for (const record of records) {
      const decrypted = decryptPatientRecord(
        record as Record<string, unknown>,
        [field]
      );
      const fieldValue = ((decrypted[field] as string) || '').toLowerCase().trim();

      if (fieldValue === valueLower) {
        return decryptPatientRecord(
          record as Record<string, unknown>,
          PATIENT_PHI_FIELDS
        );
      }
    }

    return null;
  },

  /**
   * Check if a patient exists by PHI field value
   */
  async patientExistsByPHI(options: {
    baseQuery: Prisma.PatientWhereInput;
    field: PatientPHIField;
    value: string;
  }): Promise<boolean> {
    const patient = await this.findPatientByPHI({
      ...options,
      select: { id: true, [options.field]: true },
    });
    return patient !== null;
  },
};

// ============================================================================
// PRISMA MIDDLEWARE (Optional - for catching violations at runtime)
// ============================================================================

/**
 * Prisma middleware to warn about potential PHI search violations
 * Add this to your Prisma client initialization for extra safety
 *
 * Usage:
 * ```typescript
 * import { createPHISearchMiddleware } from '@/lib/security/phi-search';
 * prisma.$use(createPHISearchMiddleware());
 * ```
 */
export function createPHISearchMiddleware() {
  return async (
    params: { model?: string; action: string; args?: { where?: unknown } },
    next: (params: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    // Only check Patient queries
    if (params.model === 'Patient' && params.args?.where) {
      try {
        validateWhereClause(
          params.args.where as Prisma.PatientWhereInput,
          `Prisma ${params.action} on Patient`
        );
      } catch (error) {
        // In development, throw the error
        // In production, log and continue (to avoid breaking existing code)
        if (process.env.NODE_ENV === 'development') {
          throw error;
        }
        logger.error('[PHI-SEARCH-MIDDLEWARE] Violation detected', {
          action: params.action,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return next(params);
  };
}

export default PHISearchService;
