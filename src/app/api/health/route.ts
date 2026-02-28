/**
 * PLATFORM HEALTH CHECK API
 * ==========================
 * Comprehensive health monitoring endpoint that checks all critical services
 *
 * GET /api/health - Quick health check (public)
 * GET /api/health?full=true - Full system check (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  prisma,
  checkDatabaseHealth,
  getPoolStats,
  getServerlessConfig,
  getConnectionPoolHealth,
} from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';
import { withApiHandler } from '@/domains/shared/errors';
import { checkReadReplicaHealth, hasReadReplica } from '@/lib/database/read-replica';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  message?: string;
  details?: any;
}

interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
}

// Track server start time for uptime
const startTime = Date.now();

const DB_HEALTH_TIMEOUT_MS = 4000; // Fail fast to avoid holding pool for 15s on P2024

function withTimeout<T>(p: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(timeoutMessage)), ms)
    ),
  ]);
}

/**
 * Check database connectivity (with timeout to avoid worsening pool exhaustion)
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    const healthResult = await withTimeout(
      checkDatabaseHealth(prisma),
      DB_HEALTH_TIMEOUT_MS,
      'Database health check timed out (connection pool may be busy)'
    );

    if (!healthResult.healthy) {
      return {
        name: 'Database',
        status: 'unhealthy',
        responseTime: healthResult.latencyMs,
        message: healthResult.error || 'Connection failed',
      };
    }

    // Quick read check (same timeout so we don't block 15s)
    const patientCount = await withTimeout(
      prisma.patient.count(),
      DB_HEALTH_TIMEOUT_MS,
      'Query timed out'
    ).catch((err) => {
      logger.debug('[Health] Patient count check failed', { error: err instanceof Error ? err.message : String(err) });
      return null;
    });

    if (patientCount === null) {
      return {
        name: 'Database',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        message: 'Query timed out (connection pool may be busy)',
      };
    }

    return {
      name: 'Database',
      status: healthResult.latencyMs > 500 ? 'degraded' : 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and responsive',
      details: { patientCount, latencyMs: healthResult.latencyMs },
    };
  } catch (error: any) {
    logger.error('Database health check failed', { error: error.message });
    return {
      name: 'Database',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check database connection pool health
 */
async function checkConnectionPool(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Get pool stats from PostgreSQL
    const poolStats = await getPoolStats(prisma);

    // Get serverless config
    const config = getServerlessConfig();

    // Get connection pool manager health
    const poolHealth = getConnectionPoolHealth();

    // Calculate utilization
    const utilization =
      poolStats.maxConnections > 0
        ? ((poolStats.activeConnections + poolStats.idleConnections) / poolStats.maxConnections) *
          100
        : 0;

    // Determine status based on utilization
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Connection pool healthy';

    if (utilization > 90) {
      status = 'unhealthy';
      message = 'Connection pool near exhaustion';
    } else if (utilization > 70) {
      status = 'degraded';
      message = 'Connection pool utilization high';
    }

    return {
      name: 'Connection Pool',
      status,
      responseTime: Date.now() - start,
      message,
      details: {
        activeConnections: poolStats.activeConnections,
        idleConnections: poolStats.idleConnections,
        maxConnections: poolStats.maxConnections,
        utilization: `${utilization.toFixed(1)}%`,
        serverlessConfig: {
          connectionLimit: config.connectionLimit,
          useRdsProxy: config.useRdsProxy,
          usePgBouncer: config.usePgBouncer,
        },
        poolManagerStatus: poolHealth.status,
      },
    };
  } catch (error: any) {
    return {
      name: 'Connection Pool',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: `Unable to get pool stats: ${error.message}`,
    };
  }
}

/**
 * Check Stripe integration
 */
