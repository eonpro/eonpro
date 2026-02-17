/**
 * DATABASE UTILITIES INDEX
 * ========================
 *
 * Enterprise-grade database utilities including:
 * - Schema validation
 * - Safe query wrappers with retry logic
 * - Query optimization and caching
 * - Connection pool management
 * - Data preloading and batching
 *
 * @module Database
 */

// Schema Validation
export {
  validateDatabaseSchema,
  validateTableBeforeOperation,
  runStartupValidation,
  type SchemaValidationResult,
  type SchemaError,
  type SchemaWarning,
} from './schema-validator';

// Safe Query Wrappers
export {
  safeQuery,
  safeInvoiceQuery,
  safePaymentQuery,
  safePrescriptionQuery,
  safeBatchQuery,
  type SafeQueryOptions,
  type SafeQueryResult,
} from './safe-query';

// Query Optimization & Caching
export {
  queryOptimizer,
  createDataLoader,
  type CacheConfig,
  type QueryOptions,
  type BatchLoader,
  type QueryMetrics,
} from './query-optimizer';

// Connection Pool Management
export {
  connectionPool,
  withTimeout,
  withRetry,
  calculateOptimalPoolSize,
  type PoolConfig,
  type PoolMetrics,
} from './connection-pool';

// Data Preloading
export {
  dataPreloader,
  createRequestPreloader,
  type PreloadConfig,
  type PreloadResult,
  type PatientPreloadData,
  type EntityType,
} from './data-preloader';

// Circuit Breaker & Tier-Aware Execution
export {
  executeDb,
  executeDbCritical,
  executeDbAuth,
  executeDbRead,
  executeDbBackground,
  DbTier,
  CircuitOpenError,
  type ExecuteDbOptions,
  type ExecuteDbResult,
} from './executeDb';

export {
  circuitBreaker,
  type GuardDecision,
  type BreakerState,
  type TripReason,
} from './circuit-breaker';

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

import { queryOptimizer } from './query-optimizer';
import { connectionPool } from './connection-pool';
import { dataPreloader } from './data-preloader';

/**
 * Get comprehensive database metrics
 */
export function getDatabaseMetrics() {
  return {
    queryOptimizer: queryOptimizer.getMetrics(),
    connectionPool: connectionPool.getMetrics(),
    accessPatterns: dataPreloader.getAccessPatterns(),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get database health status
 */
export function getDatabaseHealth() {
  const poolHealth = connectionPool.getHealthStatus();
  const queryMetrics = queryOptimizer.getMetrics();

  const cacheHitRate =
    queryMetrics.totalQueries > 0 ? (queryMetrics.cacheHits / queryMetrics.totalQueries) * 100 : 0;

  return {
    status: poolHealth.status,
    cacheHitRate: `${cacheHitRate.toFixed(1)}%`,
    avgQueryTime: `${Math.round(queryMetrics.avgQueryTime)}ms`,
    slowQueries: queryMetrics.slowQueries,
    poolDetails: poolHealth.details,
  };
}

/**
 * Clear all caches (use sparingly)
 */
export async function clearAllCaches(): Promise<void> {
  await queryOptimizer.clearAll();
  dataPreloader.clearLoaders();
}

/**
 * Invalidate caches for a specific entity
 */
export async function invalidateEntity(entityType: string, id?: number | string): Promise<void> {
  await queryOptimizer.invalidate(entityType, id);
}
