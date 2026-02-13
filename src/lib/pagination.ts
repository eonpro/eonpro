/**
 * Pagination enforcement for list APIs – enterprise scale (500k+ records).
 * Ensures no unbounded queries; all list endpoints should use these defaults.
 *
 * Production-safe:
 * - Default max take limit
 * - Abuse prevention (cap max limit)
 * - Compatible with admin analytics routes
 *
 * @module lib/pagination
 */

// ============================================================================
// Constants (enterprise-safe defaults)
// ============================================================================

/** Default page size for list APIs */
export const DEFAULT_PAGE_SIZE = 20;

/** Default take for cursor-based pagination */
export const DEFAULT_TAKE = 25;

/** Maximum allowed page size (enforce in API validation) */
export const MAX_PAGE_SIZE = 100;

/** Maximum allowed take for any single query (abuse prevention) */
export const MAX_TAKE = 100;

/**
 * Max rows for aggregation in UI/API routes (dashboard, reports, admin).
 * Capped at 500 to prevent memory blowups and abuse.
 */
export const AGGREGATION_TAKE_UI = 500;

/**
 * @deprecated Use AGGREGATION_TAKE_UI for UI routes.
 * Kept for backward compatibility during migration.
 */
export const AGGREGATION_TAKE = AGGREGATION_TAKE_UI;

/**
 * Max rows for internal/service-auth jobs only (cron, batch, reconciliation).
 * Do NOT use in user-facing API routes.
 */
export const AGGREGATION_TAKE_JOB = 5000;

/**
 * Guard: return AGGREGATION_TAKE_JOB only when service auth has been verified.
 * Use in cron/integration routes after auth check. Throws if not service-auth.
 */
export function requireServiceAuthForJob(authVerified: boolean): number {
  if (!authVerified) {
    throw new Error('AGGREGATION_TAKE_JOB requires service auth (cron secret, integration secret, or x-vercel-cron)');
  }
  return AGGREGATION_TAKE_JOB;
}

// ============================================================================
// Page-based pagination (legacy / list APIs)
// ============================================================================

/**
 * Normalize and clamp pagination params from query/body.
 * Use in list handlers: const { take, skip } = normalizePagination(searchParams);
 */
export function normalizePagination(params: {
  page?: string | number;
  pageSize?: string | number;
  limit?: string | number;
  take?: string | number;
  skip?: string | number;
}): { take: number; skip: number; page: number } {
  const page = Math.max(1, toInt(params.page, 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, toInt(params.pageSize ?? params.limit ?? params.take, DEFAULT_PAGE_SIZE))
  );
  const skip = (page - 1) * pageSize;
  return {
    take: pageSize,
    skip,
    page,
  };
}

function toInt(value: string | number | undefined, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isNaN(n) ? fallback : n;
}

/**
 * Type-safe Prisma findMany args with pagination.
 * Use: prisma.patient.findMany({ ...withPagination(params), where: { clinicId } })
 */
export function withPagination(params: { take: number; skip: number }) {
  return {
    take: params.take,
    skip: params.skip,
  };
}

// ============================================================================
// Cursor-based pagination (Prisma-compatible)
// ============================================================================

export interface PaginationParams {
  take?: number;
  cursor?: string | null;
}

/**
 * Clamp take to safe range [1, MAX_TAKE].
 * Prevents abuse via large limit requests.
 */
export function normalizeTake(take?: number): number {
  if (!take || take < 1) return DEFAULT_TAKE;
  return Math.min(take, MAX_TAKE);
}

/**
 * Extract and normalize `take` from URL search params.
 * Use at API boundaries: const take = parseTakeFromParams(req.nextUrl.searchParams);
 */
export function parseTakeFromParams(params: { get(name: string): string | null }): number {
  const takeStr = params.get('take') ?? params.get('limit') ?? params.get('pageSize');
  const parsed = takeStr ? parseInt(String(takeStr), 10) : NaN;
  return normalizeTake(Number.isNaN(parsed) ? undefined : parsed);
}

/**
 * Build Prisma findMany args for cursor-based pagination (numeric id).
 * Use: prisma.patient.findMany({ ...buildPrismaPagination({ take, cursor }), where })
 */
export function buildPrismaPagination(params: PaginationParams): {
  take: number;
  skip?: 1;
  cursor?: { id: number };
} {
  const normalizedTake = normalizeTake(params.take);
  const result: {
    take: number;
    skip?: 1;
    cursor?: { id: number };
  } = { take: normalizedTake };
  if (params.cursor != null && String(params.cursor).trim()) {
    const id = typeof params.cursor === 'number' ? params.cursor : parseInt(String(params.cursor), 10);
    if (!Number.isNaN(id)) {
      result.skip = 1;
      result.cursor = { id };
    }
  }
  return result;
}

/**
 * Cursor-based pagination for models with string ids.
 */
export function buildPrismaPaginationStringCursor(params: PaginationParams): {
  take: number;
  skip?: 1;
  cursor?: { id: string };
} {
  const normalizedTake = normalizeTake(params.take);
  const result: {
    take: number;
    skip?: 1;
    cursor?: { id: string };
  } = { take: normalizedTake };
  if (params.cursor != null && String(params.cursor).trim()) {
    result.skip = 1;
    result.cursor = { id: String(params.cursor) };
  }
  return result;
}
