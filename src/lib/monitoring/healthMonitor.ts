/**
 * Health Monitoring Service
 * 
 * Phase 3 of the 5-Phase Integration Plan
 * 
 * Tracks:
 * - Webhook success/failure rates
 * - Processing latency
 * - Queue depth
 * - Database health
 * - External service status
 */

import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const UPSTASH_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const METRICS_KEY = 'eonpro:metrics';
const METRICS_WINDOW_SECONDS = 3600; // 1 hour rolling window
const ALERT_THRESHOLD_SUCCESS_RATE = 0.95; // Alert if below 95%
const ALERT_THRESHOLD_LATENCY_MS = 5000; // Alert if above 5s average

// =============================================================================
// TYPES
// =============================================================================

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    database: ServiceCheck;
    redis: ServiceCheck;
    webhook: ServiceCheck;
  };
  metrics: {
    successRate: number;
    avgLatencyMs: number;
    requestsLastHour: number;
    errorsLastHour: number;
    queueDepth: number;
  };
}

export interface ServiceCheck {
  status: 'up' | 'down' | 'degraded';
  latencyMs?: number;
  lastError?: string;
  lastCheck: string;
}

export interface MetricEvent {
  type: 'webhook_success' | 'webhook_error' | 'db_query' | 'external_call';
  source: string;
  latencyMs: number;
  success: boolean;
  error?: string;
  timestamp: number;
}

// =============================================================================
// UPSTASH HELPERS
// =============================================================================

async function upstashCommand(command: string[]): Promise<unknown> {
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
    return null;
  }

  try {
    const response = await fetch(UPSTASH_REST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${UPSTASH_REST_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.result;
  } catch {
    return null;
  }
}

// =============================================================================
// METRICS RECORDING
// =============================================================================

const startTime = Date.now();

/**
 * Record a metric event
 */
export async function recordMetric(event: Omit<MetricEvent, 'timestamp'>): Promise<void> {
  const metric: MetricEvent = {
    ...event,
    timestamp: Date.now(),
  };

  // Store in Redis with TTL
  const key = `${METRICS_KEY}:${metric.timestamp}`;
  await upstashCommand([
    'SET', key, JSON.stringify(metric), 
    'EX', String(METRICS_WINDOW_SECONDS)
  ]);

  // Update counters
  const counterKey = `${METRICS_KEY}:counters`;
  if (metric.success) {
    await upstashCommand(['HINCRBY', counterKey, 'success', '1']);
  } else {
    await upstashCommand(['HINCRBY', counterKey, 'errors', '1']);
  }
  await upstashCommand(['HINCRBY', counterKey, 'total', '1']);
  await upstashCommand(['HINCRBY', counterKey, 'latencySum', String(metric.latencyMs)]);

  // Set expiry on counters (reset every hour)
  await upstashCommand(['EXPIRE', counterKey, String(METRICS_WINDOW_SECONDS)]);
}

/**
 * Record webhook success
 */
export async function recordWebhookSuccess(source: string, latencyMs: number): Promise<void> {
  await recordMetric({
    type: 'webhook_success',
    source,
    latencyMs,
    success: true,
  });
}

/**
 * Record webhook error
 */
export async function recordWebhookError(source: string, latencyMs: number, error: string): Promise<void> {
  await recordMetric({
    type: 'webhook_error',
    source,
    latencyMs,
    success: false,
    error,
  });
}

// =============================================================================
// HEALTH CHECKS
// =============================================================================

/**
 * Check database health
 */
async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    // Dynamic import to avoid circular dependencies
    const { prisma } = await import('@/lib/db');
    await prisma.$queryRaw`SELECT 1`;
    
    return {
      status: 'up',
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      lastError: err instanceof Error ? err.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<ServiceCheck> {
  const start = Date.now();
  
  if (!UPSTASH_REST_URL || !UPSTASH_REST_TOKEN) {
    return {
      status: 'down',
      lastError: 'Not configured',
      lastCheck: new Date().toISOString(),
    };
  }

  try {
    const result = await upstashCommand(['PING']);
    
    return {
      status: result === 'PONG' ? 'up' : 'degraded',
      latencyMs: Date.now() - start,
      lastCheck: new Date().toISOString(),
    };
  } catch (err) {
    return {
      status: 'down',
      latencyMs: Date.now() - start,
      lastError: err instanceof Error ? err.message : 'Unknown error',
      lastCheck: new Date().toISOString(),
    };
  }
}

/**
 * Check webhook processing health based on recent metrics
 */
async function checkWebhook(): Promise<ServiceCheck> {
  const counterKey = `${METRICS_KEY}:counters`;
  const counters = await upstashCommand(['HGETALL', counterKey]) as string[] | null;
  
  if (!counters || counters.length === 0) {
    return {
      status: 'up',
      lastCheck: new Date().toISOString(),
    };
  }

  const stats: Record<string, number> = {};
  for (let i = 0; i < counters.length; i += 2) {
    stats[counters[i]] = parseInt(counters[i + 1], 10) || 0;
  }

  const total = stats.total || 0;
  const errors = stats.errors || 0;
  const successRate = total > 0 ? (total - errors) / total : 1;
  const avgLatency = total > 0 ? (stats.latencySum || 0) / total : 0;

  let status: 'up' | 'degraded' | 'down' = 'up';
  let lastError: string | undefined;

  if (successRate < ALERT_THRESHOLD_SUCCESS_RATE) {
    status = 'degraded';
    lastError = `Success rate ${(successRate * 100).toFixed(1)}% below threshold`;
  }
  
  if (avgLatency > ALERT_THRESHOLD_LATENCY_MS) {
    status = status === 'degraded' ? 'down' : 'degraded';
    lastError = `${lastError ? lastError + '; ' : ''}Average latency ${avgLatency.toFixed(0)}ms above threshold`;
  }

  return {
    status,
    latencyMs: avgLatency,
    lastError,
    lastCheck: new Date().toISOString(),
  };
}

/**
 * Get current queue depth from DLQ
 */
async function getQueueDepth(): Promise<number> {
  try {
    const { getAllSubmissions } = await import('@/lib/queue/deadLetterQueue');
    const submissions = await getAllSubmissions();
    return submissions.filter(s => s.attemptCount < 10).length;
  } catch {
    return 0;
  }
}

/**
 * Get metrics from the last hour
 */
async function getMetrics(): Promise<HealthStatus['metrics']> {
  const counterKey = `${METRICS_KEY}:counters`;
  const counters = await upstashCommand(['HGETALL', counterKey]) as string[] | null;
  
  const stats: Record<string, number> = {};
  if (counters) {
    for (let i = 0; i < counters.length; i += 2) {
      stats[counters[i]] = parseInt(counters[i + 1], 10) || 0;
    }
  }

  const total = stats.total || 0;
  const errors = stats.errors || 0;
  const queueDepth = await getQueueDepth();

  return {
    successRate: total > 0 ? (total - errors) / total : 1,
    avgLatencyMs: total > 0 ? (stats.latencySum || 0) / total : 0,
    requestsLastHour: total,
    errorsLastHour: errors,
    queueDepth,
  };
}

// =============================================================================
// MAIN HEALTH CHECK
// =============================================================================

/**
 * Get comprehensive health status
 */
export async function getHealthStatus(): Promise<HealthStatus> {
  const [database, redis, webhook, metrics] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkWebhook(),
    getMetrics(),
  ]);

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  if (database.status === 'down') {
    status = 'unhealthy';
  } else if (database.status === 'degraded' || redis.status === 'down' || webhook.status === 'degraded') {
    status = 'degraded';
  }
  
  if (metrics.queueDepth > 10) {
    status = status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    version: process.env.npm_package_version || '2.0.0',
    checks: {
      database,
      redis,
      webhook,
    },
    metrics,
  };
}

