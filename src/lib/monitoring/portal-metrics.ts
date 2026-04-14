/**
 * PATIENT PORTAL METRICS
 * ======================
 * Lightweight in-memory metrics for patient portal API routes.
 * Uses a ring buffer to track recent request latencies and error rates
 * without any external dependency.
 *
 * Designed for serverless: each instance maintains its own buffer.
 * The cron health check aggregates across time, not instances.
 *
 * @module monitoring/portal-metrics
 */

import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProbeStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ProbeResult {
  name: string;
  status: ProbeStatus;
  latencyMs: number;
  message?: string;
}

export interface PortalHealthReport {
  status: ProbeStatus;
  timestamp: string;
  durationMs: number;
  probes: ProbeResult[];
  metrics: MetricsSnapshot;
}

interface RequestRecord {
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  timestamp: number;
}

export interface EndpointMetrics {
  endpoint: string;
  requestCount: number;
  errorCount: number;
  errorRate: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface MetricsSnapshot {
  windowMs: number;
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  endpoints: EndpointMetrics[];
}

export interface IncidentRecord {
  from: ProbeStatus;
  to: ProbeStatus;
  timestamp: string;
  probes: ProbeResult[];
}

// ---------------------------------------------------------------------------
// Ring Buffer
// ---------------------------------------------------------------------------

const BUFFER_SIZE = 1000;
const METRICS_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const ringBuffer: RequestRecord[] = [];
let bufferIndex = 0;

/**
 * Record a portal API request metric.
 * Call this from portal API routes or middleware.
 */
export function recordPortalRequest(endpoint: string, statusCode: number, latencyMs: number): void {
  const record: RequestRecord = {
    endpoint,
    statusCode,
    latencyMs,
    timestamp: Date.now(),
  };

  if (ringBuffer.length < BUFFER_SIZE) {
    ringBuffer.push(record);
  } else {
    ringBuffer[bufferIndex % BUFFER_SIZE] = record;
  }
  bufferIndex++;
}

/**
 * Get a snapshot of current metrics within the time window.
 */
export function getMetricsSnapshot(): MetricsSnapshot {
  const cutoff = Date.now() - METRICS_WINDOW_MS;
  const recent = ringBuffer.filter((r) => r.timestamp > cutoff);

  if (recent.length === 0) {
    return {
      windowMs: METRICS_WINDOW_MS,
      totalRequests: 0,
      totalErrors: 0,
      errorRate: 0,
      endpoints: [],
    };
  }

  const totalRequests = recent.length;
  const totalErrors = recent.filter((r) => r.statusCode >= 400).length;

  // Group by endpoint
  const byEndpoint = new Map<string, RequestRecord[]>();
  for (const r of recent) {
    const existing = byEndpoint.get(r.endpoint) || [];
    existing.push(r);
    byEndpoint.set(r.endpoint, existing);
  }

  const endpoints: EndpointMetrics[] = [];
  for (const [endpoint, records] of byEndpoint) {
    const sorted = records.map((r) => r.latencyMs).sort((a, b) => a - b);
    const errors = records.filter((r) => r.statusCode >= 400).length;

    endpoints.push({
      endpoint,
      requestCount: records.length,
      errorCount: errors,
      errorRate: records.length > 0 ? errors / records.length : 0,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
    });
  }

  endpoints.sort((a, b) => b.requestCount - a.requestCount);

  return {
    windowMs: METRICS_WINDOW_MS,
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    endpoints,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Incident History
// ---------------------------------------------------------------------------

const MAX_INCIDENTS = 20;
const incidents: IncidentRecord[] = [];
let lastStatus: ProbeStatus = 'healthy';

/**
 * Record a status transition. Returns true if the status changed.
 */
export function recordStatusTransition(newStatus: ProbeStatus, probes: ProbeResult[]): boolean {
  if (newStatus === lastStatus) return false;

  const incident: IncidentRecord = {
    from: lastStatus,
    to: newStatus,
    timestamp: new Date().toISOString(),
    probes,
  };

  incidents.unshift(incident);
  if (incidents.length > MAX_INCIDENTS) {
    incidents.pop();
  }

  const prev = lastStatus;
  lastStatus = newStatus;

  logger.info('[PortalMetrics] Status transition', {
    from: prev,
    to: newStatus,
  });

  return true;
}

export function getLastStatus(): ProbeStatus {
  return lastStatus;
}

export function getIncidents(): IncidentRecord[] {
  return [...incidents];
}

// ---------------------------------------------------------------------------
// Metrics Wrapper for API Routes
// ---------------------------------------------------------------------------

/**
 * Wrap a handler function to automatically record metrics.
 * Usage: export const GET = withPortalMetrics('/api/patient-portal/billing', handler);
 */
export function withPortalMetrics<T extends (...args: any[]) => Promise<Response>>(
  endpoint: string,
  handler: T
): T {
  return (async (...args: any[]) => {
    const start = Date.now();
    try {
      const response = await handler(...args);
      recordPortalRequest(endpoint, response.status, Date.now() - start);
      return response;
    } catch (error) {
      recordPortalRequest(endpoint, 500, Date.now() - start);
      throw error;
    }
  }) as T;
}
