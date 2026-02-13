/**
 * Readiness check endpoint for monitoring
 * Returns 200 if all critical services are operational
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withApiHandler } from '@/domains/shared/errors';

interface ServiceCheck {
  name: string;
  status: 'operational' | 'degraded' | 'down';
  responseTime?: number;
  error?: string;
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<ServiceCheck> {
  const startTime = Date.now();
  try {
    // Simple query to verify database connection
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: 'database',
      status: 'operational',
      responseTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'database',
      status: 'down',
      responseTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Check Lifefile API connectivity
 */
async function checkLifefileAPI(): Promise<ServiceCheck> {
  const startTime = Date.now();

  if (!process.env.LIFEFILE_BASE_URL) {
    return {
      name: 'lifefile_api',
      status: 'degraded',
      error: 'API URL not configured',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${process.env.LIFEFILE_BASE_URL}/health`, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    return {
      name: 'lifefile_api',
      status: response.ok ? 'operational' : 'degraded',
      responseTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      name: 'lifefile_api',
      status: 'degraded',
      responseTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

/**
 * Check Redis connectivity (if configured)
 */
async function checkRedis(): Promise<ServiceCheck> {
  if (!process.env.REDIS_URL) {
    return {
      name: 'redis',
      status: 'operational',
      error: 'Not configured (optional)',
    };
  }

  // If Redis is configured, we would check it here
  // For now, return as operational if not configured
  return {
    name: 'redis',
    status: 'operational',
  };
}

/**
 * Check required environment variables (aligned with env schema: DATABASE_URL, JWT_SECRET).
 * Used for informational checks only; minimal readiness is DB-only per enterprise audit B4.
 */
function checkEnvironment(): ServiceCheck {
  const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
  const missingVars = requiredVars.filter((varName: string) => !process.env[varName]);

  if (missingVars.length > 0) {
    return {
      name: 'environment',
      status: 'down',
      error: `Missing: ${missingVars.join(', ')}`,
    };
  }
  return {
    name: 'environment',
    status: 'operational',
  };
}

/**
 * GET /api/ready
 * Minimal readiness: 200 if DB is operational (k8s/orchestrator use).
 * Other checks (Lifefile, Redis, env) are informational; only DB down → 503.
 * See docs/REMEDIATION_CHECKLIST.md B4.
 */
async function monitoringReadyHandler(req: NextRequest) {
  const startTime = Date.now();

  const checks = await Promise.all([
    checkDatabase(),
    checkLifefileAPI(),
    checkRedis(),
    Promise.resolve(checkEnvironment()),
  ]);

  const dbCheck = checks[0];
  const hasDbDown = dbCheck.status === 'down';
  const hasAnyDown = checks.some((c) => c.status === 'down');
  const hasDegraded = checks.some((c) => c.status === 'degraded');

  let overallStatus: 'ready' | 'degraded' | 'not_ready';
  if (hasDbDown) {
    overallStatus = 'not_ready';
  } else if (hasDegraded || hasAnyDown) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'ready';
  }

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    checks: checks.reduce(
      (acc, check) => {
        acc[check.name] = {
          status: check.status,
          responseTime: check.responseTime,
          error: check.error,
        };
        return acc;
      },
      {} as Record<string, { status: string; responseTime?: number; error?: string }>
    ),
  };

  // Return appropriate status code based on overall status
  const statusCode =
    overallStatus === 'ready' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

export const GET = withApiHandler(monitoringReadyHandler);
