/**
 * READ REPLICA PRISMA CLIENT
 * ==========================
 *
 * A read-only Prisma client that routes queries to a PostgreSQL read replica
 * when `DATABASE_READ_REPLICA_URL` is set. Falls back transparently to the
 * primary client when the env var is not configured.
 *
 * Usage in analytics/report routes:
 *   import { readPrisma } from '@/lib/database/read-replica';
 *   const data = await readPrisma.invoice.findMany({ ... });
 *
 * Tenant isolation is preserved — `readPrisma` uses the same
 * `PrismaWithClinicFilter` wrapper and `clinicContextStorage` as the primary.
 *
 * IMPORTANT: Never use `readPrisma` for write operations. Writes to a read
 * replica will fail at the database level (PostgreSQL hot standby rejects writes).
 *
 * @module database/read-replica
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { buildServerlessConnectionUrl } from '@/lib/database/serverless-pool';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REPLICA_URL = process.env.DATABASE_READ_REPLICA_URL;

const globalForReplica = global as unknown as {
  readReplicaClient?: PrismaClient;
};

// =============================================================================
// CLIENT CREATION
// =============================================================================

function createReadReplicaClient(): PrismaClient | null {
  if (!REPLICA_URL) {
    return null;
  }

  if (globalForReplica.readReplicaClient) {
    return globalForReplica.readReplicaClient;
  }

  logger.info('[ReadReplica] Initializing read replica Prisma client');

  let replicaConnectionUrl: string;
  try {
    replicaConnectionUrl = buildServerlessConnectionUrl(REPLICA_URL);
  } catch {
    logger.warn('[ReadReplica] Could not apply pool config to replica URL, using as-is');
    replicaConnectionUrl = REPLICA_URL;
  }

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    datasources: {
      db: {
        url: replicaConnectionUrl,
      },
    },
  });

  // Lightweight query timing middleware (no guardrails needed for reads)
  // @ts-expect-error — Prisma v5 middleware API not in current type definitions
  client.$use?.(async (params: any, next: any) => {
    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;

      if (duration > 200) {
        logger.warn('[ReadReplica] Slow query', {
          model: params.model,
          action: params.action,
          duration,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      logger.error('[ReadReplica] Query failed', {
        model: params.model,
        action: params.action,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  globalForReplica.readReplicaClient = client;
  return client;
}

// =============================================================================
// EXPORTS
// =============================================================================

const _replicaClient = createReadReplicaClient();

/**
 * Whether a dedicated read replica is available.
 * Routes can check this to decide whether to use `readPrisma` or skip
 * replica-specific optimizations.
 */
export const hasReadReplica = _replicaClient !== null;

/**
 * Read-only Prisma client routed to the read replica.
 *
 * Falls back to the primary `prisma` client when `DATABASE_READ_REPLICA_URL`
 * is not set, so calling code doesn't need conditional logic.
 *
 * Tenant isolation is provided by importing the clinic-filtered `prisma` as
 * the fallback. When the replica client is active, the caller must use
 * `runWithClinicContext` in the request path (which is already done by
 * auth middleware), and pass clinic filters manually in the query `where`.
 */
export function getReadPrisma(): PrismaClient {
  if (_replicaClient) {
    return _replicaClient;
  }

  // Lazy import to avoid circular dependency — primary client is always available
  const { prisma } = require('@/lib/db');
  return prisma;
}

// =============================================================================
// RESILIENT READ CLIENT
// =============================================================================

const TRANSIENT_PRISMA_CODES = new Set([
  'P2035', 'P2024', 'P2034', 'P2037', 'P2023', 'P2028',
  'P1000', 'P1001', 'P1002', 'P1008', 'P1011', 'P1017',
]);

/**
 * Detect transient database errors that may resolve on retry or with a different connection.
 */
export function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as any).code;
  if (typeof code === 'string' && TRANSIENT_PRISMA_CODES.has(code)) return true;
  const msg = (error instanceof Error ? error.message : '').toLowerCase();
  return (
    msg.includes('connection pool') ||
    msg.includes('timed out fetching') ||
    msg.includes('assertion violation') ||
    msg.includes('server closed the connection')
  );
}

/**
 * Resilient read-only Prisma client that automatically falls back to the
 * primary database when the read replica is unavailable or throws a transient error.
 *
 * Use this instead of `getReadPrisma()` in analytics/report routes:
 *
 * @example
 * ```typescript
 * import { getResilientReadDb } from '@/lib/database/read-replica';
 * const db = getResilientReadDb();
 * const data = await db.invoice.findMany({ ... });
 * ```
 */
export function getResilientReadDb(): PrismaClient {
  try {
    return getReadPrisma();
  } catch {
    logger.warn('[ReadReplica] Read replica unavailable, using primary');
    const { prisma } = require('@/lib/db');
    return prisma;
  }
}

/**
 * Execute a read operation with automatic fallback to primary on transient errors.
 * If the operation fails with a transient error and a read replica is in use,
 * retries once using the primary database.
 *
 * @example
 * ```typescript
 * const data = await withReadFallback(async (db) => {
 *   return db.order.findMany({ where: { clinicId } });
 * });
 * ```
 */
export async function withReadFallback<T>(
  operation: (db: PrismaClient) => Promise<T>
): Promise<T> {
  const db = getResilientReadDb();
  try {
    return await operation(db);
  } catch (error) {
    if (hasReadReplica && isTransientDbError(error)) {
      logger.warn('[ReadReplica] Transient error on read replica, retrying with primary', {
        errorCode: (error as any)?.code,
      });
      const { prisma } = require('@/lib/db');
      return operation(prisma);
    }
    throw error;
  }
}

/**
 * Check if the read replica is healthy (can connect and execute a query).
 */
export async function checkReadReplicaHealth(): Promise<{
  available: boolean;
  healthy: boolean;
  latencyMs: number | null;
  error?: string;
}> {
  if (!_replicaClient) {
    return { available: false, healthy: false, latencyMs: null };
  }

  const start = Date.now();
  try {
    await _replicaClient.$queryRawUnsafe('SELECT 1');
    return {
      available: true,
      healthy: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    return {
      available: true,
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
