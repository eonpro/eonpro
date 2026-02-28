/**
 * SAFE QUERY UTILITIES
 * ====================
 *
 * Enterprise-safe wrappers for common Prisma operations that enforce
 * bounded queries, pagination, and blob exclusion by default.
 *
 * Includes domain-specific safe query wrappers (safeInvoiceQuery, etc.)
 * that add retry logic, structured error handling, and timeout protection
 * for critical billing/clinical queries.
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
import { logger } from '@/lib/logger';

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

// =============================================================================
// RESILIENT SAFE QUERY WRAPPERS
// =============================================================================

export interface SafeQueryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
}

export interface SafeQueryResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: string;
    message: string;
  };
}

const DEFAULT_SAFE_QUERY_OPTIONS: Required<SafeQueryOptions> = {
  maxRetries: 2,
  initialDelayMs: 200,
  maxDelayMs: 3000,
  timeoutMs: 15000,
};

function isTransientDbError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  const msg = (e.message || '').toLowerCase();
  return (
    e.code === 'P2024' ||
    msg.includes('connection pool') ||
    msg.includes('timed out fetching') ||
    msg.includes('econnreset') ||
    msg.includes('connection reset')
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic resilient query wrapper with retry logic and structured error handling.
 * Retries on transient DB errors (connection pool exhaustion, timeouts).
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  description: string,
  options?: SafeQueryOptions
): Promise<SafeQueryResult<T>> {
  const opts = { ...DEFAULT_SAFE_QUERY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), opts.timeoutMs)
        ),
      ]);
      return { success: true, data: result };
    } catch (err: unknown) {
      lastError = err;
      const isTransient = isTransientDbError(err);

      if (isTransient && attempt < opts.maxRetries) {
        const backoff = Math.min(
          opts.initialDelayMs * Math.pow(2, attempt),
          opts.maxDelayMs
        );
        logger.warn(`[SafeQuery] Transient error on "${description}", retrying (${attempt + 1}/${opts.maxRetries})`, {
          error: (err as Error).message,
          backoffMs: backoff,
        });
        await delay(backoff);
        continue;
      }

      break;
    }
  }

  const error = lastError as { code?: string; message?: string; name?: string };
  const errorType = isTransientDbError(lastError)
    ? 'CONNECTION_POOL'
    : error?.name || 'QUERY_ERROR';

  logger.error(`[SafeQuery] Failed: "${description}"`, {
    errorType,
    message: error?.message,
    code: error?.code,
  });

  return {
    success: false,
    error: {
      type: errorType,
      message: error?.message || 'Unknown database error',
    },
  };
}

/**
 * Resilient wrapper for invoice-related queries.
 * Includes invoice-specific retry tuning (higher timeout for complex joins).
 */
export async function safeInvoiceQuery<T>(
  queryFn: () => Promise<T>,
  description: string,
  options?: SafeQueryOptions
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, description, {
    timeoutMs: 20000,
    ...options,
  });
}

/**
 * Resilient wrapper for payment-related queries.
 */
export async function safePaymentQuery<T>(
  queryFn: () => Promise<T>,
  description: string,
  options?: SafeQueryOptions
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, description, {
    timeoutMs: 15000,
    ...options,
  });
}

/**
 * Resilient wrapper for prescription-related queries.
 */
export async function safePrescriptionQuery<T>(
  queryFn: () => Promise<T>,
  description: string,
  options?: SafeQueryOptions
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, description, {
    timeoutMs: 15000,
    ...options,
  });
}

/**
 * Execute multiple queries concurrently with individual resilience.
 * Returns results for each query, even if some fail.
 */
export async function safeBatchQuery<T extends Record<string, () => Promise<unknown>>>(
  queries: T,
  description: string,
  options?: SafeQueryOptions
): Promise<{
  success: boolean;
  results: { [K in keyof T]: SafeQueryResult<Awaited<ReturnType<T[K]>>> };
}> {
  const keys = Object.keys(queries) as (keyof T)[];
  const settled = await Promise.all(
    keys.map((key) =>
      safeQuery(queries[key] as () => Promise<any>, `${description}:${String(key)}`, options)
    )
  );

  const results = {} as { [K in keyof T]: SafeQueryResult<Awaited<ReturnType<T[K]>>> };
  let allSuccess = true;

  keys.forEach((key, i) => {
    results[key] = settled[i];
    if (!settled[i].success) allSuccess = false;
  });

  return { success: allSuccess, results };
}
