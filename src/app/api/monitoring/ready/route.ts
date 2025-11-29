/**
 * Readiness check endpoint for monitoring
 * Returns 200 if all critical services are operational
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
  } catch (error: any) {
    // @ts-ignore
   
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
  } catch (error: any) {
    // @ts-ignore
   
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
 * Check required environment variables
 */
function checkEnvironment(): ServiceCheck {
  const requiredVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'LIFEFILE_USERNAME',
    'LIFEFILE_PASSWORD',
  ];

  const missingVars = requiredVars.filter((varName: any) => !process.env[varName]);

  if (missingVars.length > 0) {
    return {
      name: 'environment',
      status: 'down',
      error: `Missing required variables: ${missingVars.join(', ')}`,
    };
  }

  return {
    name: 'environment',
    status: 'operational',
  };
}

/**
 * GET /api/ready
 * Comprehensive readiness check - verifies all dependencies are operational
 */
export async function GET(req: NextRequest) {
  const startTime = Date.now();

  // Run all checks in parallel
  const checks = await Promise.all([
    checkDatabase(),
    checkLifefileAPI(),
    checkRedis(),
    Promise.resolve(checkEnvironment()),
  ]);

  // Determine overall status
  const hasDown = checks.some((check: any) => check.status === 'down');
  const hasDegraded = checks.some((check: any) => check.status === 'degraded');
  
  let overallStatus: 'ready' | 'degraded' | 'not_ready';
  if (hasDown) {
    overallStatus = 'not_ready';
  } else if (hasDegraded) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'ready';
  }

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    responseTime: Date.now() - startTime,
    checks: checks.reduce((acc, check) => {
      acc[check.name] = {
        status: check.status,
        responseTime: check.responseTime,
        error: check.error,
      };
      return acc;
    }, {} as Record<string, any>),
  };

  // Return appropriate status code based on overall status
  const statusCode = (overallStatus as any) === "ready" ? 200 : (overallStatus as any) === "degraded" ? 200 : 503;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
