/**
 * Readiness check endpoint - Kubernetes standard path
 * @route GET /api/ready
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/domains/shared/errors';

async function readyHandler(_req: NextRequest) {
  const startTime = Date.now();

  try {
    // Check database connectivity
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ready',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        checks: {
          database: 'operational',
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        checks: {
          database: 'down',
        },
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  }
}

export const GET = withApiHandler(readyHandler);

// Support HEAD requests for load balancers
export const HEAD = withApiHandler(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response(null, { status: 200 });
  } catch {
    return new Response(null, { status: 503 });
  }
});
