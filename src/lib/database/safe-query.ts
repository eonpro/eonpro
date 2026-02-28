/**
 * SAFE QUERY UTILITIES
 * ====================
 *
 * Enterprise-safe wrappers for common Prisma operations that enforce
 * bounded queries, pagination, and blob exclusion by default.
 *
 * These are opt-in utilities — existing routes continue working unmodified.
 * New and refactored routes should use these to prevent unbounded queries.
 *
 * @module database/safe-query
 */

import { NextRequest } from 'next/server';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  AGGREGATION_TAKE_UI,
  normalizePagination,
} from '@/lib/pagination';

// =============================================================================
// TYPES
// =============================================================================

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  page: number;
  hasMore: boolean;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface SafeFindManyOptions {
  /** Maximum allowed take for this query. Defaults to MAX_PAGE_SIZE (100). */
  maxTake?: number;
  /** Skip the parallel count query (when you don't need total). */
  skipCount?: boolean;
}

// =============================================================================
// SAFE FIND MANY
// =============================================================================

/**
 * Execute a paginated findMany with automatic take enforcement and total count.
 *
 * Accepts any Prisma delegate (prisma.patient, prisma.invoice, etc.) and
 * returns `{ data, pagination }` with bounded results.
 *
 * @example
 * const result = await safeFindMany(prisma.patient, {
 *   where: { clinicId },
 *   orderBy: { createdAt: 'desc' },
 * }, parsePaginationFromRequest(req));
 *
 * return NextResponse.json(result);
 */
export async function safeFindMany<T>(
  delegate: {
    findMany: (args: any) => Promise<T[]>;
    count: (args?: any) => Promise<number>;
  },
  findManyArgs: Record<string, any>,
  pagination: { take: number; skip: number; page: number },
  options: SafeFindManyOptions = {}
): Promise<PaginatedResult<T>> {
  const { maxTake = MAX_PAGE_SIZE, skipCount = false } = options;

  const take = Math.min(pagination.take, maxTake);
  const skip = pagination.skip;

  const queryArgs = {
    ...findManyArgs,
    take,
    skip,
  };

  // Build count args from the where clause only
  const countArgs = findManyArgs.where ? { where: findManyArgs.where } : undefined;

  if (skipCount) {
    const data = await delegate.findMany(queryArgs);
    return {
      data,
      pagination: {
        total: -1,
        limit: take,
        offset: skip,
        page: pagination.page,
        hasMore: data.length === take,
        totalPages: -1,
      },
    };
  }

  const [data, total] = await Promise.all([
    delegate.findMany(queryArgs),
    delegate.count(countArgs),
  ]);

  return {
    data,
    pagination: {
      total,
      limit: take,
      offset: skip,
      page: pagination.page,
      hasMore: skip + data.length < total,
      totalPages: Math.ceil(total / take),
    },
  };
}

// =============================================================================
// REQUEST HELPERS
// =============================================================================

/**
 * Parse pagination parameters from a NextRequest's search params.
 * Supports both page-based (`page`, `pageSize`) and offset-based (`limit`, `offset`) styles.
 *
 * @example
 * export const GET = withAuth(async (req) => {
 *   const pagination = parsePaginationFromRequest(req);
 *   const result = await safeFindMany(prisma.patient, { where }, pagination);
 *   return NextResponse.json(result);
 * });
 */
export function parsePaginationFromRequest(req: NextRequest): {
  take: number;
  skip: number;
  page: number;
} {
  const params = req.nextUrl.searchParams;

  // Support offset-based params (limit/offset)
  const offsetStr = params.get('offset');
  if (offsetStr !== null) {
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(params.get('limit') || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
    );
    const offset = Math.max(0, parseInt(offsetStr, 10) || 0);
    return {
      take: limit,
      skip: offset,
      page: Math.floor(offset / limit) + 1,
    };
  }

  // Fall back to page-based params
  return normalizePagination({
    page: params.get('page') ?? undefined,
    pageSize: params.get('pageSize') ?? params.get('limit') ?? undefined,
  });
}

/**
 * Shortcut for routes that need a high-limit aggregation query (admin dashboards).
 * Caps at AGGREGATION_TAKE_UI (500).
 */
export function parseAggregationPagination(req: NextRequest): {
  take: number;
  skip: number;
  page: number;
} {
  const params = req.nextUrl.searchParams;
  return normalizePagination({
    page: params.get('page') ?? undefined,
    pageSize: params.get('pageSize') ?? params.get('limit') ?? String(AGGREGATION_TAKE_UI),
  });
}

// =============================================================================
// BLOB GUARD
// =============================================================================

/**
 * Default select shape for PatientDocument list queries.
 * Explicitly excludes the `data` (Bytes) field to prevent blob loading in list contexts.
 *
 * Use this whenever listing documents — only load `data` in dedicated download endpoints.
 */
export const PATIENT_DOCUMENT_LIST_SELECT = {
  id: true,
  patientId: true,
  clinicId: true,
  type: true,
  title: true,
  fileName: true,
  mimeType: true,
  fileSize: true,
  s3DataKey: true,
  category: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  // data: false — intentionally omitted to prevent blob loading
} as const;
