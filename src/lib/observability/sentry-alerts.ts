/**
 * SENTRY ALERT CONFIGURATION
 * ===========================
 *
 * Defines alert rules for the platform. These are applied via:
 * 1. The setup script: `npx ts-node scripts/setup-sentry-alerts.ts`
 * 2. Or manually in Sentry Dashboard → Alerts → Create Alert Rule
 *
 * Alert tiers:
 *   CRITICAL → PagerDuty / Slack @channel (immediate response required)
 *   WARNING  → Slack #alerts channel (investigate within 1 hour)
 *   INFO     → Slack #monitoring (informational, no action required)
 *
 * @module observability/sentry-alerts
 */

import * as Sentry from '@sentry/nextjs';
import { logger } from '@/lib/logger';

// ============================================================================
// Alert Rule Definitions
// ============================================================================

export interface AlertRule {
  name: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  type: 'error' | 'metric' | 'transaction';
  condition: string;
  action: string;
}

/**
 * All alert rules for the EONPRO platform.
 * Configure these in Sentry Dashboard → Alerts → Create Alert Rule.
 */
export const ALERT_RULES: AlertRule[] = [
  // ── CRITICAL: Immediate response required ──────────────────────────────
  {
    name: 'Error Spike',
    description: 'More than 50 errors in 5 minutes — indicates systemic failure',
    severity: 'critical',
    type: 'error',
    condition: 'Number of events > 50 in 5 minutes',
    action: 'PagerDuty + Slack #alerts @channel',
  },
  {
    name: 'Connection Pool Exhaustion (P2024)',
    description: 'Any P2024 error means database connections are exhausted',
    severity: 'critical',
    type: 'error',
    condition: 'First seen event matching "P2024" OR "Timed out fetching a new connection"',
    action: 'PagerDuty + Slack #alerts @channel',
  },
  {
    name: '503 Cascade',
    description: 'More than 10 HTTP 503 responses in 5 minutes',
    severity: 'critical',
    type: 'error',
    condition: 'Number of events with tag http.status_code:503 > 10 in 5 minutes',
    action: 'PagerDuty + Slack #alerts @channel',
  },
  {
    name: 'Database Unreachable',
    description: 'Health check reports database unhealthy',
    severity: 'critical',
    type: 'error',
    condition: 'First seen event matching "P1001" OR "P1002" OR "Database health check failed"',
    action: 'PagerDuty + Slack #alerts @channel',
  },

  // ── WARNING: Investigate within 1 hour ─────────────────────────────────
  {
    name: 'Slow API Route',
    description: 'P95 response time exceeds 3 seconds for any API route',
    severity: 'warning',
    type: 'transaction',
    condition: 'Transaction duration P95 > 3000ms for 5 minutes',
    action: 'Slack #alerts',
  },
  {
    name: 'High Query Count',
    description: 'Request exceeded 30 queries — potential N+1 or fan-out',
    severity: 'warning',
    type: 'error',
    condition: 'First seen event matching "Query budget exceeded"',
    action: 'Slack #alerts',
  },
  {
    name: 'New Unhandled Error',
    description: 'First occurrence of a new error type',
    severity: 'warning',
    type: 'error',
    condition: 'New issue created (first event)',
    action: 'Slack #alerts',
  },
  {
    name: 'Circuit Breaker Open',
    description: 'An external service circuit breaker has opened',
    severity: 'warning',
    type: 'error',
    condition: 'First seen event matching "Circuit breaker * is now OPEN"',
    action: 'Slack #alerts',
  },
  {
    name: 'Tenant Isolation Violation',
    description: 'Cross-clinic data access attempted — HIPAA concern',
    severity: 'warning',
    type: 'error',
    condition: 'First seen event matching "Cross-clinic data" OR "TENANT_CONTEXT_REQUIRED"',
    action: 'Slack #alerts + HIPAA audit log',
  },

  // ── INFO: Monitoring, no action required ───────────────────────────────
  {
    name: 'Webhook Retry Exhausted',
    description: 'A webhook has exceeded max retries and entered DLQ',
    severity: 'info',
    type: 'error',
    condition: 'Event matching "DLQ" OR "retry exhausted"',
    action: 'Slack #monitoring',
  },
  {
    name: 'Slow Database Query',
    description: 'Individual query took > 1 second',
    severity: 'info',
    type: 'error',
    condition: 'Event matching "Slow query detected"',
    action: 'Slack #monitoring',
  },
];

// ============================================================================
// Runtime Alert Helpers
// ============================================================================

/**
 * Emit a critical alert event to Sentry with proper tagging.
 * Use for programmatic alerts (e.g., health check failures).
 */
export function emitCriticalAlert(title: string, details: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    scope.setLevel('fatal');
    scope.setTag('alert.severity', 'critical');
    scope.setTag('alert.source', 'platform');
    scope.setContext('alert_details', details);
    Sentry.captureMessage(`CRITICAL: ${title}`, 'fatal');
  });

  logger.error(`[ALERT:CRITICAL] ${title}`, undefined, details);
}

/**
 * Emit a warning alert event to Sentry.
 */
export function emitWarningAlert(title: string, details: Record<string, unknown>): void {
  Sentry.withScope((scope) => {
    scope.setLevel('warning');
    scope.setTag('alert.severity', 'warning');
    scope.setTag('alert.source', 'platform');
    scope.setContext('alert_details', details);
    Sentry.captureMessage(`WARNING: ${title}`, 'warning');
  });

  logger.warn(`[ALERT:WARNING] ${title}`, details);
}

/**
 * Track a metric that can trigger Sentry metric alerts.
 * Useful for query counts, response times, etc.
 */
export function trackAlertMetric(
  name: string,
  value: number,
  tags?: Record<string, string>
): void {
  try {
    Sentry.metrics.distribution(name, value, {
      tags,
      unit: name.includes('time') || name.includes('duration') ? 'millisecond' : 'none',
    });
  } catch {
    // Metrics API may not be available in all environments
  }
}

/**
 * Track request-level metrics for alerting.
 * Call at the end of each API request.
 */
export function trackRequestMetrics(data: {
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  queryCount: number;
  dbTimeMs: number;
}): void {
  const tags = {
    route: data.route,
    method: data.method,
    status_class: `${Math.floor(data.statusCode / 100)}xx`,
  };

  trackAlertMetric('api.request.duration', data.durationMs, tags);
  trackAlertMetric('api.request.query_count', data.queryCount, tags);
  trackAlertMetric('api.request.db_time', data.dbTimeMs, tags);

  if (data.statusCode >= 500) {
    trackAlertMetric('api.request.server_error', 1, tags);
  }

  // Emit warning for high query counts
  if (data.queryCount > 30) {
    emitWarningAlert('High query count detected', {
      route: data.route,
      queryCount: data.queryCount,
      dbTimeMs: data.dbTimeMs,
    });
  }

  // Emit warning for slow requests
  if (data.durationMs > 5000) {
    emitWarningAlert('Slow request detected', {
      route: data.route,
      durationMs: data.durationMs,
      queryCount: data.queryCount,
    });
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { AlertRule as SentryAlertRule };
