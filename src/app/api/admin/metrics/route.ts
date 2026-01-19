/**
 * Admin Metrics Dashboard API
 * 
 * Provides detailed metrics for the admin dashboard.
 * 
 * GET /api/admin/metrics - Get all metrics
 * GET /api/admin/metrics?type=webhook - Get webhook metrics only
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { getHealthStatus } from '@/lib/monitoring/healthMonitor';
import { getQueueStats } from '@/lib/queue/deadLetterQueue';

export async function GET(req: NextRequest) {
  // Check authentication
  const auth = await verifyAuth(req);
  if (!auth.authenticated || !auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check for admin role
  if (auth.user.role !== 'ADMIN' && auth.user.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type');

  try {
    const [health, dlqStats] = await Promise.all([
      getHealthStatus(),
      getQueueStats().catch(() => null),
    ]);

    // Get recent webhook activity from database
    const { prisma } = await import('@/lib/db');
    
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      patientsLastHour,
      patientsLastDay,
      documentsLastHour,
      documentsLastDay,
      recentAuditLogs,
    ] = await Promise.all([
      prisma.patient.count({
        where: { createdAt: { gte: hourAgo } },
      }),
      prisma.patient.count({
        where: { createdAt: { gte: dayAgo } },
      }),
      prisma.patientDocument.count({
        where: { createdAt: { gte: hourAgo } },
      }),
      prisma.patientDocument.count({
        where: { createdAt: { gte: dayAgo } },
      }),
      prisma.auditLog.findMany({
        where: {
          action: { contains: 'WEBHOOK' },
          timestamp: { gte: hourAgo },
        },
        orderBy: { timestamp: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          timestamp: true,
          details: true,
        },
      }),
    ]);

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
      queue: dlqStats ? {
        pending: dlqStats.pending,
        exhausted: dlqStats.exhausted,
        totalQueued: dlqStats.totalQueued,
        totalProcessed: dlqStats.totalProcessed,
        lastProcessedAt: dlqStats.lastProcessedAt,
      } : null,
      activity: {
        patientsLastHour,
        patientsLastDay,
        documentsLastHour,
        documentsLastDay,
        webhooksBySource: webhookSources,
      },
      recentWebhooks: recentAuditLogs.map(log => ({
        id: log.id,
        action: log.action,
        timestamp: log.timestamp,
        source: ((log.details as Record<string, unknown>)?.source as string) || 'unknown',
        success: ((log.details as Record<string, unknown>)?.success as boolean) ?? true,
      })),
    };

    if (type === 'webhook') {
      return NextResponse.json({
        performance: metrics.performance,
        webhooksBySource: metrics.activity.webhooksBySource,
        recentWebhooks: metrics.recentWebhooks,
      });
    }

    return NextResponse.json(metrics);
  } catch (err) {
    logger.error('[Metrics] Failed to get metrics:', err);
    return NextResponse.json({
      error: 'Failed to retrieve metrics',
      details: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
