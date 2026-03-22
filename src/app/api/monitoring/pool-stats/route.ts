import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, AuthUser } from '@/lib/auth/middleware';
import {
  getConnectionPoolHealth,
  getConnectionPoolMetrics,
  getPoolStats,
  getServerlessConfig,
  basePrisma,
} from '@/lib/db';

export const dynamic = 'force-dynamic';

async function handler(_req: NextRequest, _user: AuthUser) {
  const startTime = Date.now();

  const [poolHealth, poolMetrics, serverlessConfig] = await Promise.all([
    Promise.resolve(getConnectionPoolHealth()),
    Promise.resolve(getConnectionPoolMetrics()),
    Promise.resolve(getServerlessConfig()),
  ]);

  let pgStats = null;
  try {
    pgStats = await getPoolStats(basePrisma);
  } catch {
    pgStats = { error: 'Could not fetch PostgreSQL stats' };
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - startTime,
    pool: {
      health: poolHealth,
      metrics: poolMetrics,
    },
    serverless: {
      config: serverlessConfig,
    },
    postgres: pgStats,
  });
}

export const GET = withSuperAdminAuth(handler);
