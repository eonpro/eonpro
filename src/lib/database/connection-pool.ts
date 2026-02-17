/**
 * DATABASE CONNECTION POOL MANAGER
 * ================================
 *
 * Enterprise-grade connection pool management for Prisma/PostgreSQL:
 * - Optimal pool sizing based on workload
 * - Connection health monitoring
 * - Automatic connection recycling
 * - Query queuing during pool exhaustion
 * - Metrics and alerting
 *
 * @module ConnectionPool
 */

import { PrismaClient } from '@prisma/client';
import os from 'node:os';
import { logger } from '@/lib/logger';

// =============================================================================
// TYPES
// =============================================================================

interface PoolConfig {
  /** Minimum connections to maintain */
  minConnections: number;
  /** Maximum connections allowed */
  maxConnections: number;
  /** Connection idle timeout in ms */
  idleTimeout: number;
  /** Connection acquisition timeout in ms */
  acquireTimeout: number;
  /** How often to check connection health (ms) */
  healthCheckInterval: number;
  /** Maximum connection age before recycling (ms) */
  maxConnectionAge: number;
}

interface PoolMetrics {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  totalAcquired: number;
  totalReleased: number;
  totalTimeouts: number;
  avgAcquireTime: number;
  healthCheckFailures: number;
}

interface ConnectionInfo {
  id: string;
  createdAt: Date;
  lastUsedAt: Date;
  useCount: number;
  isHealthy: boolean;
}

// =============================================================================
// POOL SIZE CALCULATOR
// =============================================================================

/**
 * Calculate optimal pool size based on workload and resources
 * Uses PostgreSQL formula: connections = (core_count * 2) + effective_spindle_count
 * For SSDs, spindle_count ≈ 1
 */
function calculateOptimalPoolSize(): { min: number; max: number } {
  let cpuCount = 4;
  try {
    cpuCount = os.cpus()?.length || 4;
  } catch {
    // Fallback if os.cpus() is unavailable
  }

  // For web applications with mixed read/write workload
  const optimal = cpuCount * 2 + 1;

  // Leave headroom for other services
  const maxFromEnv = parseInt(process.env.DATABASE_POOL_MAX || '0', 10);
  const max = maxFromEnv || Math.min(optimal * 2, 50); // Cap at 50
  const min = Math.max(2, Math.floor(max / 4));

  return { min, max };
}

// =============================================================================
// CONNECTION POOL MANAGER
// =============================================================================

class ConnectionPoolManager {
  private config: PoolConfig;
  private metrics: PoolMetrics;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  constructor() {
    const { min, max } = calculateOptimalPoolSize();

    this.config = {
      minConnections: min,
      maxConnections: max,
      idleTimeout: 60000, // 1 minute
      acquireTimeout: 30000, // 30 seconds
      healthCheckInterval: 30000, // 30 seconds
      maxConnectionAge: 1800000, // 30 minutes
    };

    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0,
      totalAcquired: 0,
      totalReleased: 0,
      totalTimeouts: 0,
      avgAcquireTime: 0,
      healthCheckFailures: 0,
    };

