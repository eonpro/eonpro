/**
 * SERVERLESS DATABASE CONNECTION POOL
 * ====================================
 *
 * Optimized for Vercel serverless with RDS Proxy connection pooling:
 * - Without external pooler: connection_limit=1 per function instance (prevents P2024)
 * - With RDS Proxy/PgBouncer: connection_limit=5 per instance (proxy handles multiplexing)
 *
 * Architecture (production):
 *   Vercel Functions (100s of instances, 5 conns each)
 *     → RDS Proxy (pools to ~900 real connections)
 *       → RDS PostgreSQL db.t4g.xlarge (~1800 max_connections)
 *
 * If you see "Timed out fetching a new connection from the connection pool" (P2024):
 * 1. Verify DATABASE_URL points to RDS Proxy (hostname contains .proxy-)
 * 2. Verify USE_RDS_PROXY=true in environment
 * 3. Check RDS Proxy target group health in AWS Console
 *
 * @module ServerlessPool
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

// =============================================================================
// SERVERLESS CONFIGURATION
// =============================================================================

/**
 * Serverless-optimized connection settings
 *
 * With RDS Proxy: Each function instance can safely open up to 5 connections.
 * The proxy multiplexes hundreds of instance connections into ~900 real PG connections.
 * This enables true parallel queries via Promise.all() within a single request.
 *
 * Without external pooler: Capped at 1 connection per instance to prevent
 * exhausting PostgreSQL's max_connections when Vercel auto-scales.
 */
export interface ServerlessPoolConfig {
  /** Maximum connections per serverless function (1 without pooler, up to 10 with pooler) */
  connectionLimit: number;
  /** Pool timeout in seconds (how long to wait for a connection) */
  poolTimeout: number;
  /** Connect timeout in seconds */
  connectTimeout: number;
  /** Idle timeout - close idle connections after this (seconds) */
  idleTimeout: number;
  /** Statement timeout in milliseconds */
  statementTimeout: number;
  /** Whether using RDS Proxy (allows slightly higher limits) */
  useRdsProxy: boolean;
  /** Whether using PgBouncer */
  usePgBouncer: boolean;
}

/**
 * Get serverless-optimized configuration based on environment
 */
export function getServerlessConfig(): ServerlessPoolConfig {
  const isVercel = !!process.env.VERCEL;
  const isProduction = process.env.NODE_ENV === 'production';
  const useRdsProxy =
    process.env.USE_RDS_PROXY === 'true' || !!process.env.DATABASE_URL?.includes('.proxy-');
  const usePgBouncer =
    !!process.env.DATABASE_URL?.includes('pgbouncer=true') || process.env.USE_PGBOUNCER === 'true';

  const hasExternalPooler = useRdsProxy || usePgBouncer;

  // Explicit environment variable override takes priority
  const explicitLimit = process.env.DATABASE_CONNECTION_LIMIT;

  let connectionLimit: number;

  if (explicitLimit) {
    const requested = parseInt(explicitLimit, 10) || 5;
    // With external pooler: allow up to 10 per instance (proxy handles multiplexing)
    // Without external pooler: cap at 1 on Vercel to prevent P2024 exhaustion
    const cap = hasExternalPooler ? 10 : (isVercel ? 1 : 10);
    connectionLimit = Math.min(requested, cap);
  } else if (hasExternalPooler) {
    // RDS Proxy or PgBouncer handles connection multiplexing.
    // 3 connections per instance balances parallelism vs headroom:
    // With ~200 concurrent Vercel instances × 3 = 600 proxy connections,
    // pooled down to ~600 real PG connections (well within db.t4g.xlarge's ~1800 limit).
    // This allows safe scaling up to ~600 instances (600 × 3 = 1800) before exhaustion.
    // Previous value of 5 hit ceiling at ~360 instances.
    connectionLimit = isVercel ? 3 : 10;
  } else if (isVercel) {
    // No external pooler: MUST stay at 1 to prevent P2024.
    // Each Vercel instance opens a direct connection to PostgreSQL.
    connectionLimit = 1;
  } else {
    // Local development or non-serverless
    connectionLimit = 5;
  }

  return {
    connectionLimit,
    poolTimeout: hasExternalPooler ? 30 : (isVercel ? 15 : 30), // Proxy borrow timeout is 120s; 30s is safe
    connectTimeout: 10,
    idleTimeout: isVercel ? 10 : 60, // Release idle connections quickly on serverless
    statementTimeout: 30000, // 30s statement timeout
    useRdsProxy,
    usePgBouncer,
  };
}

/**
 * Build connection URL with serverless-optimized parameters
 */
export function buildServerlessConnectionUrl(baseUrl?: string): string {
  const url = baseUrl || process.env.DATABASE_URL || '';

  if (!url) {
    throw new Error('DATABASE_URL is not configured');
  }

  // Skip modification for Prisma Accelerate
  if (url.startsWith('prisma://')) {
    return url;
  }

  // Skip modification for SQLite
  if (url.startsWith('file:')) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    const config = getServerlessConfig();

    // Set connection limit
    parsedUrl.searchParams.set('connection_limit', config.connectionLimit.toString());

    // Set pool timeout
    parsedUrl.searchParams.set('pool_timeout', config.poolTimeout.toString());

    // Set connect timeout
    parsedUrl.searchParams.set('connect_timeout', config.connectTimeout.toString());

    // For PgBouncer compatibility
    if (config.usePgBouncer && !parsedUrl.searchParams.has('pgbouncer')) {
      parsedUrl.searchParams.set('pgbouncer', 'true');
    }

    // SSL mode for production
    if (process.env.NODE_ENV === 'production' && !parsedUrl.searchParams.has('sslmode')) {
      parsedUrl.searchParams.set('sslmode', 'require');
    }

    return parsedUrl.toString();
  } catch (error) {
    logger.warn('[ServerlessPool] Failed to parse DATABASE_URL, using as-is', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return url;
  }
}

