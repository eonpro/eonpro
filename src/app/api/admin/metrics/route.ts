/**
 * Admin Metrics Dashboard API
 *
 * Provides detailed metrics for the admin dashboard.
 *
 * GET /api/admin/metrics - Get all metrics
 * GET /api/admin/metrics?type=webhook - Get webhook metrics only
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { getHealthStatus } from '@/lib/monitoring/healthMonitor';
import { getQueueStats } from '@/lib/queue/deadLetterQueue';
import { executeDbRead } from '@/lib/database/executeDb';
import { withReadFallback } from '@/lib/database/read-replica';

const ADMIN_METRICS_CACHE_TTL_MS = parseInt(process.env.ADMIN_METRICS_CACHE_TTL_MS || '15000', 10);
const metricsResponseCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getCachedMetrics(key: string): unknown | null {
  const cached = metricsResponseCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    metricsResponseCache.delete(key);
    return null;
  }
  return cached.payload;
}

function setCachedMetrics(key: string, payload: unknown): void {
  if (ADMIN_METRICS_CACHE_TTL_MS <= 0) return;
  metricsResponseCache.set(key, {
    expiresAt: Date.now() + ADMIN_METRICS_CACHE_TTL_MS,
    payload,
  });
}

async function handleGet(req: NextRequest, user: AuthUser) {
  const type = req.nextUrl.searchParams.get('type');
  const cacheKey = `admin-metrics:${type || 'all'}`;

  const cached = getCachedMetrics(cacheKey);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const [health, dlqStats] = await Promise.all([
      getHealthStatus(),
      getQueueStats().catch((err) => {
        logger.warn('[Metrics] Failed to get DLQ stats', { error: err instanceof Error ? err.message : String(err) });
        return null;
      }),
    ]);

    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const metricsReadResult = await executeDbRead(
      () =>
        withReadFallback(async (db) => {
          const [
            patientsLastHour,
            patientsLastDay,
            documentsLastHour,
            documentsLastDay,
            recentAuditLogs,
          ] = await Promise.all([
            db.patient.count({
              where: { createdAt: { gte: hourAgo } },
            }),
            db.patient.count({
              where: { createdAt: { gte: dayAgo } },
            }),
            db.patientDocument.count({
              where: { createdAt: { gte: hourAgo } },
            }),
            db.patientDocument.count({
              where: { createdAt: { gte: dayAgo } },
            }),
            db.auditLog.findMany({
              where: {
                action: { contains: 'WEBHOOK' },
                createdAt: { gte: hourAgo },
              },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                action: true,
                createdAt: true,
                details: true,
              },
            }),
          ]);

          return {
            patientsLastHour,
            patientsLastDay,
            documentsLastHour,
            documentsLastDay,
            recentAuditLogs,
          };
        }),
      'adminMetrics:aggregates',
    );
    if (!metricsReadResult.success || !metricsReadResult.data) {
      throw new Error(metricsReadResult.error?.message ?? 'Failed to load admin metrics');
    }
    const {
      patientsLastHour,
      patientsLastDay,
      documentsLastHour,
      documentsLastDay,
      recentAuditLogs,
    } = metricsReadResult.data;

    // Parse webhook sources from audit logs
    const webhookSources: Record<string, number> = {};
    for (const log of recentAuditLogs) {
      const details = log.details as Record<string, unknown> | null;
      const source = (details?.source as string) || 'unknown';
      webhookSources[source] = (webhookSources[source] || 0) + 1;
    }

    const metrics = {
      timestamp: new Date().toISOString(),
      health: {
        status: health.status,
        uptime: health.uptime,
        version: health.version,
      },
      services: health.checks,
      performance: {
        successRate: health.metrics.successRate,
        avgLatencyMs: health.metrics.avgLatencyMs,
        requestsLastHour: health.metrics.requestsLastHour,
        errorsLastHour: health.metrics.errorsLastHour,
      },
      queue: dlqStats
        ? {
            pending: dlqStats.pending,
            exhausted: dlqStats.exhausted,
            totalQueued: dlqStats.totalQueued,
            totalProcessed: dlqStats.totalProcessed,
            lastProcessedAt: dlqStats.lastProcessedAt,
          }
        : null,
      activity: {
        patientsLastHour,
        patientsLastDay,
        documentsLastHour,
        documentsLastDay,
        webhooksBySource: webhookSources,
      },
      recentWebhooks: recentAuditLogs.map(
        (log: { id: number; action: string; timestamp?: Date; details: unknown }) => ({
          id: log.id,
          action: log.action,
          timestamp: log.timestamp,
          source: ((log.details as Record<string, unknown>)?.source as string) || 'unknown',
          success: ((log.details as Record<string, unknown>)?.success as boolean) ?? true,
        })
      ),
    };

    if (type === 'webhook') {
      const webhookPayload = {
        performance: metrics.performance,
        webhooksBySource: metrics.activity.webhooksBySource,
        recentWebhooks: metrics.recentWebhooks,
      };
      setCachedMetrics(cacheKey, webhookPayload);
      return NextResponse.json(webhookPayload);
    }

    setCachedMetrics(cacheKey, metrics);
    return NextResponse.json(metrics);
  } catch (err) {
    logger.error('[Metrics] Failed to get metrics:', err);
    return NextResponse.json(
      {
        error: 'Failed to retrieve metrics',
        details: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
