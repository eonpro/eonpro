/**
 * Redis Cache — Upstash REST Client
 * ===================================
 *
 * Uses @upstash/redis (HTTP/REST) which is fully compatible with
 * serverless environments (Vercel, Lambda). No persistent TCP connections.
 *
 * Falls back gracefully to a no-op cache when Upstash env vars are missing
 * (local dev without Redis).
 *
 * @module cache/redis
 */

import { Redis } from '@upstash/redis';
import { logger } from '@/lib/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

class RedisCache {
  private client: Redis | null = null;
  private ready = false;

  constructor() {
    this.initializeClient();
  }

  private initializeClient(): void {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      // Try to derive from REDIS_URL for backwards compatibility
      if (process.env.REDIS_URL) {
        logger.warn(
          '[RedisCache] REDIS_URL is set but UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are missing. ' +
          'TCP-based redis connections are unreliable in serverless. Please set the Upstash REST env vars.'
        );
      }
      logger.info('[RedisCache] Upstash credentials not configured — running without Redis cache');
      return;
    }

    try {
      this.client = new Redis({ url, token });
      this.ready = true;
      logger.info('[RedisCache] Upstash REST client initialized');
    } catch (error) {
      logger.error('[RedisCache] Failed to initialize Upstash client', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.client = null;
      this.ready = false;
    }
  }

  private getKey(key: string, namespace?: string): string {
    const prefix = namespace || 'lifefile';
    return `${prefix}:${key}`;
  }

  private getTenantKey(clinicId: number, key: string, namespace?: string): string {
    const prefix = namespace || 'lifefile';
    return `${prefix}:t${clinicId}:${key}`;
  }

  /**
   * Tenant-scoped get — cache key automatically includes clinicId.
   * Use this instead of raw get() for any tenant-specific data.
   */
  async tenantGet<T = unknown>(clinicId: number, key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.ready || !this.client) return null;
    try {
      const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
      const value = await this.client.get<T>(fullKey);
      return value ?? null;
    } catch (error) {
      logger.error(`[RedisCache] tenantGet error`, { clinicId, key, error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * Tenant-scoped set — cache key automatically includes clinicId.
   * Use this instead of raw set() for any tenant-specific data.
   */
  async tenantSet(clinicId: number, key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    if (!this.ready || !this.client) return false;
    try {
      const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
      if (options?.ttl) {
        await this.client.set(fullKey, JSON.stringify(value), { ex: options.ttl });
      } else {
        await this.client.set(fullKey, JSON.stringify(value));
      }
      return true;
    } catch (error) {
      logger.error(`[RedisCache] tenantSet error`, { clinicId, key, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  /**
   * Tenant-scoped delete — cache key automatically includes clinicId.
   */
  async tenantDelete(clinicId: number, key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.ready || !this.client) return false;
    try {
      const fullKey = this.getTenantKey(clinicId, key, options?.namespace);
      const result = await this.client.del(fullKey);
      return result === 1;
    } catch (error) {
      logger.error(`[RedisCache] tenantDelete error`, { clinicId, key, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  async get<T = unknown>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.ready || !this.client) return null;

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const value = await this.client.get<T>(fullKey);
      return value ?? null;
    } catch (error) {
      logger.error(`[RedisCache] get error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async set(key: string, value: unknown, options?: CacheOptions): Promise<boolean> {
    if (!this.ready || !this.client) return false;

    try {
      const fullKey = this.getKey(key, options?.namespace);

      if (options?.ttl) {
        await this.client.set(fullKey, JSON.stringify(value), { ex: options.ttl });
      } else {
        await this.client.set(fullKey, JSON.stringify(value));
      }

      return true;
    } catch (error) {
      logger.error(`[RedisCache] set error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.ready || !this.client) return false;

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.del(fullKey);
      return result === 1;
    } catch (error) {
      logger.error(`[RedisCache] delete error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async flush(namespace?: string): Promise<boolean> {
    if (!this.ready || !this.client) return false;

    try {
      const pattern = this.getKey('*', namespace);
      const keys = await this.client.keys(pattern);

      if (keys.length > 0) {
        const pipeline = this.client.pipeline();
        for (const k of keys) {
          pipeline.del(k);
        }
        await pipeline.exec();
      }

      return true;
    } catch (error) {
      logger.error('[RedisCache] flush error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async increment(key: string, amount = 1, options?: CacheOptions): Promise<number | null> {
    if (!this.ready || !this.client) return null;

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.incrby(fullKey, amount);

      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }

      return result;
    } catch (error) {
      logger.error(`[RedisCache] increment error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async mget<T = unknown>(keys: string[], options?: CacheOptions): Promise<(T | null)[]> {
    if (!this.ready || !this.client || keys.length === 0) return keys.map(() => null);

    try {
      const fullKeys = keys.map((k) => this.getKey(k, options?.namespace));
      const values = await this.client.mget<(T | null)[]>(...fullKeys);
      return values ?? keys.map(() => null);
    } catch (error) {
      logger.error('[RedisCache] mget error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return keys.map(() => null);
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.ready || !this.client) return false;

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error(`[RedisCache] exists error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  async ttl(key: string, options?: CacheOptions): Promise<number | null> {
    if (!this.ready || !this.client) return null;

    try {
      const fullKey = this.getKey(key, options?.namespace);
      return await this.client.ttl(fullKey);
    } catch (error) {
      logger.error(`[RedisCache] TTL error for key ${key}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async disconnect(): Promise<void> {
    // @upstash/redis is HTTP-based — no persistent connection to close
    this.ready = false;
    this.client = null;
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  /**
   * Get all keys matching a pattern.
   * Warning: Use sparingly — KEYS/SCAN can be slow on large datasets.
   */
  async keys(pattern: string): Promise<string[]> {
    if (!this.ready || !this.client) return [];

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`[RedisCache] keys error for pattern ${pattern}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}

// Singleton instance
const cache = new RedisCache();

/**
 * @deprecated Do NOT use — this decorator generates cache keys WITHOUT tenant (clinicId) scoping,
 * which can cause cross-tenant cache poisoning in a multi-tenant environment.
 * Use DashboardCache, tenantGet/tenantSet, or manually prefixed cache.get/set with clinicId in the key instead.
 */
export function cacheable(ttl: number = 300, namespace?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      logger.warn(`[DEPRECATED] @cacheable used on ${propertyName} — lacks tenant scoping. Migrate to tenant-aware caching.`);
      const cacheKey = `${propertyName}:${JSON.stringify(args)}`;

      const cachedResult = await cache.get(cacheKey, { namespace });
      if (cachedResult !== null) {
        return cachedResult;
      }

      const result = await originalMethod.apply(this, args);

      await cache.set(cacheKey, result, { ttl, namespace });

      return result;
    };

    return descriptor;
  };
}

// Cache invalidation decorator
export function invalidateCache(namespace?: string, pattern?: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Invalidate cache after successful operation
      if (pattern) {
        await cache.flush(namespace);
      }

      return result;
    };

    return descriptor;
  };
}

export default cache;

// Export types
export type { CacheOptions };