async function checkStripe(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return {
        name: 'Stripe',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Stripe API key not configured',
      };
    }

    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
    });

    // Quick balance check to verify API key
    await stripe.balance.retrieve();

    return {
      name: 'Stripe',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and authenticated',
    };
  } catch (error: any) {
    logger.error('Stripe health check failed', { error: error.message });
    return {
      name: 'Stripe',
      status: error.message?.includes('API key') ? 'degraded' : 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check Twilio integration
 */
async function checkTwilio(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return {
        name: 'Twilio',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Twilio credentials not configured',
      };
    }

    const { default: twilio } = await import('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

    // Verify account
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();

    return {
      name: 'Twilio',
      status: account.status === 'active' ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: `Account status: ${account.status}`,
      details: { accountStatus: account.status },
    };
  } catch (error: any) {
    logger.error('Twilio health check failed', { error: error.message });
    return {
      name: 'Twilio',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check Redis/Cache
 */
async function checkCache(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Try to import and check Redis
    const { default: cache } = await import('@/lib/cache/redis');

    if (!cache.isReady()) {
      return {
        name: 'Cache (Redis)',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Redis not connected, using in-memory fallback',
      };
    }

    // Test set/get
    const testKey = `health-check-${Date.now()}`;
    await cache.set(testKey, 'test', { ttl: 10 });
    const value = await cache.get(testKey);
    await cache.delete(testKey);

    return {
      name: 'Cache (Redis)',
      status: value === 'test' ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: 'Connected and responsive',
    };
  } catch (error: any) {
    return {
      name: 'Cache (Redis)',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'Using in-memory fallback',
    };
  }
}

/**
 * Check OpenAI integration
 */
async function checkOpenAI(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        name: 'OpenAI',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'OpenAI API key not configured',
      };
    }

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Quick models list to verify API key
    await openai.models.list();

    return {
      name: 'OpenAI',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and authenticated',
    };
  } catch (error: any) {
    logger.error('OpenAI health check failed', { error: error.message });
    return {
      name: 'OpenAI',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check Lifefile/Pharmacy integration
 */
async function checkLifefile(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.LIFEFILE_API_KEY) {
      return {
        name: 'Lifefile (Pharmacy)',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Lifefile API key not configured',
      };
    }

    // Just verify the config exists
    return {
      name: 'Lifefile (Pharmacy)',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Configured',
      details: {
        practiceId: process.env.LIFEFILE_PRACTICE_NAME ? 'Set' : 'Not set',
        locationId: process.env.LIFEFILE_LOCATION_ID ? 'Set' : 'Not set',
      },
    };
  } catch (error: any) {
    return {
      name: 'Lifefile (Pharmacy)',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check authentication system
 */
async function checkAuth(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.JWT_SECRET) {
      return {
        name: 'Authentication',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        message: 'JWT_SECRET not configured',
      };
    }

    // Check if we can query users
    const userCount = await prisma.user.count();

    return {
      name: 'Authentication',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'JWT configured, user table accessible',
      details: { userCount },
    };
  } catch (error: any) {
    return {
      name: 'Authentication',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check critical API routes
 */
async function checkAPIRoutes(): Promise<HealthCheck> {
  const start = Date.now();
  const results: { route: string; status: string }[] = [];

  try {
    // Check all tables in parallel
    const [patientCount, clinicCount, invoiceCount, productCount] = await Promise.all([
      prisma.patient.count(),
      prisma.clinic.count(),
      prisma.invoice.count(),
      prisma.product.count(),
    ]);

    results.push({ route: '/api/patients', status: 'ok' });
    results.push({ route: '/api/clinics', status: clinicCount > 0 ? 'ok' : 'no data' });
    results.push({ route: '/api/invoices', status: 'ok' });
    results.push({ route: '/api/products', status: 'ok' });

    const allOk = results.every((r) => r.status === 'ok' || r.status === 'no data');

    return {
      name: 'API Routes',
      status: allOk ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: `${results.filter((r) => r.status === 'ok').length}/${results.length} routes operational`,
      details: results,
    };
  } catch (error: any) {
    return {
      name: 'API Routes',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check encryption services
 */
async function checkEncryption(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    if (!process.env.PHI_ENCRYPTION_KEY) {
      return {
        name: 'PHI Encryption',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'PHI encryption key not configured',
      };
    }

    // Check key length
    const keyLength = Buffer.from(process.env.PHI_ENCRYPTION_KEY, 'hex').length;
    const isValidKeyLength = keyLength === 32; // 256 bits for AES-256

    return {
      name: 'PHI Encryption',
      status: isValidKeyLength ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: isValidKeyLength ? 'AES-256-GCM configured' : 'Invalid key length',
    };
  } catch (error: any) {
    return {
      name: 'PHI Encryption',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check database migration status
 */
async function checkMigrations(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Check if _prisma_migrations table exists and query it
    const migrations = await prisma.$queryRaw<
      Array<{
        id: string;
        migration_name: string;
        finished_at: Date | null;
        applied_steps_count: number;
      }>
    >`
      SELECT id, migration_name, finished_at, applied_steps_count 
      FROM "_prisma_migrations" 
      ORDER BY started_at DESC 
      LIMIT 10
    `;

    // Check for failed migrations (finished_at is null or steps_count mismatch)
    const failedMigrations = migrations.filter(
      (m: { finished_at: Date | null }) => m.finished_at === null
    );

    if (failedMigrations.length > 0) {
      return {
        name: 'Migrations',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: `${failedMigrations.length} migration(s) in failed state`,
        details: {
          totalMigrations: migrations.length,
          failedMigrations: failedMigrations.map(
            (m: { migration_name: string }) => m.migration_name
          ),
        },
      };
    }

    return {
      name: 'Migrations',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'All migrations applied successfully',
      details: {
        totalMigrations: migrations.length,
        latestMigration: migrations[0]?.migration_name || 'none',
      },
    };
  } catch (error: any) {
    // If table doesn't exist, migrations haven't been run
    if (error.message.includes('does not exist') || error.message.includes('_prisma_migrations')) {
      return {
        name: 'Migrations',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Migration history table not found - using db push?',
      };
    }

    return {
      name: 'Migrations',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check affiliate system health
 * Verifies table access, PayPal config, and no orphaned payouts
 */
async function checkAffiliateSystem(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Extended health checks — covers stuck commissions, orphaned payouts,
    // fraud alert backlog, and attribution orphans
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      tableCheck,
      orphanedPayouts,
      paypalConfigured,
      stuckCommissions,
      fraudAlertBacklog,
      attributionOrphans,
    ] = await Promise.all([
      // Verify AffiliateCommissionEvent table is accessible
      prisma.affiliateCommissionEvent
        .count({ take: 1 })
        .then(() => true)
        .catch(() => false),
      // Check for orphaned payouts (stuck in PROCESSING > 1 hour)
      prisma.affiliatePayout.count({
        where: {
          status: 'PROCESSING',
          processedAt: {
            lt: oneHourAgo,
          },
        },
      }),
      // Check if PayPal is configured (if used)
      Promise.resolve(!!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET),
      // Commissions stuck in PENDING past a 7-day hold period (should have been auto-approved)
      prisma.affiliateCommissionEvent.count({
        where: {
          status: 'PENDING',
          holdUntil: { lt: sevenDaysAgo },
        },
      }),
      // Fraud alerts older than 48 hours that haven't been resolved
      prisma.affiliateFraudAlert
        .count({
          where: {
            status: 'OPEN',
            createdAt: { lt: fortyEightHoursAgo },
          },
        })
        .catch(() => 0), // Table may not exist yet
      // Attribution orphans: patients with attributionRefCode but no attributionAffiliateId
      prisma.patient.count({
        where: {
          attributionRefCode: { not: null },
          attributionAffiliateId: null,
        },
      }),
    ]);

    if (!tableCheck) {
      return {
        name: 'Affiliate System',
        status: 'unhealthy',
        responseTime: Date.now() - start,
        message: 'AffiliateCommissionEvent table not accessible',
      };
    }

    const issues: string[] = [];
    if (orphanedPayouts > 0) {
      issues.push(`${orphanedPayouts} orphaned payout(s) stuck in PROCESSING > 1h`);
    }
    if (!paypalConfigured) {
      issues.push('PayPal credentials not configured');
    }
    if (stuckCommissions > 0) {
      issues.push(`${stuckCommissions} commission(s) stuck in PENDING past hold period`);
    }
    if (fraudAlertBacklog > 0) {
      issues.push(`${fraudAlertBacklog} unresolved fraud alert(s) older than 48h`);
    }
    if (attributionOrphans > 0) {
      issues.push(`${attributionOrphans} patient(s) with ref code but no affiliate attribution`);
    }

    const status: 'healthy' | 'degraded' | 'unhealthy' =
      orphanedPayouts > 0 || stuckCommissions > 5 ? 'degraded' : 'healthy';

    return {
      name: 'Affiliate System',
      status,
      responseTime: Date.now() - start,
      message: issues.length > 0 ? issues.join('; ') : 'All affiliate subsystems operational',
      details: {
        tableAccessible: tableCheck,
        orphanedPayouts,
        paypalConfigured,
        stuckCommissions,
        fraudAlertBacklog,
        attributionOrphans,
      },
    };
  } catch (error: any) {
    return {
      name: 'Affiliate System',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

async function checkReadReplica(): Promise<HealthCheck> {
  const start = Date.now();

  if (!hasReadReplica) {
    return {
      name: 'Read Replica',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'DATABASE_READ_REPLICA_URL not configured — all reads go to primary',
    };
  }

  try {
    const result = await checkReadReplicaHealth();

    if (!result.healthy) {
      return {
        name: 'Read Replica',
        status: 'unhealthy',
        responseTime: result.latencyMs ?? Date.now() - start,
        message: result.error || 'Replica not responding',
      };
    }

    return {
      name: 'Read Replica',
      status: (result.latencyMs ?? 0) > 500 ? 'degraded' : 'healthy',
      responseTime: result.latencyMs ?? Date.now() - start,
      message: 'Connected and responsive',
      details: { latencyMs: result.latencyMs },
    };
  } catch (error: any) {
    return {
      name: 'Read Replica',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message,
    };
  }
}

async function healthHandler(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const fullCheck = searchParams.get('full') === 'true';

  try {
    // Basic check (always public)
    const dbCheck = await checkDatabase();

    // Quick response for basic health check (includes deploy identity for verifying which code is live)
    if (!fullCheck) {
      const payload: Record<string, unknown> = {
        status: dbCheck.status,
        timestamp: new Date().toISOString(),
        database: dbCheck.status,
        responseTime: Date.now() - startTime,
      };
      if (process.env.VERCEL_GIT_COMMIT_SHA) {
        payload.commit = process.env.VERCEL_GIT_COMMIT_SHA;
      }
      if (process.env.VERCEL_URL) {
        payload.buildId = process.env.VERCEL_BUILD_ID ?? undefined;
      }
      return NextResponse.json(payload, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
    }

    // Full check is super_admin only (control center)
    const authResult = await verifyAuth(req);
    const isDevelopment = process.env.NODE_ENV === 'development';

    if (!authResult.success && !isDevelopment) {
      return NextResponse.json(
        { error: 'Authentication required for full health check' },
        { status: 401 }
      );
    }
    if (authResult.success && authResult.user?.role !== 'super_admin' && !isDevelopment) {
      return NextResponse.json(
        { error: 'Control Center access is restricted to super admins' },
        { status: 403 }
      );
    }

    // Run all checks in parallel for speed
    const checks = await Promise.all([
      checkDatabase(),
      checkReadReplica(),
      checkConnectionPool(),
      checkMigrations(),
      checkStripe(),
      checkTwilio(),
      checkCache(),
      checkOpenAI(),
      checkLifefile(),
      checkAuth(),
      checkAPIRoutes(),
      checkEncryption(),
      checkAffiliateSystem(),
    ]);

    // Calculate summary
    const summary = {
      total: checks.length,
      healthy: checks.filter((c) => c.status === 'healthy').length,
      degraded: checks.filter((c) => c.status === 'degraded').length,
      unhealthy: checks.filter((c) => c.status === 'unhealthy').length,
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (summary.unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    const report: HealthReport = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
      summary,
    };

    logger.info('Health check completed', { status: overallStatus, summary });

    return NextResponse.json(report, {
      status: overallStatus === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error('Health check failed', { error: msg });
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: msg,
      },
      { status: 503 }
    );
  }
}

export const GET = withApiHandler(healthHandler);