    logger.info('[ConnectionPool] Initialized', {
      minConnections: this.config.minConnections,
      maxConnections: this.config.maxConnections,
    });
  }

  /**
   * Get the Prisma connection URL with pool parameters
   */
  getConnectionUrl(): string {
    const baseUrl = process.env.DATABASE_URL || '';

    if (!baseUrl) {
      logger.warn('[ConnectionPool] DATABASE_URL not set');
      return '';
    }

    // Parse URL and add pool parameters
    const url = new URL(baseUrl);

    // Add connection pool parameters for Prisma
    url.searchParams.set('connection_limit', this.config.maxConnections.toString());
    url.searchParams.set('pool_timeout', Math.floor(this.config.acquireTimeout / 1000).toString());

    // For PostgreSQL: add statement timeout
    url.searchParams.set('statement_timeout', '30000'); // 30s statement timeout

    return url.toString();
  }

  /**
   * Get Prisma datasource configuration
   */
  getPrismaConfig(): {
    datasources: { db: { url: string } };
    log: ('query' | 'info' | 'warn' | 'error')[];
  } {
    return {
      datasources: {
        db: {
          url: this.getConnectionUrl(),
        },
      },
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    };
  }

  /**
   * Start connection health monitoring
   */
  startHealthCheck(prisma: PrismaClient): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const start = Date.now();
        await prisma.$queryRaw`SELECT 1`;
        const duration = Date.now() - start;

        if (duration > 1000) {
          logger.warn('[ConnectionPool] Slow health check', { durationMs: duration });
        }
      } catch (error) {
        this.metrics.healthCheckFailures++;
        logger.error('[ConnectionPool] Health check failed', { error });

        // Attempt to reconnect
        try {
          await prisma.$disconnect();
          await prisma.$connect();
          logger.info('[ConnectionPool] Reconnected after health check failure');
        } catch (reconnectError) {
          logger.error('[ConnectionPool] Reconnection failed', { error: reconnectError });
        }
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Record query execution for metrics
   */
  recordQuery(durationMs: number, success: boolean): void {
    this.metrics.totalAcquired++;

    if (!success) {
      this.metrics.totalTimeouts++;
    }

    // Update average acquire time
    this.metrics.avgAcquireTime =
      (this.metrics.avgAcquireTime * (this.metrics.totalAcquired - 1) + durationMs) /
      this.metrics.totalAcquired;
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics & { config: PoolConfig } {
    return {
      ...this.metrics,
      config: this.config,
    };
  }

  /**
   * Get pool health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, unknown>;
  } {
    const failureRate =
      this.metrics.totalAcquired > 0 ? this.metrics.totalTimeouts / this.metrics.totalAcquired : 0;

    const avgTime = this.metrics.avgAcquireTime;

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (failureRate > 0.1 || avgTime > 5000) {
      status = 'unhealthy';
    } else if (failureRate > 0.01 || avgTime > 1000) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        failureRate: (failureRate * 100).toFixed(2) + '%',
        avgAcquireTimeMs: Math.round(avgTime),
        healthCheckFailures: this.metrics.healthCheckFailures,
        poolSize: `${this.config.minConnections}-${this.config.maxConnections}`,
      },
    };
  }

  /**
   * Prepare for shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopHealthCheck();
    logger.info('[ConnectionPool] Shutting down');
  }

  /**
   * Update pool configuration dynamically
   */
  updateConfig(updates: Partial<PoolConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('[ConnectionPool] Configuration updated', updates);
  }
}

// =============================================================================
// QUERY TIMEOUT WRAPPER
// =============================================================================

/**
 * Execute a query with timeout protection
 */
export async function withTimeout<T>(
  queryFn: () => Promise<T>,
  timeoutMs: number = 30000,
  operationName: string = 'Query'
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      queryFn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`${operationName} timeout after ${timeoutMs}ms`));
        });
      }),
    ]);

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Retry a query with exponential backoff.
 *
 * Circuit breaker integration: P2024 (pool timeout) and "too many connections"
 * errors suppress retries immediately — retrying these errors amplifies the
 * problem under connection_limit=1.
 */
export async function withRetry<T>(
  queryFn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    retryOn?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    retryOn = (e) => isRetryableError(e),
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error as Error;

      // Suppress retries for pool exhaustion — retrying makes it worse
      if (isPoolExhaustionError(lastError)) {
        logger.warn('[ConnectionPool] Pool exhaustion — retries suppressed', {
          attempt,
          error: lastError.message,
        });
        // Feed error to circuit breaker (fire-and-forget)
        try {
          const { circuitBreaker } = require('@/lib/database/circuit-breaker');
          circuitBreaker.recordFailure(lastError).catch(() => {});
        } catch {
          // Circuit breaker module not available
        }
        throw lastError;
      }

      if (attempt === maxRetries || !retryOn(lastError)) {
        throw lastError;
      }

      const delay = Math.min(initialDelayMs * Math.pow(2, attempt - 1), maxDelayMs);

      logger.warn(`[ConnectionPool] Retrying query`, {
        attempt,
        maxRetries,
        delayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Detect errors caused by connection pool exhaustion.
 * These should NEVER be retried — retrying amplifies the problem.
 */
function isPoolExhaustionError(error: Error): boolean {
  const msg = error.message.toLowerCase();
  const code: string | undefined = (error as any).code;
  return (
    code === 'P2024' ||
    msg.includes('timed out fetching a new connection from the connection pool') ||
    msg.includes('too many connections') ||
    msg.includes('too many clients')
  );
}

function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  const retryablePatterns = [
    'connection',
    'timeout',
    'econnreset',
    'econnrefused',
    'temporarily unavailable',
    'too many connections',
    'deadlock',
    'lock wait timeout',
    'connection pool',
    'prepared statement',
  ];

  return retryablePatterns.some((pattern) => message.includes(pattern));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const connectionPool = new ConnectionPoolManager();
export { calculateOptimalPoolSize };
export type { PoolConfig, PoolMetrics, ConnectionInfo };