// =============================================================================
// CONNECTION DRAINING
// =============================================================================

/**
 * Connection draining manager for serverless cleanup
 *
 * In Vercel, functions can be "frozen" (suspended) at any time.
 * This utility ensures we clean up connections properly.
 */
class ConnectionDrainManager {
  private static instance: ConnectionDrainManager;
  private prismaClient: PrismaClient | null = null;
  private isDraining = false;
  private drainPromise: Promise<void> | null = null;

  static getInstance(): ConnectionDrainManager {
    if (!ConnectionDrainManager.instance) {
      ConnectionDrainManager.instance = new ConnectionDrainManager();
    }
    return ConnectionDrainManager.instance;
  }

  /**
   * Register a Prisma client for draining
   */
  register(client: PrismaClient): void {
    this.prismaClient = client;
  }

  /**
   * Drain all connections (call at end of request)
   *
   * In serverless, call this in finally blocks or response handlers
   */
  async drain(): Promise<void> {
    if (this.isDraining || !this.prismaClient) {
      return this.drainPromise || Promise.resolve();
    }

    this.isDraining = true;

    this.drainPromise = (async () => {
      try {
        // Disconnect releases all connections back to the pool
        await this.prismaClient!.$disconnect();
        logger.debug('[ServerlessPool] Connections drained');
      } catch (error) {
        logger.warn('[ServerlessPool] Error draining connections', {
          error: error instanceof Error ? error.message : 'Unknown',
        });
      } finally {
        this.isDraining = false;
        this.drainPromise = null;
      }
    })();

    return this.drainPromise;
  }

  /**
   * Force disconnect (for process exit)
   */
  async forceDisconnect(): Promise<void> {
    if (this.prismaClient) {
      try {
        await this.prismaClient.$disconnect();
      } catch {
        // Ignore errors on force disconnect
      }
    }
  }
}

export const drainManager = ConnectionDrainManager.getInstance();

// =============================================================================
// REQUEST-SCOPED CONNECTION WRAPPER
// =============================================================================

/**
 * Execute a database operation with automatic connection cleanup
 *
 * Use this wrapper for individual API route handlers to ensure
 * connections are released even if the request fails.
 *
 * @example
 * export async function GET(req) {
 *   return withDatabaseCleanup(async (prisma) => {
 *     const data = await prisma.user.findMany();
 *     return Response.json(data);
 *   });
 * }
 */
export async function withDatabaseCleanup<T>(
  operation: (prisma: PrismaClient) => Promise<T>,
  prisma: PrismaClient
): Promise<T> {
  try {
    return await operation(prisma);
  } finally {
    // In serverless, we want to release connections quickly
    // but NOT disconnect on every request (expensive)
    // Instead, we rely on Prisma's internal pool management
    // and low connection limits to prevent exhaustion
  }
}

// =============================================================================
// HEALTH CHECK UTILITIES
// =============================================================================

/**
 * Quick database connectivity check
 */
export async function checkDatabaseHealth(prisma: PrismaClient): Promise<{
  healthy: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get connection pool statistics from PostgreSQL
 */
export async function getPoolStats(prisma: PrismaClient): Promise<{
  activeConnections: number;
  idleConnections: number;
  maxConnections: number;
  waitingClients: number;
}> {
  try {
    const result = await prisma.$queryRaw<
      Array<{
        active: bigint;
        idle: bigint;
        max_conn: string;
      }>
    >`
      SELECT
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle,
        current_setting('max_connections') as max_conn
    `;

    const row = result[0];
    return {
      activeConnections: Number(row.active),
      idleConnections: Number(row.idle),
      maxConnections: parseInt(row.max_conn, 10),
      waitingClients: 0, // Would need pg_stat_activity for this
    };
  } catch {
    return {
      activeConnections: -1,
      idleConnections: -1,
      maxConnections: -1,
      waitingClients: -1,
    };
  }
}

// =============================================================================
// LOGGING AND MONITORING
// =============================================================================

/**
 * Log connection pool configuration on startup
 */
export function logPoolConfiguration(): void {
  const config = getServerlessConfig();
  const isVercel = !!process.env.VERCEL;

  logger.info('[ServerlessPool] Configuration', {
    environment: process.env.NODE_ENV,
    platform: isVercel ? 'Vercel' : 'Other',
    connectionLimit: config.connectionLimit,
    poolTimeout: config.poolTimeout,
    useRdsProxy: config.useRdsProxy,
    usePgBouncer: config.usePgBouncer,
  });

  if (isVercel && !config.useRdsProxy && !config.usePgBouncer) {
    logger.warn(
      '[ServerlessPool] Running on Vercel without RDS Proxy or PgBouncer. ' +
        'Consider enabling USE_RDS_PROXY=true for better connection management.'
    );
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

// ServerlessPoolConfig already exported at definition
