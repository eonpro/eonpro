/**
 * Finance Cache Service
 * 
 * Provides caching for financial metrics to improve dashboard performance.
 * Uses Redis for distributed caching when available, falls back to in-memory cache.
 */

import { logger } from '@/lib/logger';

// In-memory cache for when Redis is not available
const memoryCache = new Map<string, { data: any; expiresAt: number }>();

// Cache TTL configuration (in seconds)
const CACHE_TTL = {
  metrics: 30,           // Dashboard KPIs - refresh every 30 seconds
  overview: 60,          // Revenue overview - 1 minute
  mrr: 300,             // MRR data - 5 minutes
  trends: 300,          // Trend data - 5 minutes
  patients: 120,        // Patient analytics - 2 minutes
  subscriptions: 120,   // Subscription data - 2 minutes
};

// Try to use Redis if available
let redis: any = null;
let redisConnected = false;

// Dynamically import ioredis (don't fail if not configured)
async function getRedis() {
  if (redis !== null) return redis;
  
  try {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      logger.debug('Redis URL not configured, using in-memory cache');
      return null;
    }

    const Redis = (await import('ioredis')).default;
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });

    redis.on('connect', () => {
      redisConnected = true;
      logger.info('Finance cache connected to Redis');
    });

    redis.on('error', (err: any) => {
      logger.error('Redis error:', { error: err.message });
      redisConnected = false;
    });

    return redis;
  } catch (error) {
    logger.debug('Redis not available, using in-memory cache');
    return null;
  }
}

/**
 * Finance Cache Service
 */
export class FinanceCache {
  /**
   * Get cache key for clinic-specific data
   */
  private static getKey(clinicId: number, category: string, subKey?: string): string {
    return subKey 
      ? `finance:${clinicId}:${category}:${subKey}`
      : `finance:${clinicId}:${category}`;
  }

  /**
   * Get data from cache
   */
  static async get<T>(clinicId: number, category: string, subKey?: string): Promise<T | null> {
    const key = this.getKey(clinicId, category, subKey);

    try {
      const redisClient = await getRedis();
      
      if (redisClient && redisConnected) {
        const cached = await redisClient.get(key);
        if (cached) {
          return JSON.parse(cached) as T;
        }
      } else {
        // Use in-memory cache
        const cached = memoryCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
          return cached.data as T;
        } else if (cached) {
          // Clean up expired entry
          memoryCache.delete(key);
        }
      }
    } catch (error) {
      logger.debug('Cache get error', { key, error });
    }

    return null;
  }

  /**
   * Set data in cache
   */
  static async set(
    clinicId: number,
    category: string,
    data: any,
    subKey?: string,
    ttlSeconds?: number
  ): Promise<void> {
    const key = this.getKey(clinicId, category, subKey);
    const ttl = ttlSeconds || CACHE_TTL[category as keyof typeof CACHE_TTL] || 60;

    try {
      const redisClient = await getRedis();
      
      if (redisClient && redisConnected) {
        await redisClient.setex(key, ttl, JSON.stringify(data));
      } else {
        // Use in-memory cache
        memoryCache.set(key, {
          data,
          expiresAt: Date.now() + ttl * 1000,
        });
      }
    } catch (error) {
      logger.debug('Cache set error', { key, error });
    }
  }

  /**
   * Invalidate cache for a clinic
   */
  static async invalidate(clinicId: number, category?: string): Promise<void> {
    try {
      const redisClient = await getRedis();
      
      if (redisClient && redisConnected) {
        const pattern = category
          ? `finance:${clinicId}:${category}:*`
          : `finance:${clinicId}:*`;
        
        const keys = await redisClient.keys(pattern);
        if (keys.length > 0) {
          await redisClient.del(...keys);
          logger.debug(`Invalidated ${keys.length} cache keys for clinic ${clinicId}`);
        }
      } else {
        // Clear from in-memory cache
        const prefix = category
          ? `finance:${clinicId}:${category}`
          : `finance:${clinicId}`;
        
        for (const key of memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      logger.debug('Cache invalidate error', { clinicId, category, error });
    }
  }

  /**
   * Get or compute cached data
   * If data is not in cache, compute it and cache the result
   */
  static async getOrCompute<T>(
    clinicId: number,
    category: string,
    computeFn: () => Promise<T>,
    subKey?: string,
    ttlSeconds?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(clinicId, category, subKey);
    if (cached !== null) {
      return cached;
    }

    // Compute the data
    const data = await computeFn();

    // Cache the result
    await this.set(clinicId, category, data, subKey, ttlSeconds);

    return data;
  }

  /**
   * Clear the entire in-memory cache (useful for testing)
   */
  static clearMemoryCache(): void {
    memoryCache.clear();
  }

  /**
   * Get cache stats (for monitoring)
   */
  static getStats(): { memorySize: number; isRedisConnected: boolean } {
    return {
      memorySize: memoryCache.size,
      isRedisConnected: redisConnected,
    };
  }
}

/**
 * Cache decorator for finance service methods
 */
export function cached(category: string, ttlSeconds?: number) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const clinicId = args[0];
      if (typeof clinicId !== 'number') {
        // First arg is not clinicId, call original method
        return originalMethod.apply(this, args);
      }

      // Create a cache key from the method name and args
      const subKey = `${propertyKey}:${JSON.stringify(args.slice(1))}`;

      return FinanceCache.getOrCompute(
        clinicId,
        category,
        () => originalMethod.apply(this, args),
        subKey,
        ttlSeconds
      );
    };

    return descriptor;
  };
}
