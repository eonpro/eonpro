/**
 * Version Ping — Enterprise Domain Routing Verification
 * ======================================================
 *
 * GET /api/_health/version
 * - Public (no auth, no DB, no external deps)
 * - Returns: gitSha, buildId, host, pathname, timestamp
 * - Use to verify ALL subdomains (app, ot, eonmeds, wellmedr) hit the SAME deployment
 *
 * If ot.eonpro.io returns 404 HTML instead of this JSON → domain points to different project/deployment.
 *
 * @see docs/ENTERPRISE_DOMAIN_ROUTING_INCIDENT.md
 */

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  let pathname = '/api/_health/version';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // fallback
  }

  const payload = {
    gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_BUILD_ID || process.env.NEXT_BUILD_ID || 'local',
    host,
    pathname,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(payload, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
