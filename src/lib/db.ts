/**
 * Database Access Facade
 * ======================
 *
 * Thin facade that creates the Prisma singleton and re-exports all
 * sub-modules. All 270+ consumers import from '@/lib/db' — this file
 * preserves every existing export so no consumer changes are needed.
 *
 * Internal concerns are split into focused modules under ./db/:
 *   - clinic-isolation-config.ts — CLINIC_ISOLATED_MODELS, BASE_PRISMA_ALLOWLIST
 *   - clinic-context.ts          — AsyncLocalStorage context API
 *   - prisma-with-clinic-filter.ts — PrismaWithClinicFilter class + types
 *
 * @module lib/db
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from './logger';
import { connectionPool, withRetry, withTimeout } from './database/connection-pool';
import {
  getServerlessConfig,
  buildServerlessConnectionUrl,
  logPoolConfiguration,
  drainManager,
  checkDatabaseHealth,
  getPoolStats,
} from './database/serverless-pool';

// ── Sub-module re-exports (preserves all existing import paths) ─────────────
export { Prisma } from '@prisma/client';

export { CLINIC_ISOLATED_MODELS } from './db/clinic-isolation-config';
import { CLINIC_ISOLATED_MODELS, BASE_PRISMA_ALLOWLIST } from './db/clinic-isolation-config';

export {
  clinicContextStorage,
  getClinicContext,
  setClinicContext,
  runWithClinicContext,
  withClinicContext,
  withoutClinicFilter,
} from './db/clinic-context';

import {
  PrismaWithClinicFilter,
  ClinicFilteredTransactionFn,
  createGuardedBasePrisma,
} from './db/prisma-with-clinic-filter';

// ============================================================================
// PRISMA CLIENT SINGLETON
// ============================================================================

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  currentClinicId?: number;
  healthCheckStarted?: boolean;
  shutdownRegistered?: boolean;
};

// Bridge for deprecated global clinicId fallback used by PrismaWithClinicFilter
(global as any).__eonpro_currentClinicId = globalForPrisma.currentClinicId;

function buildConnectionUrl(): string {
  try {
    return buildServerlessConnectionUrl();
  } catch (error) {
    logger.warn('[Prisma] Could not build connection URL', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return process.env.DATABASE_URL || '';
  }
}

function createPrismaClient() {
  const isProd = process.env.NODE_ENV === 'production';
  logPoolConfiguration();
  const connectionUrl = buildConnectionUrl();

  const client = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : isProd
          ? ['error']
          : ['warn', 'error'],
    datasources: {
      db: { url: connectionUrl },
    },
  });

  drainManager.register(client);

  const enableFullInstrumentation = process.env.ENABLE_QUERY_INSTRUMENTATION === 'true';

  // @ts-expect-error — Prisma v5 middleware API not in current type definitions
  client.$use?.(async (params: any, next: any) => {
    if (enableFullInstrumentation) {
      try {
        const { runGuardrails } = require('@/lib/database/circuit-breaker/guardrails');
        runGuardrails(params.model, params.action, params.args);
      } catch { /* module not available */ }
    }

    const start = Date.now();
    try {
      const result = await next(params);
      const duration = Date.now() - start;

      if (duration > 200) {
        logger.warn('[Prisma] Slow query', {
          model: params.model,
          action: params.action,
          duration,
        });
      }

      if (enableFullInstrumentation) {
        connectionPool.recordQuery(duration, true);
        try {
          const { emitQueryMetric } = require('@/lib/observability/metrics');
          emitQueryMetric({ operation: params.action || 'unknown', table: params.model || 'unknown', durationMs: duration });
        } catch { /* module not available */ }
        try {
          const { recordQuery } = require('@/lib/database/query-budget');
          recordQuery(params.model, params.action, duration);
        } catch { /* module not available */ }
      }

      if (
        params.model === 'Patient' &&
        (params.action === 'create' || params.action === 'update' || params.action === 'upsert')
      ) {
        try {
          const data = params.args?.data;
          if (data && typeof data === 'object') {
            const keys = Object.keys(data);
            const _PHI = ['firstName', 'lastName', 'email', 'phone'];
            const hasPHI = keys.some((k) => _PHI.includes(k));
            const hasSearchIndex = 'searchIndex' in data && data.searchIndex;
            if ((hasPHI || params.action === 'create') && !hasSearchIndex && result?.id) {
              import(/* webpackIgnore: true */ '@/lib/utils/search-index-heal').then(({ healPatientSearchIndex }) => {
                healPatientSearchIndex(client, result.id).catch(() => {});
              }).catch(() => {});
            }
          }
        } catch { /* safety net must never break the write path */ }
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      if (enableFullInstrumentation) {
        connectionPool.recordQuery(duration, false);
        try {
          const { circuitBreaker } = require('@/lib/database/circuit-breaker');
          circuitBreaker.recordFailure(error).catch(() => {});
        } catch { /* module not available */ }
      }
      throw error;
    }
  });

  return client;
}

function startHealthMonitoring(client: PrismaClient): void {
  if (globalForPrisma.healthCheckStarted) return;
  const isProd = process.env.NODE_ENV === 'production';
  const isVercel = !!process.env.VERCEL;
  if (isProd && !isVercel) {
    connectionPool.startHealthCheck(client);
    globalForPrisma.healthCheckStarted = true;
    logger.info('[Prisma] Health monitoring started');
  }
}

function registerShutdownHandlers(client: PrismaClient): void {
  if (globalForPrisma.shutdownRegistered || typeof process === 'undefined') return;
  const shutdown = async (signal: string) => {
    logger.info(`[Prisma] Received ${signal}, initiating graceful shutdown`);
    try {
      await connectionPool.shutdown();
      await client.$disconnect();
      logger.info('[Prisma] Graceful shutdown complete');
    } catch (error) {
      logger.error('[Prisma] Error during shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };
  if (!process.env.VERCEL) {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    globalForPrisma.shutdownRegistered = true;
    logger.debug('[Prisma] Shutdown handlers registered');
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
const _rawBasePrisma = globalForPrisma.prisma ?? createPrismaClient();
globalForPrisma.prisma = _rawBasePrisma;

startHealthMonitoring(_rawBasePrisma);
registerShutdownHandlers(_rawBasePrisma);

// ── Exported clients ─────────────────────────────────────────────────────────

const clinicFilterWrapper = new PrismaWithClinicFilter(_rawBasePrisma);
export const prisma = new Proxy(clinicFilterWrapper, {
  get(target: PrismaWithClinicFilter, prop: string) {
    if (prop in target) return (target as any)[prop];
    const client = (target as any).client as PrismaClient;
    const delegate = (client as any)[prop];
    if (delegate && typeof prop === 'string' && (CLINIC_ISOLATED_MODELS as readonly string[]).includes(prop.toLowerCase())) {
      return target.getModelDelegate(prop);
    }
    return delegate;
  },
}) as unknown as PrismaClient & {
  $transaction: ClinicFilteredTransactionFn;
};

export const basePrisma = createGuardedBasePrisma(_rawBasePrisma, BASE_PRISMA_ALLOWLIST);

// ── Connection utilities ─────────────────────────────────────────────────────

export { withRetry, withTimeout } from './database/connection-pool';
export { connectionPool };

export {
  checkDatabaseHealth,
  getPoolStats,
  drainManager,
  getServerlessConfig,
} from './database/serverless-pool';

export function getConnectionPoolHealth() {
  return connectionPool.getHealthStatus();
}

export function getConnectionPoolMetrics() {
  return connectionPool.getMetrics();
}
