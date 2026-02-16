/**
 * QUERY BUDGET GUARD
 * ==================
 *
 * Tracks the number of database queries per request and alerts
 * when a request exceeds safe thresholds. This prevents N+1 patterns
 * and fan-out queries from causing connection pool exhaustion.
 *
 * Architecture:
 *   Uses the existing AsyncLocalStorage request context to track
 *   query count and cumulative DB time per request. Hooks into
 *   the Prisma $use middleware.
 *
 * Thresholds:
 *   - WARN at 15 queries per request
 *   - ERROR at 30 queries per request (Sentry alert)
 *   - Query time budget: 5000ms cumulative DB time
 *
 * @module database/query-budget
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const QUERY_WARN_THRESHOLD = 15;
const QUERY_ERROR_THRESHOLD = 30;
const CUMULATIVE_DB_TIME_WARN_MS = 3000;
const CUMULATIVE_DB_TIME_ERROR_MS = 5000;

// =============================================================================
// QUERY BUDGET CONTEXT
// =============================================================================

interface QueryBudgetContext {
  queryCount: number;
  cumulativeDbTimeMs: number;
  route: string;
  requestId: string;
  warnEmitted: boolean;
  errorEmitted: boolean;
  slowQueries: Array<{ model: string; action: string; durationMs: number }>;
}

const queryBudgetStorage = new AsyncLocalStorage<QueryBudgetContext>();

/**
 * Run a function within a query budget context.
 * Called by auth middleware alongside request context.
 */
export function runWithQueryBudget<T>(
  route: string,
  requestId: string,
  fn: () => T
): T {
  const ctx: QueryBudgetContext = {
    queryCount: 0,
    cumulativeDbTimeMs: 0,
    route,
    requestId,
    warnEmitted: false,
    errorEmitted: false,
    slowQueries: [],
  };

  return queryBudgetStorage.run(ctx, () => {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(() => {
        emitRequestSummary(ctx);
      }) as T;
    }
    emitRequestSummary(ctx);
    return result;
  });
}

/**
 * Record a query execution within the current request budget.
 * Called from the Prisma $use middleware.
 */
export function recordQuery(
  model: string | undefined,
  action: string | undefined,
  durationMs: number
): void {
  const ctx = queryBudgetStorage.getStore();
  if (!ctx) return;

  ctx.queryCount++;
  ctx.cumulativeDbTimeMs += durationMs;

  if (durationMs > 100) {
    ctx.slowQueries.push({
      model: model || 'unknown',
      action: action || 'unknown',
      durationMs,
    });
  }

  if (ctx.queryCount === QUERY_WARN_THRESHOLD && !ctx.warnEmitted) {
    ctx.warnEmitted = true;
    logger.warn('[QueryBudget] Request approaching query limit', {
      route: ctx.route,
      requestId: ctx.requestId,
      queryCount: ctx.queryCount,
      cumulativeDbTimeMs: ctx.cumulativeDbTimeMs,
    });
  }

  if (ctx.queryCount === QUERY_ERROR_THRESHOLD && !ctx.errorEmitted) {
    ctx.errorEmitted = true;
    logger.error('[QueryBudget] Request exceeded query budget', undefined, {
      route: ctx.route,
      requestId: ctx.requestId,
      queryCount: ctx.queryCount,
      cumulativeDbTimeMs: ctx.cumulativeDbTimeMs,
      slowQueries: JSON.stringify(ctx.slowQueries.slice(0, 5)),
    });
  }
}

/**
 * Get the current query budget metrics for the active request.
 * Returns undefined if called outside a request scope.
 */
export function getQueryBudgetMetrics(): {
  queryCount: number;
  cumulativeDbTimeMs: number;
  route: string;
} | undefined {
  const ctx = queryBudgetStorage.getStore();
  if (!ctx) return undefined;
  return {
    queryCount: ctx.queryCount,
    cumulativeDbTimeMs: ctx.cumulativeDbTimeMs,
    route: ctx.route,
  };
}

// =============================================================================
// INTERNAL
// =============================================================================

function emitRequestSummary(ctx: QueryBudgetContext): void {
  if (ctx.queryCount === 0) return;

  const level =
    ctx.queryCount >= QUERY_ERROR_THRESHOLD || ctx.cumulativeDbTimeMs >= CUMULATIVE_DB_TIME_ERROR_MS
      ? 'error'
      : ctx.queryCount >= QUERY_WARN_THRESHOLD || ctx.cumulativeDbTimeMs >= CUMULATIVE_DB_TIME_WARN_MS
        ? 'warn'
        : 'info';

  const logData = {
    route: ctx.route,
    requestId: ctx.requestId,
    queryCount: ctx.queryCount,
    cumulativeDbTimeMs: ctx.cumulativeDbTimeMs,
    slowQueryCount: ctx.slowQueries.length,
  };

  if (level === 'error') {
    logger.error('[QueryBudget] Heavy request completed', undefined, logData);
  } else if (level === 'warn') {
    logger.warn('[QueryBudget] Elevated query count', logData);
  }
  // info-level requests are not logged to avoid noise
}
