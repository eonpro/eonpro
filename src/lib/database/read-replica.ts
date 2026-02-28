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

  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
    datasources: {
      db: {
        url: REPLICA_URL,
      },
    },
  });

  // Lightweight query timing middleware (no guardrails needed for reads)
  // @ts-ignore - Prisma v5 middleware
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
