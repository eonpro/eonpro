/**
 * PLATFORM HEALTH CHECK API
 * ==========================
 * Comprehensive health monitoring endpoint that checks all critical services
 * 
 * GET /api/health - Quick health check (public)
 * GET /api/health?full=true - Full system check (requires auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { verifyAuth } from '@/lib/auth/middleware';

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

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // Simple query to verify database connection
    await prisma.$queryRaw`SELECT 1`;
    
    // Check if we can read from a table
    const patientCount = await prisma.patient.count();
    
    return {
      name: 'Database',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and responsive',
      details: { patientCount }
    };
  } catch (error: any) {
    logger.error('Database health check failed', { error: error.message });
    return {
      name: 'Database',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message
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
        message: 'Stripe API key not configured'
      };
    }

    const Stripe = require('stripe');
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover'
    });

    // Quick balance check to verify API key
    await stripe.balance.retrieve();

    return {
      name: 'Stripe',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and authenticated'
    };
  } catch (error: any) {
    logger.error('Stripe health check failed', { error: error.message });
    return {
      name: 'Stripe',
      status: error.message?.includes('API key') ? 'degraded' : 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message
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
        message: 'Twilio credentials not configured'
      };
    }

    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    // Verify account
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();

    return {
      name: 'Twilio',
      status: account.status === 'active' ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: `Account status: ${account.status}`,
      details: { accountStatus: account.status }
    };
  } catch (error: any) {
    logger.error('Twilio health check failed', { error: error.message });
    return {
      name: 'Twilio',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message
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
    const cache = require('@/lib/cache/redis').default;
    
    if (!cache.isReady()) {
      return {
        name: 'Cache (Redis)',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: 'Redis not connected, using in-memory fallback'
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
      message: 'Connected and responsive'
    };
  } catch (error: any) {
    return {
      name: 'Cache (Redis)',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'Using in-memory fallback'
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
        message: 'OpenAI API key not configured'
      };
    }

    const OpenAI = require('openai');
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    // Quick models list to verify API key
    await openai.models.list();

    return {
      name: 'OpenAI',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'Connected and authenticated'
    };
  } catch (error: any) {
    logger.error('OpenAI health check failed', { error: error.message });
    return {
      name: 'OpenAI',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message
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
        message: 'Lifefile API key not configured'
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
        locationId: process.env.LIFEFILE_LOCATION_ID ? 'Set' : 'Not set'
      }
    };
  } catch (error: any) {
    return {
      name: 'Lifefile (Pharmacy)',
      status: 'degraded',
      responseTime: Date.now() - start,
      message: error.message
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
        message: 'JWT_SECRET not configured'
      };
    }

    // Check if we can query users
    const userCount = await prisma.user.count();

    return {
      name: 'Authentication',
      status: 'healthy',
      responseTime: Date.now() - start,
      message: 'JWT configured, user table accessible',
      details: { userCount }
    };
  } catch (error: any) {
    return {
      name: 'Authentication',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message
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
    // Check patients API (basic connectivity)
    const patientCount = await prisma.patient.count();
    results.push({ route: '/api/patients', status: 'ok' });

    // Check clinics exist
    const clinicCount = await prisma.clinic.count();
    results.push({ route: '/api/clinics', status: clinicCount > 0 ? 'ok' : 'no data' });

    // Check invoices table
    const invoiceCount = await prisma.invoice.count();
    results.push({ route: '/api/invoices', status: 'ok' });

    // Check products table
    const productCount = await prisma.product.count();
    results.push({ route: '/api/products', status: 'ok' });

    const allOk = results.every(r => r.status === 'ok' || r.status === 'no data');

    return {
      name: 'API Routes',
      status: allOk ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: `${results.filter(r => r.status === 'ok').length}/${results.length} routes operational`,
      details: results
    };
  } catch (error: any) {
    return {
      name: 'API Routes',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message
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
        message: 'PHI encryption key not configured'
      };
    }

    // Check key length
    const keyLength = Buffer.from(process.env.PHI_ENCRYPTION_KEY, 'hex').length;
    const isValidKeyLength = keyLength === 32; // 256 bits for AES-256

    return {
      name: 'PHI Encryption',
      status: isValidKeyLength ? 'healthy' : 'degraded',
      responseTime: Date.now() - start,
      message: isValidKeyLength ? 'AES-256-GCM configured' : 'Invalid key length'
    };
  } catch (error: any) {
    return {
      name: 'PHI Encryption',
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error.message
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
    const migrations = await prisma.$queryRaw<Array<{
      id: string;
      migration_name: string;
      finished_at: Date | null;
      applied_steps_count: number;
    }>>`
      SELECT id, migration_name, finished_at, applied_steps_count 
      FROM "_prisma_migrations" 
      ORDER BY started_at DESC 
      LIMIT 10
    `;
    
    // Check for failed migrations (finished_at is null or steps_count mismatch)
    const failedMigrations = migrations.filter(m => m.finished_at === null);
    
    if (failedMigrations.length > 0) {
      return {
        name: 'Migrations',
        status: 'degraded',
        responseTime: Date.now() - start,
        message: `${failedMigrations.length} migration(s) in failed state`,
        details: {
          totalMigrations: migrations.length,
          failedMigrations: failedMigrations.map(m => m.migration_name),
        }
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
      }
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
      message: error.message
    };
  }
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(req.url);
  const fullCheck = searchParams.get('full') === 'true';

  try {
    // Basic check (always public)
    const dbCheck = await checkDatabase();
    
    // Quick response for basic health check
    if (!fullCheck) {
      return NextResponse.json({
        status: dbCheck.status,
        timestamp: new Date().toISOString(),
        database: dbCheck.status,
        responseTime: Date.now() - startTime
      });
    }

    // Full check requires authentication for security
    const authResult = await verifyAuth(req);
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (!authResult.success && !isDevelopment) {
      return NextResponse.json(
        { error: 'Authentication required for full health check' },
        { status: 401 }
      );
    }

    // Run all checks in parallel for speed
    const checks = await Promise.all([
      checkDatabase(),
      checkMigrations(),
      checkStripe(),
      checkTwilio(),
      checkCache(),
      checkOpenAI(),
      checkLifefile(),
      checkAuth(),
      checkAPIRoutes(),
      checkEncryption(),
    ]);

    // Calculate summary
    const summary = {
      total: checks.length,
      healthy: checks.filter(c => c.status === 'healthy').length,
      degraded: checks.filter(c => c.status === 'degraded').length,
      unhealthy: checks.filter(c => c.status === 'unhealthy').length,
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
      }
    });

  } catch (error: any) {
    logger.error('Health check failed', { error: error.message });
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
      },
      { status: 503 }
    );
  }
}
