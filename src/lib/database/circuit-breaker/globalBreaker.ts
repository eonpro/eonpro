/**
 * GLOBAL (REDIS-BACKED) CIRCUIT BREAKER
 * =======================================
 *
 * Shared breaker state across all Vercel serverless instances.
 * Uses a single Redis key with a TTL to represent the OPEN window.
 *
 * Read path (isOpen):  GET key — if key exists the breaker is OPEN.
 * Write path (trip):   SET key value EX ttl — opens the breaker.
 * Close path (close):  DEL key — closes the breaker (probe success).
 *
 * Graceful degradation: if Redis is unavailable the global layer is
 * effectively skipped and each instance relies on its local breaker.
 *
 * @module database/circuit-breaker/globalBreaker
 */

import { logger } from '@/lib/logger';
import type { TripReason } from './tripSignals';

// =============================================================================
// TYPES
// =============================================================================

export interface GlobalBreakerConfig {
  /** Redis key name */
  key: string;
  /** TTL in seconds when the breaker is OPEN (auto-close if no re-trip) */
  openTtlSeconds: number;
  /** Namespace prefix for the Redis key */
  namespace: string;
}

export interface GlobalBreakerSnapshot {
  isOpen: boolean;
  reason: string | null;
  trippedBy: string | null;
  ttlRemaining: number | null;
}

interface BreakerPayload {
  reason: TripReason;
  trippedBy: string;
  trippedAt: number;
}

// =============================================================================
// DEFAULTS
// =============================================================================

const DEFAULT_CONFIG: GlobalBreakerConfig = {
  key: 'db-circuit-breaker',
  openTtlSeconds: 15,
  namespace: 'eonpro:cb',
};

// =============================================================================
// LAZY REDIS IMPORT
// =============================================================================

/**
 * Lazy-import the Redis cache singleton.
 * This avoids import-time side effects and keeps the module testable.
 */
async function getRedis(): Promise<typeof import('@/lib/cache/redis').default | null> {
  try {
    const mod = await import('@/lib/cache/redis');
    const cache = mod.default;
    if (!cache.isReady()) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

// =============================================================================
// GLOBAL BREAKER
// =============================================================================

export class GlobalBreaker {
  private readonly config: GlobalBreakerConfig;

  constructor(config?: Partial<GlobalBreakerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private get redisKey(): string {
    return `${this.config.namespace}:${this.config.key}`;
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * Check whether the global breaker is currently OPEN.
   * Returns `false` if Redis is unavailable (fail-open: allow traffic).
   */
  async isOpen(): Promise<boolean> {
    const redis = await getRedis();
    if (!redis) return false;

    try {
      return await redis.exists(this.redisKey, { namespace: this.config.namespace });
    } catch {
      return false;
    }
  }

  /**
   * Get a detailed snapshot of the global breaker state.
   */
  async getSnapshot(): Promise<GlobalBreakerSnapshot> {
    const redis = await getRedis();
    if (!redis) {
      return { isOpen: false, reason: null, trippedBy: null, ttlRemaining: null };
    }

    try {
      const [payload, ttl] = await Promise.all([
        redis.get<BreakerPayload>(this.redisKey, { namespace: this.config.namespace }),
        redis.ttl(this.redisKey, { namespace: this.config.namespace }),
      ]);

      if (!payload) {
        return { isOpen: false, reason: null, trippedBy: null, ttlRemaining: null };
      }

      return {
        isOpen: true,
        reason: payload.reason,
        trippedBy: payload.trippedBy,
        ttlRemaining: ttl,
      };
    } catch {
      return { isOpen: false, reason: null, trippedBy: null, ttlRemaining: null };
    }
  }

  // ---------------------------------------------------------------------------
  // WRITE
  // ---------------------------------------------------------------------------

  /**
   * Trip the global breaker.
   * Sets a Redis key with TTL — all instances will see OPEN until TTL expires.
   *
   * @param reason  Classified trip reason
   * @param instanceId  Identifier for the instance that tripped (e.g. hostname or random ID)
   */
  async trip(reason: TripReason, instanceId?: string): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    const payload: BreakerPayload = {
      reason,
      trippedBy: instanceId ?? getInstanceId(),
      trippedAt: Date.now(),
    };

    try {
      await redis.set(this.redisKey, payload, {
        ttl: this.config.openTtlSeconds,
        namespace: this.config.namespace,
      });

      logger.warn('[CircuitBreaker:Global] OPEN — all instances notified', {
        reason,
        ttlSeconds: this.config.openTtlSeconds,
        trippedBy: payload.trippedBy,
      });
    } catch (err) {
      logger.warn('[CircuitBreaker:Global] Failed to set OPEN state in Redis', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Close the global breaker (delete the Redis key).
   * Called when a HALF_OPEN probe succeeds.
   */
  async close(): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
      await redis.delete(this.redisKey, { namespace: this.config.namespace });

      logger.info('[CircuitBreaker:Global] CLOSED — probe succeeded');
    } catch (err) {
      logger.warn('[CircuitBreaker:Global] Failed to clear OPEN state in Redis', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// =============================================================================
// HELPERS
// =============================================================================

let cachedInstanceId: string | null = null;

function getInstanceId(): string {
  if (cachedInstanceId) return cachedInstanceId;

  cachedInstanceId =
    process.env.VERCEL_URL ??
    process.env.VERCEL_REGION ??
    `local-${Math.random().toString(36).slice(2, 8)}`;

  return cachedInstanceId;
}
