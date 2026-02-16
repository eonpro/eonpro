/**
 * HEALTH MONITOR CRON
 * ===================
 *
 * Runs every 5 minutes via Vercel Cron.
 * Checks database connectivity and alerts via Slack if degraded/unhealthy.
 *
 * This is separate from /api/health (which is user-facing) — this endpoint
 * is purely for automated monitoring with alerting side-effects.
 *
 * @see vercel.json for cron schedule
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, checkDatabaseHealth, getServerlessConfig } from '@/lib/db';
import { logger } from '@/lib/logger';
import { alertHealthDegraded, alertCritical } from '@/lib/observability/slack-alerts';
import { emitCriticalAlert, trackAlertMetric } from '@/lib/observability/sentry-alerts';
import cache from '@/lib/cache/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

interface ServiceCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
}

const HEALTH_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function checkDatabase(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const result = await withTimeout(
      checkDatabaseHealth(prisma),
      HEALTH_TIMEOUT_MS,
      'Database health check'
    );

    return {
      name: 'Database',
      status: result.healthy ? (result.latencyMs > 500 ? 'degraded' : 'healthy') : 'unhealthy',
      latencyMs: Date.now() - start,
      message: result.healthy ? 'Connected' : result.error,
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    if (!cache.isReady()) {
      return {
        name: 'Redis',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Not connected (using in-memory fallback)',
      };
    }

    const testKey = `health-cron-${Date.now()}`;
    await cache.set(testKey, 'ok', { ttl: 10 });
    const value = await cache.get(testKey);
    await cache.delete(testKey);

    return {
      name: 'Redis',
      status: value === 'ok' ? 'healthy' : 'degraded',
      latencyMs: Date.now() - start,
      message: value === 'ok' ? 'Connected' : 'Read/write mismatch',
    };
  } catch (error) {
    return {
      name: 'Redis',
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Run health checks in parallel
    const checks = await Promise.all([checkDatabase(), checkRedis()]);

    // Determine overall status
    const hasUnhealthy = checks.some((c) => c.status === 'unhealthy');
    const hasDegraded = checks.some((c) => c.status === 'degraded');
    const overallStatus = hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy';

    // Track metrics for Sentry
    trackAlertMetric('health.check.status', overallStatus === 'healthy' ? 1 : 0);
    for (const check of checks) {
      trackAlertMetric(`health.check.${check.name.toLowerCase()}.latency`, check.latencyMs);
    }

    // Alert if not healthy
    if (overallStatus !== 'healthy') {
      await alertHealthDegraded({
        status: overallStatus,
        checks: checks.map((c) => ({ name: c.name, status: c.status, message: c.message })),
      });

      // For critical (unhealthy database), also emit to Sentry
      if (hasUnhealthy) {
        const unhealthyChecks = checks.filter((c) => c.status === 'unhealthy');
        emitCriticalAlert('Health monitor: services unhealthy', {
          services: unhealthyChecks.map((c) => c.name).join(', '),
          details: Object.fromEntries(unhealthyChecks.map((c) => [c.name, c.message])),
        });
      }

      logger.warn('[HealthMonitor] Platform not healthy', {
        status: overallStatus,
        checks: checks.map((c) => ({ name: c.name, status: c.status })),
      });
    }

    const config = getServerlessConfig();

    return NextResponse.json(
      {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        checks,
        config: {
          connectionLimit: config.connectionLimit,
          useRdsProxy: config.useRdsProxy,
        },
      },
      {
        status: overallStatus === 'unhealthy' ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[HealthMonitor] Cron failed', error instanceof Error ? error : undefined);

    // Alert on total failure
    await alertCritical('Health monitor cron failed', message, { error: message });

    return NextResponse.json(
      { status: 'unhealthy', error: message, timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
