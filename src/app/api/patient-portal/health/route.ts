/**
 * PATIENT PORTAL HEALTH CHECK
 * ============================
 * Dedicated health endpoint for patient portal reliability monitoring.
 * Probes every dependency the patient portal needs to function.
 *
 * GET /api/patient-portal/health          — Public basic status
 * GET /api/patient-portal/health?full=true — Detailed (super_admin only)
 *
 * @module api/patient-portal/health
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, checkDatabaseHealth } from '@/lib/db';
import { SignJWT, jwtVerify } from 'jose';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';
import {
  type ProbeResult,
  type ProbeStatus,
  type PortalHealthReport,
  getMetricsSnapshot,
  getIncidents,
  getLastStatus,
} from '@/lib/monitoring/portal-metrics';

export const dynamic = 'force-dynamic';

const PROBE_TIMEOUT_MS = 3000;
const startTime = Date.now();

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

async function probeDatabase(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const result = await withTimeout(
      checkDatabaseHealth(prisma),
      PROBE_TIMEOUT_MS,
      'Database probe'
    );
    const latencyMs = Date.now() - start;
    if (!result.healthy) {
      return { name: 'Database', status: 'unhealthy', latencyMs, message: result.error || 'Connection failed' };
    }
    return {
      name: 'Database',
      status: latencyMs > 500 ? 'degraded' : 'healthy',
      latencyMs,
      message: latencyMs > 500 ? `Slow response (${latencyMs}ms)` : 'Connected',
    };
  } catch (err) {
    return {
      name: 'Database',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

async function probePatientTable(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await withTimeout(
      prisma.patient.findFirst({ select: { id: true }, take: 1 }),
      PROBE_TIMEOUT_MS,
      'Patient table probe'
    );
    return { name: 'PatientTable', status: 'healthy', latencyMs: Date.now() - start, message: 'Accessible' };
  } catch (err) {
    return {
      name: 'PatientTable',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Query failed',
    };
  }
}

async function probeAuth(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const testPayload = { id: 0, role: 'healthcheck', ts: Date.now() };
    const token = await new SignJWT(testPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1m')
      .sign(JWT_SECRET);

    await jwtVerify(token, JWT_SECRET);
    return { name: 'Auth', status: 'healthy', latencyMs: Date.now() - start, message: 'JWT sign/verify OK' };
  } catch (err) {
    return {
      name: 'Auth',
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'JWT round-trip failed',
    };
  }
}

async function probeSessionStore(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    if (!cache.isReady()) {
      return {
        name: 'SessionStore',
        status: 'degraded',
        latencyMs: Date.now() - start,
        message: 'Redis unavailable, using in-memory fallback',
      };
    }

    const testKey = `portal-health-${Date.now()}`;
    await cache.set(testKey, 'ok', { ttl: 10 });
    const val = await cache.get(testKey);
    await cache.delete(testKey);

    if (val !== 'ok') {
      return { name: 'SessionStore', status: 'degraded', latencyMs: Date.now() - start, message: 'Read/write mismatch' };
    }
    return { name: 'SessionStore', status: 'healthy', latencyMs: Date.now() - start, message: 'Redis OK' };
  } catch (err) {
    return {
      name: 'SessionStore',
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Redis check failed',
    };
  }
}

async function probeBranding(): Promise<ProbeResult> {
  const start = Date.now();
  try {
    await withTimeout(
      prisma.clinic.findFirst({ select: { id: true }, take: 1 }),
      PROBE_TIMEOUT_MS,
      'Branding probe'
    );
    return { name: 'Branding', status: 'healthy', latencyMs: Date.now() - start, message: 'Clinic table accessible' };
  } catch (err) {
    return {
      name: 'Branding',
      status: 'degraded',
      latencyMs: Date.now() - start,
      message: err instanceof Error ? err.message : 'Clinic query failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function overallStatus(probes: ProbeResult[]): ProbeStatus {
  if (probes.some((p) => p.status === 'unhealthy')) return 'unhealthy';
  if (probes.some((p) => p.status === 'degraded')) return 'degraded';
  return 'healthy';
}

export async function GET(req: NextRequest) {
  const checkStart = Date.now();

  try {
    const probes = await Promise.all([
      probeDatabase(),
      probePatientTable(),
      probeAuth(),
      probeSessionStore(),
      probeBranding(),
    ]);

    const status = overallStatus(probes);
    const durationMs = Date.now() - checkStart;

    const isFull = req.nextUrl.searchParams.get('full') === 'true';

    // Basic public response
    if (!isFull) {
      return NextResponse.json(
        {
          status,
          timestamp: new Date().toISOString(),
          uptimeMs: Date.now() - startTime,
          durationMs,
          probes: probes.map((p) => ({ name: p.name, status: p.status, latencyMs: p.latencyMs })),
        },
        {
          status: status === 'unhealthy' ? 503 : 200,
          headers: { 'Cache-Control': 'no-store' },
        }
      );
    }

    // Full response requires super_admin auth
    const authResult = await verifyAuth(req);
    if (!authResult || authResult.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const report: PortalHealthReport = {
      status,
      timestamp: new Date().toISOString(),
      durationMs,
      probes,
      metrics: getMetricsSnapshot(),
    };

    return NextResponse.json(
      {
        ...report,
        uptimeMs: Date.now() - startTime,
        incidents: getIncidents(),
        lastKnownStatus: getLastStatus(),
      },
      {
        status: status === 'unhealthy' ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (err) {
    logger.error('[PortalHealth] Health check failed', err instanceof Error ? err : new Error(String(err)));
    return NextResponse.json(
      { status: 'unhealthy', error: 'Health check execution failed', timestamp: new Date().toISOString() },
      { status: 503 }
    );
  }
}
