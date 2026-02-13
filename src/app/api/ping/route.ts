/**
 * Version Ping — Enterprise Domain Routing Verification
 * ======================================================
 *
 * GET /api/ping
 * - Public (no auth, no DB, no external deps)
 * - Returns: gitSha, buildId, host, pathname, timestamp
 * - Use to verify ALL subdomains (app, ot, eonmeds, wellmedr) hit the SAME deployment
 *
 * If ot.eonpro.io returns 404 HTML instead of this JSON → domain points to different project/deployment.
 *
 * @see docs/ENTERPRISE_DOMAIN_ROUTING_INCIDENT.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma, prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  let pathname = '/api/ping';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // fallback
  }

  // Optional DB diagnostic (add ?db=true to test)
  let dbStatus: Record<string, unknown> = {};
  const url = new URL(request.url);
  if (url.searchParams.get('db') === 'true') {
    const start = Date.now();
    try {
      await basePrisma.$queryRaw`SELECT 1 as ok`;
      const clinicCount = await basePrisma.clinic.count();
      dbStatus = {
        connected: true,
        latencyMs: Date.now() - start,
        clinicCount,
      };
    } catch (err: unknown) {
      dbStatus = {
        connected: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
        errorName: err instanceof Error ? err.constructor.name : 'Unknown',
      };
    }
  }

  // Simulate authenticated flow with clinic context (add ?clinicTest=ID)
  const clinicTestId = url.searchParams.get('clinicTest');
  if (clinicTestId) {
    const cid = parseInt(clinicTestId, 10);
    if (!isNaN(cid)) {
      const tests: Record<string, unknown> = {};
      // Test within runWithClinicContext (like withAuth does)
      try {
        await runWithClinicContext(cid, async () => {
          // Test 1: clinic-filtered user query (what /api/user/clinics does)
          try {
            const userCount = await prisma.user.count();
            tests.userCount = userCount;
          } catch (err: unknown) {
            tests.userCount = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown' };
          }
          // Test 2: clinic-filtered patient query
          try {
            const patientCount = await prisma.patient.count();
            tests.patientCount = patientCount;
          } catch (err: unknown) {
            tests.patientCount = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown', stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined };
          }
          // Test 3: clinic-filtered notification query
          try {
            const notifCount = await prisma.notification.count();
            tests.notificationCount = notifCount;
          } catch (err: unknown) {
            tests.notificationCount = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown' };
          }
          // Test 4: clinic-filtered internal message query
          try {
            const msgCount = await prisma.internalMessage.count();
            tests.messageCount = msgCount;
          } catch (err: unknown) {
            tests.messageCount = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown' };
          }
          // Test 5: basePrisma clinic lookup
          try {
            const clinic = await basePrisma.clinic.findUnique({ where: { id: cid }, select: { id: true, name: true, status: true } });
            tests.clinicLookup = clinic || 'NOT_FOUND';
          } catch (err: unknown) {
            tests.clinicLookup = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown' };
          }
        });
      } catch (err: unknown) {
        tests._contextError = { error: err instanceof Error ? err.message : String(err), name: err instanceof Error ? err.constructor.name : 'Unknown', stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined };
      }
      dbStatus = { ...dbStatus, clinicContextTests: tests };
    }
  }

  const payload: Record<string, unknown> = {
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_BUILD_ID || process.env.NEXT_BUILD_ID || 'local',
    host,
    pathname,
    timestamp: new Date().toISOString(),
  };

  if (Object.keys(dbStatus).length > 0) {
    payload.db = dbStatus;
  }

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

/**
 * POST /api/ping - Authenticated diagnostic
 * Tests the full auth → DB query flow to diagnose 500 errors
 */
async function authedHandler(req: NextRequest, user: AuthUser) {
  const results: Record<string, unknown> = {
    user: { id: user.id, role: user.role, clinicId: user.clinicId },
    timestamp: new Date().toISOString(),
    tests: {},
  };

  // Test 1: basePrisma raw query
  try {
    await basePrisma.$queryRaw`SELECT 1 as ok`;
    (results.tests as Record<string, unknown>).rawQuery = 'OK';
  } catch (err: unknown) {
    (results.tests as Record<string, unknown>).rawQuery = {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : 'Unknown',
    };
  }

  // Test 2: basePrisma.clinic.findUnique (what /api/clinic/current does)
  if (user.clinicId) {
    try {
      const clinic = await basePrisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { id: true, name: true, status: true },
      });
      (results.tests as Record<string, unknown>).clinicLookup = clinic
        ? { id: clinic.id, name: clinic.name, status: clinic.status }
        : 'NOT_FOUND';
    } catch (err: unknown) {
      (results.tests as Record<string, unknown>).clinicLookup = {
        error: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.constructor.name : 'Unknown',
      };
    }
  }

  // Test 3: prisma.user.findUnique with clinic context (what /api/user/clinics does)
  try {
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, clinicId: true, role: true },
    });
    (results.tests as Record<string, unknown>).userLookup = userData || 'NOT_FOUND';
  } catch (err: unknown) {
    (results.tests as Record<string, unknown>).userLookup = {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : 'Unknown',
      stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5) : undefined,
    };
  }

  // Test 4: prisma.patient.count (what health check tries)
  try {
    const count = await prisma.patient.count();
    (results.tests as Record<string, unknown>).patientCount = count;
  } catch (err: unknown) {
    (results.tests as Record<string, unknown>).patientCount = {
      error: err instanceof Error ? err.message : String(err),
      name: err instanceof Error ? err.constructor.name : 'Unknown',
    };
  }

  return NextResponse.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export const POST = withAuth(authedHandler);
