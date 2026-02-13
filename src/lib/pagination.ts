/**
 * Pagination enforcement for list APIs – enterprise scale (500k+ records).
 * Ensures no unbounded queries; all list endpoints should use these defaults.
 *
 * @module lib/pagination
 */

/** Default page size for list APIs */
export const DEFAULT_PAGE_SIZE = 20;

/** Maximum allowed page size (enforce in API validation) */
export const MAX_PAGE_SIZE = 100;

/** Max rows when fetching IDs for aggregation (e.g. converted patient IDs). Use in findMany that only selects ids. */
export const AGGREGATION_TAKE = 10_000;

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
