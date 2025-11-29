import { createClient, RedisClientType } from 'redis';
import { logger } from '@/lib/logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

class RedisCache {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = this.connect();
    return this.connectionPromise;
  }

  private async connect(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries: any) => {
            if (retries > 10) {
              logger.error('Redis: Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      this.client.on('error', (err: any) => {
        logger.error('Redis Client Error:', err);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis Client Connected');
        this.isConnected = true;
      });

      this.client.on('ready', () => {
        logger.info('Redis Client Ready');
      });

      await this.client.connect();
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to connect to Redis:', error);
      this.client = null;
      this.isConnected = false;
    }
  }

  private getKey(key: string, namespace?: string): string {
    const prefix = namespace || 'lifefile';
    return `${prefix}:${key}`;
  }

  async get<T = unknown>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis not connected, skipping cache get');
      return null;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const value = await this.client.get(fullKey);
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  async set(
    key: string, 
    value: unknown, 
    options?: CacheOptions
  ): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis not connected, skipping cache set');
      return false;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const stringValue = JSON.stringify(value);
      
      if (options?.ttl) {
        await this.client.setEx(fullKey, options.ttl, stringValue);
      } else {
        await this.client.set(fullKey, stringValue);
      }
      
      return true;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis not connected, skipping cache delete');
      return false;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.del(fullKey);
      return result === 1;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  async flush(namespace?: string): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis not connected, skipping cache flush');
      return false;
    }

    try {
      const pattern = this.getKey('*', namespace);
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
      }
      
      return true;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Redis flush error:', error);
      return false;
    }
  }

  async increment(
    key: string, 
    amount = 1, 
    options?: CacheOptions
  ): Promise<number | null> {
    if (!this.isConnected || !this.client) {
      logger.warn('Redis not connected, skipping increment');
      return null;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.incrBy(fullKey, amount);
      
      if (options?.ttl) {
        await this.client.expire(fullKey, options.ttl);
      }
      
      return result;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis increment error for key ${key}:`, error);
      return null;
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected || !this.client) {
      return false;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.client.exists(fullKey);
      return result === 1;
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  async ttl(key: string, options?: CacheOptions): Promise<number | null> {
    if (!this.isConnected || !this.client) {
      return null;
    }

    try {
      const fullKey = this.getKey(key, options?.namespace);
      return await this.client.ttl(fullKey);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error(`Redis TTL error for key ${key}:`, error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      this.client = null;
    }
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

// Singleton instance
const cache = new RedisCache();

// Cache decorators for common use cases
export function cacheable(ttl: number = 300, namespace?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = `${propertyName}:${JSON.stringify(args)}`;
      
      // Try to get from cache
      const cachedResult = await cache.get(cacheKey, { namespace });
      if (cachedResult !== null) {
        logger.debug(`Cache hit for ${propertyName}`);
        return cachedResult;
      }

      // Execute original method
      const result = await originalMethod.apply(this, { value: args });
      
      // Store in cache
      await cache.set(cacheKey, result, { ttl, namespace });
      
      return result;
    };

    return descriptor;
  };
}

// Cache invalidation decorator
export function invalidateCache(namespace?: string, pattern?: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor
  ) {
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
