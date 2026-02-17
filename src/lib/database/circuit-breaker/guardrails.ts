/**
 * QUERY GUARDRAILS
 * =================
 *
 * Static validation utilities that can be applied at the Prisma middleware
 * layer ($use) to detect dangerous query patterns BEFORE they hit the database.
 *
 * These guardrails LOG violations but do NOT block queries (fail-open).
 * Blocking can be enabled per guardrail via environment variables.
 *
 * Guardrails:
 *   1. MAX_INCLUDE_DEPTH — detect include nesting > N levels
 *   2. BLOB_SELECT_LIST  — detect `patientDocument.data` selected in list endpoints
 *   3. QUERY_WARN_THRESHOLD — lowered from 15 → 8
 *
 * Integration:
 *   Hooked into the existing Prisma `$use` middleware in `src/lib/db.ts`.
 *   Does NOT modify query arguments — only logs and emits metrics.
 *
 * @module database/circuit-breaker/guardrails
 */

import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum allowed include depth. Violations are logged. */
const MAX_INCLUDE_DEPTH = parseInt(process.env.MAX_INCLUDE_DEPTH ?? '3', 10);

/** Whether to hard-block queries that exceed MAX_INCLUDE_DEPTH */
const BLOCK_DEEP_INCLUDES = process.env.BLOCK_DEEP_INCLUDES === 'true';

/** Lowered query-per-request warn threshold */
export const GUARDRAIL_QUERY_WARN_THRESHOLD = parseInt(
  process.env.GUARDRAIL_QUERY_WARN_THRESHOLD ?? '8',
  10
);

/** Lowered query-per-request error threshold */
export const GUARDRAIL_QUERY_ERROR_THRESHOLD = parseInt(
  process.env.GUARDRAIL_QUERY_ERROR_THRESHOLD ?? '15',
  10
);

// =============================================================================
// INCLUDE DEPTH
// =============================================================================

/**
 * Calculate the maximum include/select nesting depth of a Prisma query args object.
 *
 * Example:
 *   { include: { patient: { include: { clinic: true } } } }
 *   → depth = 2
 */
export function measureIncludeDepth(args: unknown, currentDepth: number = 0): number {
  if (!args || typeof args !== 'object') return currentDepth;

  const obj = args as Record<string, unknown>;
  let max = currentDepth;

  if (obj.include && typeof obj.include === 'object') {
    for (const value of Object.values(obj.include as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        max = Math.max(max, measureIncludeDepth(value, currentDepth + 1));
      } else if (value === true) {
        max = Math.max(max, currentDepth + 1);
      }
    }
  }

  if (obj.select && typeof obj.select === 'object') {
    for (const value of Object.values(obj.select as Record<string, unknown>)) {
      if (value && typeof value === 'object') {
        max = Math.max(max, measureIncludeDepth(value, currentDepth + 1));
      }
    }
  }

  return max;
}

/**
 * Check include depth and log a violation if it exceeds the threshold.
 *
 * @returns `true` if the query is SAFE, `false` if it violates the guardrail
 *          (only blocks when BLOCK_DEEP_INCLUDES is enabled).
 */
export function checkIncludeDepth(
  model: string | undefined,
  action: string | undefined,
  args: unknown
): boolean {
  const depth = measureIncludeDepth(args);

  if (depth > MAX_INCLUDE_DEPTH) {
    logger.warn('[Guardrail] Include depth violation', {
      model: model ?? 'unknown',
      action: action ?? 'unknown',
      depth,
      maxAllowed: MAX_INCLUDE_DEPTH,
    });

    if (BLOCK_DEEP_INCLUDES) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// BLOB PREVENTION
// =============================================================================

/**
 * Detect if a list query (findMany) on `PatientDocument` selects the `data` field.
 * This prevents loading binary blobs in list contexts.
 *
 * Returns `true` if the query is SAFE.
 */
export function checkBlobSelection(
  model: string | undefined,
  action: string | undefined,
  args: unknown
): boolean {
  if (!model || !action) return true;

  const normalModel = model.toLowerCase();
  const normalAction = action.toLowerCase();

  // Only flag list queries on patientDocument that include the data field
  if (normalModel !== 'patientdocument') return true;
  if (normalAction !== 'findmany') return true;

  const obj = args as Record<string, unknown> | undefined;
  if (!obj) return true;

  // If there's an explicit select that includes data, flag it
  if (obj.select && typeof obj.select === 'object') {
    const select = obj.select as Record<string, unknown>;
    if (select.data === true) {
      logger.warn('[Guardrail] Blob field selected in list endpoint', {
        model,
        action,
        field: 'data',
        suggestion: 'Use a separate endpoint to load patientDocument.data on demand',
      });
      return false;
    }
  }

  // If there's no select (loading all fields), the data blob is included implicitly
  if (!obj.select) {
    logger.warn('[Guardrail] PatientDocument.findMany without select — blob data implicitly loaded', {
      model,
      action,
      suggestion: 'Add explicit select to exclude patientDocument.data in list queries',
    });
    return false;
  }

  return true;
}

// =============================================================================
// UNBOUNDED QUERY DETECTION
// =============================================================================

/**
 * Detect findMany queries without a `take` limit.
 * Logs a warning but does not block.
 */
export function checkUnboundedQuery(
  model: string | undefined,
  action: string | undefined,
  args: unknown
): boolean {
  if (!action || action.toLowerCase() !== 'findmany') return true;

  const obj = args as Record<string, unknown> | undefined;
  if (!obj) return true;

  if (obj.take === undefined && obj.cursor === undefined) {
    logger.warn('[Guardrail] Unbounded findMany detected', {
      model: model ?? 'unknown',
      suggestion: 'Add take/limit to prevent full table scans',
    });
    return false;
  }

  return true;
}

// =============================================================================
// COMBINED GUARDRAIL CHECK
// =============================================================================

export interface GuardrailResult {
  passed: boolean;
  violations: string[];
}

/**
 * Run all guardrails against a Prisma query.
 * Called from the Prisma $use middleware.
 *
 * Returns a result object; never throws.
 */
export function runGuardrails(
  model: string | undefined,
  action: string | undefined,
  args: unknown
): GuardrailResult {
  const violations: string[] = [];

  if (!checkIncludeDepth(model, action, args)) {
    violations.push(`include_depth>${MAX_INCLUDE_DEPTH}`);
  }

  if (!checkBlobSelection(model, action, args)) {
    violations.push('blob_in_list');
  }

  if (!checkUnboundedQuery(model, action, args)) {
    violations.push('unbounded_findmany');
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
