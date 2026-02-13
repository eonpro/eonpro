/**
 * DATABASE HEALTH INCIDENT DIAGNOSTICS
 * =====================================
 *
 * Temporary endpoint for enterprise database health incident response.
 *
 * GET /api/_health/db-check
 *
 * Use when /api/health reports:
 *   - status: unhealthy
 *   - database: unhealthy
 *   - responseTime ~4000ms
 *
 * Diagnoses:
 * - Prisma pool exhaustion (P2024)
 * - RDS connection limit exceeded
 * - Read replica timeout (P1001/P1002)
 * - Long-running query saturation
 * - Wrong DATABASE_URL host
 * - Missing RDS Proxy / PgBouncer
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getServerlessConfig } from '@/lib/database/serverless-pool';
import { logger } from '@/lib/logger';

const DB_CHECK_TIMEOUT_MS = 5000;

function parseDatabaseUrl(): {
  host: string;
  port: number;
  connection_limit: string;
  pool_timeout: string;
  sslmode: string;
  hasPassword: boolean;
  isRdsProxy: boolean;
  isPgBouncer: boolean;
} {
  const url = process.env.DATABASE_URL || '';
  const defaults = {
    host: '(not set)',
    port: 5432,
    connection_limit: '(from serverless config)',
    pool_timeout: '(from serverless config)',
    sslmode: '(not in URL)',
    hasPassword: false,
    isRdsProxy: false,
    isPgBouncer: false,
  };

  if (!url || url.startsWith('file:') || url.startsWith('prisma://')) {
    return defaults;
  }

  try {
    const parsed = new URL(url);
    const config = getServerlessConfig();

    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '5432', 10),
      connection_limit: parsed.searchParams.get('connection_limit') || String(config.connectionLimit),
      pool_timeout: parsed.searchParams.get('pool_timeout') || String(config.poolTimeout),
      sslmode: parsed.searchParams.get('sslmode') || '(not set)',
      hasPassword: !!parsed.password,
      isRdsProxy: url.includes('.proxy-') || process.env.USE_RDS_PROXY === 'true',
      isPgBouncer:
        parsed.searchParams.get('pgbouncer') === 'true' || process.env.USE_PGBOUNCER === 'true',
    };
  } catch {
    return defaults;
  }
}

function classifyPrismaError(error: unknown): {
  code: string | null;
  isP1001: boolean;
  isP1002: boolean;
  isP2024: boolean;
  isPoolTimeout: boolean;
  rootCause: string;
} {
  const err = error as { code?: string; message?: string };
  const code = err?.code ?? null;
  const message = (err?.message ?? '').toLowerCase();

  const isP1001 = code === 'P1001' || message.includes('can\'t reach database');
  const isP1002 = code === 'P1002' || message.includes('timed out') || message.includes('timeout');
  const isP2024 =
    code === 'P2024' ||
    message.includes('timed out fetching') ||
    message.includes('connection pool');
  const isPoolTimeout = isP2024 || message.includes('pool') || message.includes('exhausted');

  let rootCause = 'unknown';
  if (isP1001) rootCause = 'unreachable_host';
  else if (isP1002) rootCause = 'connection_timeout';
  else if (isP2024) rootCause = 'pool_exhaustion';
  else if (isPoolTimeout) rootCause = 'pool_timeout_or_exhaustion';
  else if (code) rootCause = `prisma_${code}`;

  return { code, isP1001, isP1002, isP2024, isPoolTimeout, rootCause };
}

export async function GET() {
  const start = Date.now();
  const connectionParams = parseDatabaseUrl();
  const config = getServerlessConfig();

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    connectionParams: {
      host: connectionParams.host,
      port: connectionParams.port,
      connection_limit: connectionParams.connection_limit,
      pool_timeout: connectionParams.pool_timeout,
      sslmode: connectionParams.sslmode,
      isRdsProxy: connectionParams.isRdsProxy,
      isPgBouncer: connectionParams.isPgBouncer,
      serverlessConfig: {
        connectionLimit: config.connectionLimit,
        poolTimeout: config.poolTimeout,
        useRdsProxy: config.useRdsProxy,
        usePgBouncer: config.usePgBouncer,
      },
    },
    select1: null as { ok: boolean; latencyMs: number; error?: string; prismaError?: object } | null,
    pgStatActivity: null as unknown,
    maxConnections: null as number | null,
    rootCause: null as string | null,
    recommendations: [] as string[],
    mitigationSteps: [] as string[],
  };

  // 1. SELECT 1
  try {
    const selectStart = Date.now();
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('SELECT 1 timed out')), DB_CHECK_TIMEOUT_MS)
      ),
    ]);
    result.select1 = {
      ok: true,
      latencyMs: Date.now() - selectStart,
    };
  } catch (selectError) {
    const classification = classifyPrismaError(selectError);
    const err = selectError as { code?: string; message?: string };
    result.select1 = {
      ok: false,
      latencyMs: Date.now() - start,
      error: err?.message ?? 'Unknown error',
      prismaError: {
        code: classification.code,
        isP1001: classification.isP1001,
        isP1002: classification.isP1002,
        isP2024: classification.isP2024,
        isPoolTimeout: classification.isPoolTimeout,
        rootCause: classification.rootCause,
      },
    };

    // Log for observability
    logger.error('[DB-Check] SELECT 1 failed', {
      prismaCode: classification.code,
      rootCause: classification.rootCause,
      error: err?.message,
    });

    result.rootCause = classification.rootCause;

    // Immediate classifications
    if (classification.isP1001) {
      result.recommendations = [
        'Host unreachable: check DATABASE_URL host, firewall, security groups, VPC',
        'Verify RDS instance is running and in same region/VPC as app',
      ];
      result.mitigationSteps = [
        '1. Confirm DATABASE_URL host is correct (not read replica if writes expected)',
        '2. Check AWS Security Groups allow inbound from app (Vercel IPs, NAT)',
        '3. If RDS Proxy: ensure proxy endpoint in DATABASE_URL, not direct RDS',
      ];
    } else if (classification.isP1002) {
      result.recommendations = [
        'Connection timeout: network latency, DB overload, or read replica lag',
        'Check for long-running queries saturating connections',
      ];
      result.mitigationSteps = [
        '1. Run pg_stat_activity query (see below if DB is reachable)',
        '2. Consider RDS Proxy for connection multiplexing',
        '3. Increase connect_timeout if network is slow (trade-off: slower failure)',
      ];
    } else if (classification.isP2024) {
      result.recommendations = [
        'Pool exhaustion (P2024): too many connections per instance or RDS limit exceeded',
        'Ensure connection_limit=1 on Vercel and use RDS Proxy or PgBouncer',
      ];
      result.mitigationSteps = [
        '1. Add ?connection_limit=1 to DATABASE_URL if not set',
        '2. Deploy RDS Proxy and point DATABASE_URL to proxy endpoint',
        '3. Reduce Vercel function concurrency temporarily',
        '4. Check pg_stat_activity for connection count vs max_connections',
      ];
    }
  }

  // 2. pg_stat_activity (only if SELECT 1 succeeded)
  if (result.select1 && (result.select1 as { ok: boolean }).ok) {
    try {
      const [countResult, stateResult, maxConnResult] = await Promise.all([
        prisma.$queryRaw<[{ count: bigint }]>`SELECT count(*)::bigint as count FROM pg_stat_activity`,
        prisma.$queryRaw<
          Array<{ state: string | null; count: bigint }>
        >`SELECT state, count(*)::bigint as count FROM pg_stat_activity GROUP BY state`,
        prisma.$queryRaw<[{ current_setting: string }]>`SELECT current_setting('max_connections') as current_setting`,
      ]);

      result.pgStatActivity = {
        totalConnections: Number(countResult[0]?.count ?? 0),
        byState: (stateResult ?? []).map((r) => ({ state: r.state ?? 'null', count: Number(r.count) })),
      };
      result.maxConnections = parseInt(maxConnResult[0]?.current_setting ?? '0', 10);

      const total = result.pgStatActivity?.totalConnections ?? 0;
      const maxConn = result.maxConnections ?? 0;
      if (maxConn > 0 && total >= maxConn * 0.9) {
        result.rootCause = result.rootCause || 'rds_connection_limit_near';
        result.recommendations = [
          ...(result.recommendations as string[]),
          `RDS connections at ${total}/${maxConn} (~${Math.round((total / maxConn) * 100)}%)`,
        ];
      }
    } catch (pgError) {
      result.pgStatActivity = {
        error: (pgError as Error).message,
      };
      logger.warn('[DB-Check] pg_stat_activity failed', { error: (pgError as Error).message });
    }
  }

  // Add recommended pool config if not already set
  if (!result.recommendations?.length) {
    result.recommendations = [
      'Database reachable. If issues persist, ensure connection_limit=1 on Vercel.',
      'Use RDS Proxy or PgBouncer for production serverless.',
    ];
  }

  const httpStatus = result.select1 && (result.select1 as { ok: boolean }).ok ? 200 : 503;
  return NextResponse.json(result, {
    status: httpStatus,
    headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
  });
}
