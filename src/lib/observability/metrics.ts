/**
 * STRUCTURED METRICS SERVICE
 * ==========================
 *
 * Centralized metrics emission for Sentry dashboards.
 * All metrics flow through here for consistency and discoverability.
 *
 * Sentry Dashboard Configuration:
 *   1. Go to Sentry → Performance → Create Dashboard
 *   2. Add widgets using these custom metrics:
 *      - api.request.duration (distribution, ms) — P50, P95, P99 by route
 *      - api.request.query_count (distribution) — queries per request by route
 *      - api.request.db_time (distribution, ms) — total DB time per request
 *      - api.request.server_error (counter) — 5xx errors by route
 *      - db.pool.utilization (gauge, %) — connection pool usage
 *      - health.status (gauge, 0/1) — platform health
 *
 * @module observability/metrics
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

interface RequestMetrics {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  queryCount: number;
  dbTimeMs: number;
}

interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  utilizationPercent: number;
}

// ============================================================================
// Request Metrics
// ============================================================================

/**
 * Emit comprehensive request-level metrics to Sentry.
 * Call at the end of each API request.
 */
export function emitRequestMetrics(data: RequestMetrics): void {
  const tags = {
    route: data.route,
    method: data.method,
    status_class: `${Math.floor(data.statusCode / 100)}xx`,
  };

  try {
    // Core latency metric — powers P50/P95/P99 widgets
    Sentry.metrics.distribution('api.request.duration', data.durationMs, {
      tags,
      unit: 'millisecond',
    });

    // Query count per request — detect N+1 and fan-out
    Sentry.metrics.distribution('api.request.query_count', data.queryCount, {
      tags,
      unit: 'none',
    });

    // Database time per request — isolate DB vs compute bottlenecks
    Sentry.metrics.distribution('api.request.db_time', data.dbTimeMs, {
      tags,
      unit: 'millisecond',
    });

    // Error counter — powers error rate widget
    if (data.statusCode >= 500) {
      Sentry.metrics.increment('api.request.server_error', 1, { tags });
    }

    // Rate counter — total request throughput
    Sentry.metrics.increment('api.request.count', 1, { tags });
  } catch {
    // Metrics API may not be available in all environments
  }
}

// ============================================================================
// Database Metrics
// ============================================================================

/**
 * Emit database connection pool metrics.
 * Called periodically by the health monitor.
 */
export function emitPoolMetrics(data: PoolMetrics): void {
  try {
    Sentry.metrics.gauge('db.pool.active', data.activeConnections);
    Sentry.metrics.gauge('db.pool.idle', data.idleConnections);
    Sentry.metrics.gauge('db.pool.max', data.maxConnections);
    Sentry.metrics.gauge('db.pool.utilization', data.utilizationPercent, { unit: 'percent' });
  } catch {
    // Metrics API may not be available
  }
}

/**
 * Emit a single query timing metric.
 */
export function emitQueryMetric(data: {
  operation: string;
  table: string;
  durationMs: number;
}): void {
  try {
    Sentry.metrics.distribution('db.query.duration', data.durationMs, {
      tags: { operation: data.operation, table: data.table },
      unit: 'millisecond',
    });

    // Flag slow queries (> 1s)
    if (data.durationMs > 1000) {
      Sentry.metrics.increment('db.query.slow', 1, {
        tags: { operation: data.operation, table: data.table },
      });
    }
  } catch {
    // Metrics API may not be available
  }
}

// ============================================================================
// Health Metrics
// ============================================================================

/**
 * Emit platform health status metric.
 */
export function emitHealthMetric(healthy: boolean): void {
  try {
    Sentry.metrics.gauge('health.status', healthy ? 1 : 0);
  } catch {
    // Metrics API may not be available
  }
}

// ============================================================================
// Feature Flag Metrics
// ============================================================================

/**
 * Track feature flag check frequency and disabled hits.
 */
export function emitFeatureFlagMetric(flag: string, enabled: boolean): void {
  try {
    Sentry.metrics.increment('feature_flag.check', 1, { tags: { flag } });
    if (!enabled) {
      Sentry.metrics.increment('feature_flag.disabled_hit', 1, { tags: { flag } });
    }
  } catch {
    // Metrics API may not be available
  }
}

// ============================================================================
// External Service Metrics
// ============================================================================

/**
 * Emit metrics for external service calls.
 */
export function emitExternalServiceMetric(data: {
  service: string;
  operation: string;
  durationMs: number;
  success: boolean;
}): void {
  try {
    Sentry.metrics.distribution('external.request.duration', data.durationMs, {
      tags: { service: data.service, operation: data.operation },
      unit: 'millisecond',
    });

    if (!data.success) {
      Sentry.metrics.increment('external.request.error', 1, {
        tags: { service: data.service, operation: data.operation },
      });
    }
  } catch {
    // Metrics API may not be available
  }
}
