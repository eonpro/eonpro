/**
 * Version Endpoint — Tenant Drift Diagnosis
 * =========================================
 *
 * Returns build/commit info and resolved clinic context.
 * Use to verify all subdomains hit the same deployment.
 *
 * GET /api/version
 * - Public (no auth required) for quick verification
 * - Returns: buildId, commit, timestamp, and when possible: clinicId, subdomain from Host
 *
 * @see docs/ENTERPRISE_TENANT_DRIFT_DIAGNOSIS.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { withApiHandler } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function versionHandler(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const subdomain = extractSubdomain(host);

  const version = {
    buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_BUILD_ID || 'local',
    commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    host,
    subdomain: subdomain || null,
    // clinicId would require DB lookup; omit to keep endpoint fast and public
  };

  return NextResponse.json(version, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export const GET = withApiHandler(versionHandler);

function extractSubdomain(host: string): string | null {
  const normalized = host.split(':')[0].toLowerCase();
  const skip = ['www', 'app', 'api', 'admin', 'staging'];
  const parts = normalized.split('.');
  if (normalized.includes('localhost')) {
    if (parts.length >= 2 && parts[0] !== 'localhost') return parts[0];
    return null;
  }
  if (normalized.endsWith('.eonpro.io') && parts.length >= 3 && !skip.includes(parts[0])) {
    return parts[0];
  }
  return null;
}
