/**
 * ENTERPRISE QUERY OPTIMIZER
 * ==========================
 * 
 * High-performance database query optimization layer providing:
 * - Intelligent multi-tier caching (L1: Memory, L2: Redis)
 * - Query deduplication (prevents duplicate in-flight queries)
 * - Automatic batching of related queries
 * - Connection pool optimization
 * - Metrics and slow query tracking
 * 
 * @module database/query-optimizer
 * @version 1.0.0
 * 
 * ## Architecture
 * ```
 * Request → L1 Cache (Memory) → L2 Cache (Redis) → Database
 *           ~0.01ms             ~1-5ms             ~10-100ms
 * ```
 * 
 * ## Usage Examples
 * 
 * ### Basic Cached Query
 * ```typescript
 * import { queryOptimizer } from '@/lib/database';
 * 
 * const patients = await queryOptimizer.query(
 *   () => prisma.patient.findMany({ where: { clinicId } }),
 *   { 
 *     cacheKey: `patients:clinic:${clinicId}`,
 *     cache: { ttl: 300, prefix: 'patient' }
 *   }
 * );
 * ```
 * 
 * ### Fresh Data (Bypass Cache)
 * ```typescript
 * const patient = await queryOptimizer.query(
 *   () => prisma.patient.findUnique({ where: { id } }),
 *   { fresh: true }
 * );
 * ```
 * 
 * ### Cache Invalidation
 * ```typescript
 * // Invalidate single entity
 * await queryOptimizer.invalidate('patient', patientId);
 * 
 * // Invalidate entire entity type
 * await queryOptimizer.invalidate('patient');
 * ```
 * 
 * ## Cache TTLs by Entity
 * | Entity      | L2 (Redis) | L1 (Memory) |
 * |-------------|------------|-------------|
 * | Clinic      | 1 hour     | 5 min       |
 * | Provider    | 10 min     | 1 min       |
 * | Patient     | 5 min      | 30 sec      |
 * | Invoice     | 1 min      | 10 sec      |
 * | Appointment | 1 min      | 10 sec      |
 * 
 * @see {@link ./connection-pool.ts} Connection pool management
 * @see {@link ./data-preloader.ts} DataLoader pattern implementation
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

interface CacheConfig {
  /** Time to live in seconds */
  ttl: number;
  /** Cache key prefix */
  prefix: string;
  /** Whether to use L1 (memory) cache */
  useL1Cache?: boolean;
  /** L1 cache TTL (shorter than L2) */
  l1Ttl?: number;
  /** Tags for cache invalidation */
  tags?: string[];
}

interface QueryOptions<T> {
  /** Unique cache key for this query */
  cacheKey?: string;
  /** Cache configuration */
  cache?: CacheConfig | false;
  /** Force fresh data (bypass cache) */
  fresh?: boolean;
  /** Enable query deduplication */
  dedupe?: boolean;
  /** Query timeout in ms */
  timeout?: number;
  /** Transform result before caching */
  transform?: (data: T) => T;
}

interface BatchLoader<K, V> {
  load: (key: K) => Promise<V>;
  loadMany: (keys: K[]) => Promise<(V | Error)[]>;
  clear: (key: K) => void;
  clearAll: () => void;
}

interface QueryMetrics {
  cacheHits: number;
  cacheMisses: number;
  avgQueryTime: number;
  totalQueries: number;
  slowQueries: number;
}

// =============================================================================
// L1 MEMORY CACHE (Ultra-fast, short-lived)
// =============================================================================

class L1Cache {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private maxSize = 1000;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Cleanup expired entries every 30 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlSeconds: number): void {
    // LRU eviction if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      data,
      expires: Date.now() + (ttlSeconds * 1000),
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  invalidateByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  invalidateByTag(tag: string): number {
    // Tags are stored as part of the key: "tag:entity:id"
    return this.invalidateByPrefix(`${tag}:`);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }

  getStats(): { size: number; maxSize: number } {
    return { size: this.cache.size, maxSize: this.maxSize };
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }
}

// =============================================================================
// QUERY DEDUPLICATION (Prevents duplicate in-flight queries)
// =============================================================================

class QueryDeduplicator {
  private inFlight = new Map<string, Promise<unknown>>();

