import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Webhook Monitoring Service
 * 
 * Tracks webhook performance, detects issues, and can trigger alerts.
 */

export interface WebhookMetrics {
  webhookName: string;
  successCount: number;
  errorCount: number;
  lastSuccess: Date | null;
  lastError: Date | null;
  avgResponseTime: number | null;
  successRate: number;
}

export interface WebhookAlert {
  type: 'error_spike' | 'no_activity' | 'high_latency' | 'auth_failure';
  severity: 'warning' | 'critical';
  message: string;
  webhookName: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// In-memory metrics store (reset on deploy, but good for real-time monitoring)
const metricsStore = new Map<string, {
  successCount: number;
  errorCount: number;
  lastSuccess: Date | null;
  lastError: Date | null;
  responseTimes: number[];
  errors: { timestamp: Date; message: string }[];
}>();

// Alert callbacks
const alertCallbacks: ((alert: WebhookAlert) => Promise<void>)[] = [];

/**
 * Initialize metrics for a webhook
 */
function initMetrics(webhookName: string) {
  if (!metricsStore.has(webhookName)) {
    metricsStore.set(webhookName, {
      successCount: 0,
      errorCount: 0,
      lastSuccess: null,
      lastError: null,
      responseTimes: [],
      errors: [],
    });
  }
  return metricsStore.get(webhookName)!;
}

/**
 * Record a successful webhook execution
 */
export function recordSuccess(webhookName: string, responseTimeMs: number) {
  const metrics = initMetrics(webhookName);
  metrics.successCount++;
  metrics.lastSuccess = new Date();
  metrics.responseTimes.push(responseTimeMs);
  
  // Keep only last 100 response times
  if (metrics.responseTimes.length > 100) {
    metrics.responseTimes.shift();
  }
  
  logger.debug(`[WEBHOOK MONITOR] Success recorded for ${webhookName}`, {
    responseTime: responseTimeMs,
    totalSuccess: metrics.successCount,
  });
}

/**
 * Record a webhook error
 */
export async function recordError(
  webhookName: string, 
  error: string, 
  metadata?: Record<string, unknown>
) {
  const metrics = initMetrics(webhookName);
  metrics.errorCount++;
  metrics.lastError = new Date();
  metrics.errors.push({ timestamp: new Date(), message: error });
  
  // Keep only last 50 errors
  if (metrics.errors.length > 50) {
    metrics.errors.shift();
  }
  
  logger.warn(`[WEBHOOK MONITOR] Error recorded for ${webhookName}`, {
    error,
    totalErrors: metrics.errorCount,
    metadata,
  });
  
  // Check for error spike (more than 5 errors in last 10 minutes)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentErrors = metrics.errors.filter(e => e.timestamp > tenMinutesAgo);
  
  if (recentErrors.length >= 5) {
    await triggerAlert({
      type: 'error_spike',
      severity: 'critical',
      message: `${recentErrors.length} errors in the last 10 minutes for ${webhookName}`,
      webhookName,
      timestamp: new Date(),
      metadata: {
        recentErrors: recentErrors.map(e => e.message),
        ...metadata,
      },
    });
  }
  
  // Log to database for persistence
  try {
    await prisma.auditLog.create({
      data: {
        action: 'WEBHOOK_ERROR',
        resource: 'Webhook',
        resourceId: 0,
        userId: 0,
        details: {
          webhookName,
          error,
          metadata,
          timestamp: new Date().toISOString(),
        },
        ipAddress: 'system',
      },
    });
  } catch (err) {
    logger.error('[WEBHOOK MONITOR] Failed to log error to database:', err);
  }
}

/**
 * Record an authentication failure
 */
export async function recordAuthFailure(
  webhookName: string, 
  ipAddress: string,
  providedHeader?: string
) {
  await recordError(webhookName, 'Authentication failed', { 
    ipAddress, 
    headerProvided: !!providedHeader 
  });
  
  await triggerAlert({
    type: 'auth_failure',
    severity: 'warning',
    message: `Authentication failure for ${webhookName} from ${ipAddress}`,
    webhookName,
    timestamp: new Date(),
    metadata: { ipAddress },
  });
}

/**
 * Get metrics for a webhook
 */
export function getMetrics(webhookName: string): WebhookMetrics | null {
  const metrics = metricsStore.get(webhookName);
  if (!metrics) return null;
  
  const total = metrics.successCount + metrics.errorCount;
  const avgResponseTime = metrics.responseTimes.length > 0
    ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
    : null;
  
  return {
    webhookName,
    successCount: metrics.successCount,
    errorCount: metrics.errorCount,
    lastSuccess: metrics.lastSuccess,
    lastError: metrics.lastError,
    avgResponseTime,
    successRate: total > 0 ? (metrics.successCount / total) * 100 : 100,
  };
}

/**
 * Get all webhook metrics
 */
export function getAllMetrics(): WebhookMetrics[] {
  const allMetrics: WebhookMetrics[] = [];
  
  for (const [name] of metricsStore) {
    const metrics = getMetrics(name);
    if (metrics) allMetrics.push(metrics);
  }
  
  return allMetrics;
}

/**
 * Trigger an alert
 */
async function triggerAlert(alert: WebhookAlert) {
  logger.warn(`[WEBHOOK ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`, {
    type: alert.type,
    webhookName: alert.webhookName,
    metadata: alert.metadata,
  });
  
  // Log alert to database
  try {
    await prisma.auditLog.create({
      data: {
        action: 'WEBHOOK_ALERT',
        resource: 'Webhook',
        resourceId: 0,
        userId: 0,
        details: alert,
        ipAddress: 'system',
      },
    });
  } catch (err) {
    logger.error('[WEBHOOK MONITOR] Failed to log alert:', err);
  }
  
  // Call registered alert handlers
  for (const callback of alertCallbacks) {
    try {
      await callback(alert);
    } catch (err) {
      logger.error('[WEBHOOK MONITOR] Alert callback failed:', err);
    }
  }
}

/**
 * Register an alert callback (e.g., for Slack, email notifications)
 */
export function onAlert(callback: (alert: WebhookAlert) => Promise<void>) {
  alertCallbacks.push(callback);
}

/**
 * Check for stale webhooks (no activity in X hours)
 */
export async function checkStaleWebhooks(hoursThreshold = 24): Promise<WebhookAlert[]> {
  const alerts: WebhookAlert[] = [];
  const threshold = new Date(Date.now() - hoursThreshold * 60 * 60 * 1000);
  
  // Check database for last webhook activity
  const lastIntake = await prisma.auditLog.findFirst({
    where: {
      action: { in: ['PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED'] },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  if (!lastIntake || lastIntake.createdAt < threshold) {
    const alert: WebhookAlert = {
      type: 'no_activity',
      severity: 'warning',
      message: `No webhook activity for weightlossintake in the last ${hoursThreshold} hours`,
      webhookName: 'weightlossintake',
      timestamp: new Date(),
      metadata: {
        lastActivity: lastIntake?.createdAt?.toISOString() || 'never',
        threshold: `${hoursThreshold} hours`,
      },
    };
    alerts.push(alert);
    await triggerAlert(alert);
  }
  
  return alerts;
}

/**
 * Get webhook health summary for monitoring dashboards
 */
export async function getHealthSummary() {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  const [successCount, errorCount, lastSuccess] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: { in: ['PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED'] },
        createdAt: { gte: last24h },
      },
    }),
    prisma.auditLog.count({
      where: {
        action: 'WEBHOOK_ERROR',
        createdAt: { gte: last24h },
      },
    }).catch(() => 0),
    prisma.auditLog.findFirst({
      where: {
        action: { in: ['PATIENT_INTAKE_RECEIVED', 'PARTIAL_INTAKE_RECEIVED'] },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  
  const total = successCount + errorCount;
  const successRate = total > 0 ? (successCount / total) * 100 : 100;
  
  return {
    status: successRate >= 95 ? 'healthy' : successRate >= 50 ? 'degraded' : 'down',
    last24h: {
      success: successCount,
      errors: errorCount,
      total,
      successRate: `${successRate.toFixed(1)}%`,
    },
    lastSuccess: lastSuccess?.createdAt?.toISOString() || null,
    inMemoryMetrics: getAllMetrics(),
  };
}
