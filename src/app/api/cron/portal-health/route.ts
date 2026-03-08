/**
 * PATIENT PORTAL HEALTH MONITOR CRON
 * ====================================
 * Runs every 5 minutes via Vercel Cron. Probes all patient portal
 * dependencies and alerts Slack when the portal degrades or recovers.
 *
 * @see vercel.json for schedule
 * @module api/cron/portal-health
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, checkDatabaseHealth, withoutClinicFilter } from '@/lib/db';
import { SignJWT, jwtVerify } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';
import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';
import { emitCriticalAlert, trackAlertMetric } from '@/lib/observability/sentry-alerts';
import { verifyCronAuth } from '@/lib/cron/tenant-isolation';
import {
  type ProbeResult,
  type ProbeStatus,
  recordStatusTransition,
  getLastStatus,
} from '@/lib/monitoring/portal-metrics';
import { sendPortalAlert } from '@/lib/monitoring/portal-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROBE_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function probeDatabase(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const result = await withTimeout(checkDatabaseHealth(prisma), PROBE_TIMEOUT_MS, 'DB');
    const latencyMs = Date.now() - start;
    if (!result.healthy) {
      return { name: 'Database', status: 'unhealthy', latencyMs, message: result.error || 'Connection failed' };
    }
    return { name: 'Database', status: latencyMs > 500 ? 'degraded' : 'healthy', latencyMs };
  } catch (err) {
    return { name: 'Database', status: 'unhealthy', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Unknown' };
  }
}

async function probePatientTable(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await withTimeout(
      withoutClinicFilter(() => prisma.patient.findFirst({ select: { id: true }, take: 1 })),
      PROBE_TIMEOUT_MS,
      'Patient'
    );
    return { name: 'PatientTable', status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'PatientTable', status: 'unhealthy', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function probeAuth(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const token = await new SignJWT({ id: 0, role: 'healthcheck' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(JWT_SECRET);
    await jwtVerify(token, JWT_SECRET);
    return { name: 'Auth', status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'Auth', status: 'unhealthy', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function probeSessionStore(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    if (!cache.isReady()) {
      return { name: 'SessionStore', status: 'degraded', latencyMs: Date.now() - start, message: 'Redis unavailable (in-memory fallback)' };
    }
    const key = `portal-cron-${Date.now()}`;
    await cache.set(key, 'ok', { ttl: 10 });
    const val = await cache.get(key);
    await cache.delete(key);
    return { name: 'SessionStore', status: val === 'ok' ? 'healthy' : 'degraded', latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'SessionStore', status: 'degraded', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

async function probeBranding(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await withTimeout(prisma.clinic.findFirst({ select: { id: true }, take: 1 }), PROBE_TIMEOUT_MS, 'Branding');
    return { name: 'Branding', status: 'healthy', latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'Branding', status: 'degraded', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Failed' };
  }
}

function overallStatus(probes: ProbeResult[]): ProbeStatus {
  if (probes.some((p) => p.status === 'unhealthy')) return 'unhealthy';
  if (probes.some((p) => p.status === 'degraded')) return 'degraded';
  return 'healthy';
}

export async function GET(_request: NextRequest) {
  if (!verifyCronAuth(_request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const start = Date.now();

  try {
    const probes = await Promise.all([
      probeDatabase(),
      probePatientTable(),
      probeAuth(),
      probeSessionStore(),
      probeBranding(),
    ]);

    const status = overallStatus(probes);
    const durationMs = Date.now() - start;

    // Track Sentry metrics
    trackAlertMetric('portal.health.status', status === 'healthy' ? 1 : 0);
    for (const p of probes) {
      trackAlertMetric(`portal.health.${p.name.toLowerCase()}.latency`, p.latencyMs);
    }

    // Record status transition (returns true if changed)
    const changed = recordStatusTransition(status, probes);

    // Alert on degradation or recovery
    if (status !== 'healthy' || (changed && status === 'healthy')) {
      const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/portal-health`
        : undefined;

      await sendPortalAlert({ status, probes, durationMs, dashboardUrl });
    }

    // Emit Sentry critical for unhealthy
    if (status === 'unhealthy') {
      const failed = probes.filter((p) => p.status === 'unhealthy');
      emitCriticalAlert('Patient Portal UNHEALTHY', {
        probes: failed.map((p) => `${p.name}: ${p.message}`).join(', '),
        durationMs,
      });
    }

    if (status !== 'healthy') {
      logger.warn('[PortalHealthCron] Portal not healthy', {
        status,
        probes: probes.map((p) => ({ name: p.name, status: p.status })),
      });
    }

    return NextResponse.json(
      { status, timestamp: new Date().toISOString(), durationMs, probes, changed },
      { status: status === 'unhealthy' ? 503 : 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    logger.error('[PortalHealthCron] Cron failed', err instanceof Error ? err : new Error(String(err)));

    await sendPortalAlert({
      status: 'unhealthy',
      probes: [{ name: 'CronExecution', status: 'unhealthy', latencyMs: Date.now() - start, message: err instanceof Error ? err.message : 'Unknown' }],
      durationMs: Date.now() - start,
    });

    return NextResponse.json(
      { status: 'unhealthy', error: 'Cron execution failed', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