  async dedupe<T>(key: string, queryFn: () => Promise<T>): Promise<T> {
    // Check if this exact query is already in flight
    const existing = this.inFlight.get(key);
    if (existing) {
      logger.debug(`[QueryOptimizer] Deduped query: ${key}`);
      return existing as Promise<T>;
    }

    // Execute query and track it
    const promise = queryFn().finally(() => {
      this.inFlight.delete(key);
    });

    this.inFlight.set(key, promise);
    return promise;
  }

  getInFlightCount(): number {
    return this.inFlight.size;
  }
}

// =============================================================================
// DATA LOADER (Automatic batching for N+1 prevention)
// =============================================================================

function createDataLoader<K, V>(
  batchFn: (keys: K[]) => Promise<Map<K, V>>,
  options: { maxBatchSize?: number; batchDelayMs?: number } = {}
): BatchLoader<K, V> {
  const { maxBatchSize = 100, batchDelayMs = 10 } = options;
  
  let batch: { key: K; resolve: (v: V) => void; reject: (e: Error) => void }[] = [];
  let batchTimeout: NodeJS.Timeout | null = null;
  const cache = new Map<K, Promise<V>>();

  const executeBatch = async () => {
    const currentBatch = batch;
    batch = [];
    batchTimeout = null;

    if (currentBatch.length === 0) return;

    try {
      const keys = currentBatch.map(item => item.key);
      const results = await batchFn(keys);

      for (const item of currentBatch) {
        const result = results.get(item.key);
        if (result !== undefined) {
          item.resolve(result);
        } else {
          item.reject(new Error(`No result for key: ${item.key}`));
        }
      }
    } catch (error) {
      for (const item of currentBatch) {
        item.reject(error as Error);
      }
    }
  };

  const scheduleBatch = () => {
    if (!batchTimeout) {
      batchTimeout = setTimeout(executeBatch, batchDelayMs);
    }
    if (batch.length >= maxBatchSize) {
      if (batchTimeout) clearTimeout(batchTimeout);
      executeBatch();
    }
  };

  return {
    load: (key: K): Promise<V> => {
      const cached = cache.get(key);
      if (cached) return cached;

      const promise = new Promise<V>((resolve, reject) => {
        batch.push({ key, resolve, reject });
        scheduleBatch();
      });

      cache.set(key, promise);
      return promise;
    },
    loadMany: async (keys: K[]): Promise<(V | Error)[]> => {
      return Promise.all(
        keys.map(key => 
          cache.get(key) || 
          new Promise<V>((resolve, reject) => {
            batch.push({ key, resolve, reject });
            scheduleBatch();
          }).catch(e => e as Error)
        )
      );
    },
    clear: (key: K) => {
      cache.delete(key);
    },
    clearAll: () => {
      cache.clear();
    },
  };
}

// =============================================================================
// MAIN QUERY OPTIMIZER CLASS
// =============================================================================

class QueryOptimizer {
  private l1Cache = new L1Cache();
  private deduplicator = new QueryDeduplicator();
  private metrics: QueryMetrics = {
    cacheHits: 0,
    cacheMisses: 0,
    avgQueryTime: 0,
    totalQueries: 0,
    slowQueries: 0,
  };
  
  // Pre-configured data loaders for common entities
  private patientLoader: BatchLoader<number, unknown> | null = null;
  private providerLoader: BatchLoader<number, unknown> | null = null;
  private invoiceLoader: BatchLoader<number, unknown> | null = null;

  // Default cache configurations by entity type
  private readonly CACHE_CONFIGS: Record<string, CacheConfig> = {
    patient: { ttl: 300, prefix: 'patient', useL1Cache: true, l1Ttl: 30, tags: ['patient'] },
    provider: { ttl: 600, prefix: 'provider', useL1Cache: true, l1Ttl: 60, tags: ['provider'] },
    invoice: { ttl: 60, prefix: 'invoice', useL1Cache: true, l1Ttl: 10, tags: ['invoice', 'billing'] },
    order: { ttl: 120, prefix: 'order', useL1Cache: true, l1Ttl: 15, tags: ['order'] },
    appointment: { ttl: 60, prefix: 'appointment', useL1Cache: true, l1Ttl: 10, tags: ['appointment', 'scheduling'] },
    prescription: { ttl: 180, prefix: 'prescription', useL1Cache: false, tags: ['prescription', 'clinical'] },
    clinic: { ttl: 3600, prefix: 'clinic', useL1Cache: true, l1Ttl: 300, tags: ['clinic'] },
    settings: { ttl: 1800, prefix: 'settings', useL1Cache: true, l1Ttl: 120, tags: ['settings'] },
  };

