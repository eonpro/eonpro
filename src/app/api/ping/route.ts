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
import { basePrisma } from '@/lib/db';

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
