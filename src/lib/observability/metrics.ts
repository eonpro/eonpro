/**
 * STRUCTURED METRICS SERVICE
 * ==========================
 *
 * Centralized metrics emission for observability.
 * Sentry.metrics was deprecated (beta ended Oct 2024) and removed in SDK v9+.
 * This module now uses structured logging for metrics until Sentry ships a replacement.
 *
 * @module observability/metrics
 */

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
 * Emit comprehensive request-level metrics.
 * Call at the end of each API request.
 */
export function emitRequestMetrics(data: RequestMetrics): void {
  try {
    if (data.statusCode >= 500) {
      logger.error('[METRICS] api.request.server_error', {
        route: data.route,
        method: data.method,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
        queryCount: data.queryCount,
        dbTimeMs: data.dbTimeMs,
      });
    } else if (data.durationMs > 3000) {
      logger.warn('[METRICS] api.request.slow', {
        route: data.route,
        method: data.method,
        statusCode: data.statusCode,
        durationMs: data.durationMs,
        queryCount: data.queryCount,
        dbTimeMs: data.dbTimeMs,
      });
    }
  } catch {
    // Best-effort metrics
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
    if (data.utilizationPercent > 80) {
      logger.warn('[METRICS] db.pool.high_utilization', {
        active: data.activeConnections,
        idle: data.idleConnections,
        max: data.maxConnections,
        utilization: data.utilizationPercent,
      });
    }
  } catch {
    // Best-effort metrics
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
    if (data.durationMs > 1000) {
      logger.warn('[METRICS] db.query.slow', {
        operation: data.operation,
        table: data.table,
        durationMs: data.durationMs,
      });
    }
  } catch {
    // Best-effort metrics
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
    if (!healthy) {
      logger.error('[METRICS] health.status.unhealthy');
    }
  } catch {
    // Best-effort metrics
  }
}

// ============================================================================
// Feature Flag Metrics
// ============================================================================

/**
 * Track feature flag check frequency and disabled hits.
 */
export function emitFeatureFlagMetric(_flag: string, _enabled: boolean): void {
  // No-op: feature flag metrics are low-value without aggregation.
  // Re-enable when Sentry ships a replacement metrics API.
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
    if (!data.success) {
      logger.warn('[METRICS] external.request.error', {
        service: data.service,
        operation: data.operation,
        durationMs: data.durationMs,
      });
    } else if (data.durationMs > 5000) {
      logger.warn('[METRICS] external.request.slow', {
        service: data.service,
        operation: data.operation,
        durationMs: data.durationMs,
      });
    }
  } catch {
    // Best-effort metrics
  }
}
