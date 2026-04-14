/**
 * Enterprise Redis Rate Limiter
 * Production-ready rate limiting with Upstash Redis backend.
 * Falls back to in-memory LRU when Redis is unavailable.
 *
 * @module security/rate-limiter-redis
 * @version 3.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';

// ============================================================================
// Types
// ============================================================================

interface RateLimitConfig {
  /** Unique identifier for this rate limit tier */
  identifier: string;
  /** Time window in seconds */
  windowSeconds: number;
  /** Maximum requests per window */
  maxRequests: number;
  /** Custom key generator */
  keyGenerator?: (req: NextRequest) => string;
  /** Error message when rate limited */
  message?: string;
  /** Skip counting successful requests */
  skipSuccessfulRequests?: boolean;
  /** Skip counting failed requests */
  skipFailedRequests?: boolean;
  /** Block duration in seconds after limit exceeded */
  blockDurationSeconds?: number;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter?: number;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  blocked?: boolean;
  blockedUntil?: number;
}

// ============================================================================
// In-Memory Fallback (for development or when Redis unavailable)
// ============================================================================

const REDIS_OP_TIMEOUT_MS = 2_000;

const memoryCache = new LRUCache<string, RateLimitEntry>({
  max: 10000,
  ttl: 60 * 60 * 1000, // 1 hour TTL
});

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Redis op timed out after ${ms}ms`)), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// ============================================================================
// Rate Limit Logic
// ============================================================================

async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const redisResult = await cache.withClient<RateLimitResult | null>(
    'rateLimiterRedis:checkRateLimit',
    null,
    async (redis) => checkRateLimitRedis(redis, key, config, now)
  );
  return redisResult ?? checkRateLimitMemory(key, config, now);
}

async function checkRateLimitRedis(
  redis: NonNullable<ReturnType<typeof cache.getClient>>,
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  try {
    const windowKey = `ratelimit:${config.identifier}:${key}`;
    const blockKey = `ratelimit:block:${config.identifier}:${key}`;

    const blockedUntil = await withTimeout(redis.get<string>(blockKey), REDIS_OP_TIMEOUT_MS);
    if (blockedUntil && parseInt(blockedUntil) > now) {
      const retryAfter = parseInt(blockedUntil) - now;
      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset: parseInt(blockedUntil),
        retryAfter,
      };
    }

    const pipeline = redis.pipeline();
    pipeline.incr(windowKey);
    pipeline.ttl(windowKey);
    const results = await withTimeout(pipeline.exec(), REDIS_OP_TIMEOUT_MS);

    const count = results[0] as number;
    const ttl = results[1] as number;

    if (ttl === -1) {
      await withTimeout(redis.expire(windowKey, config.windowSeconds), REDIS_OP_TIMEOUT_MS);
    }

    const remaining = Math.max(0, config.maxRequests - count);
    const reset = now + (ttl > 0 ? ttl : config.windowSeconds);

    if (count > config.maxRequests) {
      if (config.blockDurationSeconds) {
        const blockUntil = now + config.blockDurationSeconds;
        await withTimeout(
          redis.setex(blockKey, config.blockDurationSeconds, blockUntil.toString()),
          REDIS_OP_TIMEOUT_MS
        );
      }

      return {
        success: false,
        limit: config.maxRequests,
        remaining: 0,
        reset,
        retryAfter: config.blockDurationSeconds || reset - now,
      };
    }

    return {
      success: true,
      limit: config.maxRequests,
      remaining,
      reset,
    };
  } catch (error) {
    logger.error('[RateLimit] Redis error, falling back to memory', {
      error: error instanceof Error ? error.message : String(error),
    });
    return checkRateLimitMemory(key, config, now);
  }
}

function checkRateLimitMemory(key: string, config: RateLimitConfig, now: number): RateLimitResult {
  const cacheKey = `${config.identifier}:${key}`;
  let entry = memoryCache.get(cacheKey);

  if (entry?.blocked && entry.blockedUntil && entry.blockedUntil > now) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset: entry.blockedUntil,
      retryAfter: entry.blockedUntil - now,
    };
  }

  if (!entry || now >= entry.resetTime) {
    entry = {
      count: 1,
      resetTime: now + config.windowSeconds,
    };
    memoryCache.set(cacheKey, entry);

    return {
      success: true,
      limit: config.maxRequests,
      remaining: config.maxRequests - 1,
      reset: entry.resetTime,
    };
  }

  entry.count++;

  if (entry.count > config.maxRequests) {
    if (config.blockDurationSeconds) {
      entry.blocked = true;
      entry.blockedUntil = now + config.blockDurationSeconds;
    }

    memoryCache.set(cacheKey, entry);

    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset: entry.blockedUntil || entry.resetTime,
      retryAfter: config.blockDurationSeconds || entry.resetTime - now,
    };
  }

  memoryCache.set(cacheKey, entry);

  return {
    success: true,
    limit: config.maxRequests,
    remaining: config.maxRequests - entry.count,
    reset: entry.resetTime,
  };
}

// ============================================================================
// Default Key Generator
// ============================================================================

function defaultKeyGenerator(req: NextRequest): string {
  const ip =
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  return ip;
}

function userKeyGenerator(req: NextRequest): string {
  const userId = req.headers.get('x-user-id');
  if (userId) {
    return `user:${userId}`;
  }
  return defaultKeyGenerator(req);
}

function apiKeyGenerator(req: NextRequest): string {
  const apiKey = req.headers.get('x-api-key');
  if (apiKey) {
    return `apikey:${apiKey.substring(0, 16)}`;
  }
  return defaultKeyGenerator(req);
}

// ============================================================================
// Rate Limit Middleware Factory
// ============================================================================

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const fullConfig: RateLimitConfig = {
    identifier: config.identifier || 'default',
    windowSeconds: config.windowSeconds || 60,
    maxRequests: config.maxRequests || 100,
    keyGenerator: config.keyGenerator || defaultKeyGenerator,
    message: config.message || 'Too many requests. Please try again later.',
    skipSuccessfulRequests: config.skipSuccessfulRequests || false,
    skipFailedRequests: config.skipFailedRequests || false,
    blockDurationSeconds: config.blockDurationSeconds,
  };

  return function rateLimitMiddleware(handler: (req: NextRequest) => Promise<Response>) {
    return async (req: NextRequest): Promise<Response> => {
      const key = fullConfig.keyGenerator!(req);
      const result = await checkRateLimit(key, fullConfig);

      if (!result.success) {
        logger.warn('[RateLimit] Rate limit exceeded', {
          identifier: fullConfig.identifier,
          key,
          retryAfter: result.retryAfter,
        });

        return NextResponse.json(
          {
            error: fullConfig.message,
            code: 'RATE_LIMIT_EXCEEDED',
            retryAfter: result.retryAfter,
          },
          {
            status: 429,
            headers: {
              'X-RateLimit-Limit': result.limit.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': new Date(result.reset * 1000).toISOString(),
              'Retry-After': (result.retryAfter || 60).toString(),
            },
          }
        );
      }

      const response = await handler(req);

      const headers = new Headers(response.headers);
      headers.set('X-RateLimit-Limit', result.limit.toString());
      headers.set('X-RateLimit-Remaining', result.remaining.toString());
      headers.set('X-RateLimit-Reset', new Date(result.reset * 1000).toISOString());

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    };
  };
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

export const authRateLimiter = createRateLimiter({
  identifier: 'auth',
  windowSeconds: 15 * 60,
  maxRequests: 10,
  blockDurationSeconds: 30 * 60,
  message: 'Too many login attempts. Please try again in 30 minutes.',
});

export const passwordResetRateLimiter = createRateLimiter({
  identifier: 'password-reset',
  windowSeconds: 60 * 60,
  maxRequests: 3,
  blockDurationSeconds: 60 * 60,
  message: 'Too many password reset attempts. Please try again in 1 hour.',
});

export const otpRateLimiter = createRateLimiter({
  identifier: 'otp',
  windowSeconds: 5 * 60,
  maxRequests: 5,
  message: 'Too many OTP attempts. Please wait 5 minutes.',
});

export const phiAccessRateLimiter = createRateLimiter({
  identifier: 'phi-access',
  windowSeconds: 60,
  maxRequests: 60,
  keyGenerator: userKeyGenerator,
  message: 'PHI access rate limit exceeded.',
});

export const fileUploadRateLimiter = createRateLimiter({
  identifier: 'file-upload',
  windowSeconds: 60,
  maxRequests: 10,
  keyGenerator: userKeyGenerator,
  message: 'Too many file uploads. Please wait a moment.',
});

export const apiRateLimiter = createRateLimiter({
  identifier: 'api',
  windowSeconds: 60,
  maxRequests: 1000,
  keyGenerator: apiKeyGenerator,
  message: 'API rate limit exceeded.',
});

export const standardRateLimiter = createRateLimiter({
  identifier: 'standard',
  windowSeconds: 60,
  maxRequests: 120,
  message: 'Too many requests. Please slow down.',
});

export const relaxedRateLimiter = createRateLimiter({
  identifier: 'relaxed',
  windowSeconds: 60,
  maxRequests: 300,
});

// ============================================================================
// Utility Functions
// ============================================================================

export async function getRateLimitStatus(
  identifier: string,
  key: string
): Promise<RateLimitResult | null> {
  const now = Math.floor(Date.now() / 1000);
  const redisStatus = await cache.withClient<RateLimitResult | null>(
    'rateLimiterRedis:getRateLimitStatus',
    null,
    async (redis) => {
      const windowKey = `ratelimit:${identifier}:${key}`;
      const count = await redis.get<string>(windowKey);
      const ttl = await redis.ttl(windowKey);

      if (!count) return null;

      return {
        success: true,
        limit: 0,
        remaining: 0,
        reset: now + (ttl > 0 ? ttl : 0),
      };
    }
  );
  if (redisStatus) return redisStatus;
  if (cache.isReady()) return null;

  const cacheKey = `${identifier}:${key}`;
  const entry = memoryCache.get(cacheKey);

  if (!entry) return null;

  return {
    success: entry.count < 100,
    limit: 100,
    remaining: Math.max(0, 100 - entry.count),
    reset: entry.resetTime,
  };
}

export async function clearRateLimit(identifier: string, key: string): Promise<boolean> {
  const redisCleared = await cache.withClient<boolean>(
    'rateLimiterRedis:clearRateLimit',
    false,
    async (redis) => {
      const windowKey = `ratelimit:${identifier}:${key}`;
      const blockKey = `ratelimit:block:${identifier}:${key}`;
      await redis.del(windowKey, blockKey);
      return true;
    }
  );
  if (redisCleared) return true;
  if (cache.isReady()) return false;

  const cacheKey = `${identifier}:${key}`;
  memoryCache.delete(cacheKey);
  return true;
}

export async function isRedisAvailable(): Promise<boolean> {
  return cache.isReady();
}