  // Slow query threshold (ms)
  private readonly SLOW_QUERY_THRESHOLD = 500;

  /**
   * Execute an optimized query with caching and deduplication
   */
  async query<T>(
    queryFn: () => Promise<T>,
    options: QueryOptions<T> = {}
  ): Promise<T> {
    const startTime = Date.now();
    const {
      cacheKey,
      cache: cacheConfig,
      fresh = false,
      dedupe = true,
      timeout = 30000,
      transform,
    } = options;

    this.metrics.totalQueries++;

    // Generate cache key if not provided
    const key = cacheKey || this.generateCacheKey(queryFn);

    // Try L1 cache first (if enabled and not forcing fresh)
    if (!fresh && cacheConfig !== false && (cacheConfig?.useL1Cache ?? true)) {
      const l1Result = this.l1Cache.get<T>(key);
      if (l1Result !== null) {
        this.metrics.cacheHits++;
        this.recordQueryTime(startTime);
        logger.debug(`[QueryOptimizer] L1 cache hit: ${key}`);
        return l1Result;
      }
    }

    // Try L2 (Redis) cache
    if (!fresh && cacheConfig !== false) {
      try {
        const l2Result = await cache.get<T>(key, { 
          namespace: cacheConfig?.prefix || 'query' 
        });
        if (l2Result !== null) {
          this.metrics.cacheHits++;
          // Populate L1 cache for next request
          if (cacheConfig?.useL1Cache) {
            this.l1Cache.set(key, l2Result, cacheConfig?.l1Ttl || 30);
          }
          this.recordQueryTime(startTime);
          logger.debug(`[QueryOptimizer] L2 cache hit: ${key}`);
          return l2Result;
        }
      } catch (error) {
        logger.warn('[QueryOptimizer] L2 cache read failed', { error });
      }
    }

    this.metrics.cacheMisses++;

    // Execute query (with deduplication if enabled)
    const executeQuery = async (): Promise<T> => {
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), timeout)
        ),
      ]);

      // Transform result if needed
      const finalResult = transform ? transform(result) : result;

      // Cache the result
      if (cacheConfig !== false) {
        const config = cacheConfig || { ttl: 300, prefix: 'query' };
        
        // L1 cache
        if (config.useL1Cache) {
          this.l1Cache.set(key, finalResult, config.l1Ttl || 30);
        }
        
        // L2 cache (Redis)
        try {
          await cache.set(key, finalResult, {
            ttl: config.ttl,
            namespace: config.prefix,
          });
        } catch (error) {
          logger.warn('[QueryOptimizer] L2 cache write failed', { error });
        }
      }

      return finalResult;
    };

    // Use deduplication to prevent duplicate in-flight queries
    const result = dedupe
      ? await this.deduplicator.dedupe(key, executeQuery)
      : await executeQuery();

    this.recordQueryTime(startTime);
    return result;
  }

  /**
   * Optimized batch query for loading multiple records
   */
  async batchQuery<T>(
    keys: (string | number)[],
    batchFn: (keys: (string | number)[]) => Promise<Map<string | number, T>>,
    options: { cache?: CacheConfig; maxBatchSize?: number } = {}
  ): Promise<Map<string | number, T>> {
    const { cache: cacheConfig, maxBatchSize = 100 } = options;
    const results = new Map<string | number, T>();
    const uncachedKeys: (string | number)[] = [];

    // Check cache for each key
    for (const key of keys) {
      const cacheKey = `batch:${cacheConfig?.prefix || 'entity'}:${key}`;
      
      // Try L1
      const l1Result = this.l1Cache.get<T>(cacheKey);
      if (l1Result !== null) {
        results.set(key, l1Result);
        continue;
      }
      
      // Try L2
      if (cacheConfig) {
        const l2Result = await cache.get<T>(cacheKey, { namespace: cacheConfig.prefix });
        if (l2Result !== null) {
          results.set(key, l2Result);
          if (cacheConfig.useL1Cache) {
            this.l1Cache.set(cacheKey, l2Result, cacheConfig.l1Ttl || 30);
          }
          continue;
        }
      }
      
      uncachedKeys.push(key);
    }

    // Fetch uncached keys in batches
    if (uncachedKeys.length > 0) {
      for (let i = 0; i < uncachedKeys.length; i += maxBatchSize) {
        const batchKeys = uncachedKeys.slice(i, i + maxBatchSize);
        const batchResults = await batchFn(batchKeys);
        
        for (const [key, value] of batchResults.entries()) {
          results.set(key, value);
          
          // Cache the result
          if (cacheConfig) {
            const cacheKey = `batch:${cacheConfig.prefix}:${key}`;
            if (cacheConfig.useL1Cache) {
              this.l1Cache.set(cacheKey, value, cacheConfig.l1Ttl || 30);
            }
            await cache.set(cacheKey, value, {
              ttl: cacheConfig.ttl,
              namespace: cacheConfig.prefix,
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Invalidate cache by entity type
   */
  async invalidate(entityType: string, id?: number | string): Promise<void> {
    const config = this.CACHE_CONFIGS[entityType];
    if (!config) {
      logger.warn(`[QueryOptimizer] Unknown entity type: ${entityType}`);
      return;
    }

    const key = id ? `${config.prefix}:${id}` : config.prefix;
    
    // Invalidate L1
    if (id) {
      this.l1Cache.delete(key);
    } else {
      this.l1Cache.invalidateByPrefix(config.prefix);
    }
    
    // Invalidate L2 (Redis)
    await cache.delete(key, { namespace: config.prefix });
    
    // Invalidate by tags
    if (config.tags) {
      for (const tag of config.tags) {
        this.l1Cache.invalidateByTag(tag);
      }
    }

    logger.debug(`[QueryOptimizer] Invalidated cache: ${key}`);
  }

  /**
   * Invalidate all caches for a clinic (used after bulk operations)
   */
  async invalidateClinic(clinicId: number): Promise<void> {
    const prefix = `clinic:${clinicId}`;
    this.l1Cache.invalidateByPrefix(prefix);
    await cache.flush(prefix);
    logger.info(`[QueryOptimizer] Invalidated all caches for clinic ${clinicId}`);
  }

  /**
   * Preload data for a request (warm cache)
   */
  async preload(
    entities: Array<{ type: string; id: number | string }>
  ): Promise<void> {
    const grouped = new Map<string, (number | string)[]>();
    
    for (const { type, id } of entities) {
      const list = grouped.get(type) || [];
      list.push(id);
      grouped.set(type, list);
    }

    const promises: Promise<void>[] = [];
    
    for (const [type, ids] of grouped.entries()) {
      // This would call the appropriate loader based on type
      // Implementation depends on specific entity loaders
      logger.debug(`[QueryOptimizer] Preloading ${ids.length} ${type}(s)`);
    }

    await Promise.all(promises);
  }

  /**
   * Get cache configuration for an entity type
   */
  getCacheConfig(entityType: string): CacheConfig | undefined {
    return this.CACHE_CONFIGS[entityType];
  }

  /**
   * Get query metrics
   */
  getMetrics(): QueryMetrics & { l1CacheStats: { size: number; maxSize: number }; inFlightQueries: number } {
    return {
      ...this.metrics,
      l1CacheStats: this.l1Cache.getStats(),
      inFlightQueries: this.deduplicator.getInFlightCount(),
    };
  }

  /**
   * Reset metrics (for testing/monitoring)
   */
  resetMetrics(): void {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      avgQueryTime: 0,
      totalQueries: 0,
      slowQueries: 0,
    };
  }

  /**
   * Clear all caches
   */
  async clearAll(): Promise<void> {
    this.l1Cache.clear();
    await cache.flush('query');
    logger.info('[QueryOptimizer] All caches cleared');
  }

  // Private helpers
  private generateCacheKey(fn: Function): string {
    // Generate a deterministic key from function string representation
    const fnStr = fn.toString().substring(0, 200);
    let hash = 0;
    for (let i = 0; i < fnStr.length; i++) {
      const char = fnStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `query:${Math.abs(hash).toString(36)}`;
  }

  private recordQueryTime(startTime: number): void {
    const duration = Date.now() - startTime;
    
    // Update average
    const total = this.metrics.totalQueries;
    this.metrics.avgQueryTime = 
      (this.metrics.avgQueryTime * (total - 1) + duration) / total;
    
    // Track slow queries
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      this.metrics.slowQueries++;
      logger.warn(`[QueryOptimizer] Slow query detected: ${duration}ms`);
    }
  }
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const queryOptimizer = new QueryOptimizer();

// Export utilities
export { createDataLoader };
export type { CacheConfig, QueryOptions, BatchLoader, QueryMetrics };