// =============================================================================
// ALERTING
// =============================================================================

/**
 * Send health alert to Slack
 */
export async function sendHealthAlert(health: HealthStatus): Promise<void> {
  const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  
  if (!slackWebhookUrl) {
    logger.warn('[Health] No Slack webhook configured for alerts');
    return;
  }

  const statusEmoji = {
    healthy: ':white_check_mark:',
    degraded: ':warning:',
    unhealthy: ':x:',
  };

  const message = {
    text: `EONPRO Health Alert: ${health.status.toUpperCase()}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${statusEmoji[health.status]} EONPRO Health: ${health.status.toUpperCase()}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Database:* ${health.checks.database.status}` },
          { type: 'mrkdwn', text: `*Redis:* ${health.checks.redis.status}` },
          { type: 'mrkdwn', text: `*Webhook:* ${health.checks.webhook.status}` },
          { type: 'mrkdwn', text: `*Queue Depth:* ${health.metrics.queueDepth}` },
          { type: 'mrkdwn', text: `*Success Rate:* ${(health.metrics.successRate * 100).toFixed(1)}%` },
          { type: 'mrkdwn', text: `*Avg Latency:* ${health.metrics.avgLatencyMs.toFixed(0)}ms` },
        ],
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `Timestamp: ${health.timestamp}` },
        ],
      },
    ],
  };

  try {
    await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    logger.info('[Health] Sent Slack alert');
  } catch (err) {
    logger.error('[Health] Failed to send Slack alert:', err);
  }
}
