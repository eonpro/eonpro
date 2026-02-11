/**
 * Database Fingerprint — Enterprise Incident Diagnostics
 * =====================================================
 *
 * GET /api/diagnostics/db-fingerprint
 * Super-admin only. Returns definitive proof of which database this surface uses.
 *
 * Use to compare app.eonpro.io vs ot.eonpro.io and detect env/db drift.
 *
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma } from '@/lib/db';
import { buildServerlessConnectionUrl } from '@/lib/database/serverless-pool';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { getDatasourceHash } from '@/lib/diagnostics/db-fingerprint';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function safeParseDbUrl(url: string): { hostname?: string; dbName?: string } {
  try {
    const u = new URL(url.replace(/^postgresql:/, 'postgres:'));
    return { hostname: u.hostname, dbName: u.pathname?.slice(1) || undefined };
  } catch {
    return {};
  }
}

export const GET = withSuperAdminAuth(async (request: NextRequest) => {
  const host = request.headers.get('host') || request.headers.get('x-forwarded-host') || '';
  let connectionUrl: string;
  try {
    connectionUrl = buildServerlessConnectionUrl();
  } catch {
    connectionUrl = process.env.DATABASE_URL || '';
  }
  const parsed = safeParseDbUrl(connectionUrl);
  const datasourceHash = getDatasourceHash();

  let dbIdentity: Record<string, unknown> = {};
  let isReadReplica = false;
  let migrations: Array<{ migration_name: string; finished_at: string | null }> = [];

  try {
    const [identityRow, recoveryRow] = await Promise.all([
      basePrisma.$queryRaw<
        Array<{
          current_database: string;
          inet_server_addr: string | null;
          inet_server_port: number | null;
          version: string;
        }>
      >`SELECT current_database() as "current_database", inet_server_addr()::text as "inet_server_addr", inet_server_port() as "inet_server_port", version()`,
      basePrisma.$queryRaw<Array<{ pg_is_in_recovery: boolean }>>`SELECT pg_is_in_recovery()`,
    ]);
    dbIdentity = identityRow?.[0] ?? {};
    isReadReplica = recoveryRow?.[0]?.pg_is_in_recovery ?? false;
  } catch (e) {
    dbIdentity = { error: (e as Error).message };
  }

  try {
    const rows = await basePrisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5`;
    migrations = rows.map((r) => ({
      migration_name: r.migration_name,
      finished_at: r.finished_at?.toISOString() ?? null,
    }));
  } catch {
    migrations = [];
  }

  return NextResponse.json(
    {
      host,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
      datasource: {
        hash: datasourceHash,
        hostname: parsed.hostname ?? null,
        dbName: parsed.dbName ?? null,
      },
      dbIdentity,
      is_read_replica: isReadReplica,
      migrations,
      serverTimestamp: new Date().toISOString(),
      buildId: process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_BUILD_ID || 'local',
      gitSha: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || 'unknown',
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  );
});
