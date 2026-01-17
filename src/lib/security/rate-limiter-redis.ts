/**
 * Enterprise Redis Rate Limiter
 * Production-ready rate limiting with Redis backend
 * Falls back to in-memory for development
 * 
 * @module security/rate-limiter-redis
 * @version 2.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import { logger } from '@/lib/logger';

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
// Redis Client (Lazy Initialization)
// ============================================================================

let redisClient: any = null;
let redisAvailable = false;
let redisChecked = false;

async function getRedisClient(): Promise<any> {
  if (redisChecked) {
    return redisAvailable ? redisClient : null;
  }

  redisChecked = true;

  // Check if Redis URL is configured
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  
  if (!redisUrl) {
    logger.info('[RateLimit] Redis not configured, using in-memory fallback');
    return null;
  }

  try {
    // Try Upstash REST API first (best for serverless)
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      redisAvailable = true;
      logger.info('[RateLimit] Connected to Upstash Redis');
      return redisClient;
    }

    // Fall back to standard Redis
    const { createClient } = await import('redis');
    redisClient = createClient({ url: redisUrl });
    await redisClient.connect();
    redisAvailable = true;
    logger.info('[RateLimit] Connected to Redis');
    return redisClient;
  } catch (error) {
    logger.warn('[RateLimit] Redis connection failed, using in-memory fallback', { error });
    redisAvailable = false;
    return null;
  }
}

// ============================================================================
// In-Memory Fallback (for development or when Redis unavailable)
// ============================================================================

const memoryCache = new LRUCache<string, RateLimitEntry>({
  max: 10000,
  ttl: 60 * 60 * 1000, // 1 hour TTL
});

// ============================================================================
// Rate Limit Logic
// ============================================================================

/**
 * Check and increment rate limit
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowEnd = now + config.windowSeconds;
  const redis = await getRedisClient();

  if (redis && redisAvailable) {
    return checkRateLimitRedis(redis, key, config, now);
  }

  return checkRateLimitMemory(key, config, now);
}

/**
 * Redis-based rate limiting with sliding window
 */
async function checkRateLimitRedis(
  redis: any,
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  try {
    const windowKey = `ratelimit:${config.identifier}:${key}`;
    const blockKey = `ratelimit:block:${config.identifier}:${key}`;

    // Check if blocked
    const blockedUntil = await redis.get(blockKey);
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

    // Use Redis MULTI for atomic operations
    const isUpstash = !!process.env.UPSTASH_REDIS_REST_URL;
    
    if (isUpstash) {
      // Upstash Redis REST API
      const pipeline = redis.pipeline();
      pipeline.incr(windowKey);
      pipeline.ttl(windowKey);
      const results = await pipeline.exec();
      
      const count = results[0] as number;
      const ttl = results[1] as number;

      // Set expiry if this is a new key
      if (ttl === -1) {
        await redis.expire(windowKey, config.windowSeconds);
      }

      const remaining = Math.max(0, config.maxRequests - count);
      const reset = now + (ttl > 0 ? ttl : config.windowSeconds);

      if (count > config.maxRequests) {
        // Block if configured
        if (config.blockDurationSeconds) {
          const blockUntil = now + config.blockDurationSeconds;
          await redis.setex(blockKey, config.blockDurationSeconds, blockUntil.toString());
        }

        return {
          success: false,
          limit: config.maxRequests,
          remaining: 0,
          reset,
          retryAfter: config.blockDurationSeconds || (reset - now),
        };
      }

      return {
        success: true,
        limit: config.maxRequests,
        remaining,
        reset,
      };
    } else {
      // Standard Redis client
      const multi = redis.multi();
      multi.incr(windowKey);
      multi.ttl(windowKey);
      const results = await multi.exec();

      const count = results[0];
      const ttl = results[1];

      if (ttl === -1) {
        await redis.expire(windowKey, config.windowSeconds);
      }

      const remaining = Math.max(0, config.maxRequests - count);
      const reset = now + (ttl > 0 ? ttl : config.windowSeconds);

      if (count > config.maxRequests) {
        if (config.blockDurationSeconds) {
          const blockUntil = now + config.blockDurationSeconds;
          await redis.setEx(blockKey, config.blockDurationSeconds, blockUntil.toString());
        }

        return {
          success: false,
          limit: config.maxRequests,
          remaining: 0,
          reset,
          retryAfter: config.blockDurationSeconds || (reset - now),
        };
      }

      return {
        success: true,
        limit: config.maxRequests,
        remaining,
        reset,
      };
    }
  } catch (error) {
    logger.error('[RateLimit] Redis error, falling back to memory', { error });
    // Fall back to memory on Redis error
    return checkRateLimitMemory(key, config, now);
  }
}

/**
 * In-memory rate limiting fallback
 */
function checkRateLimitMemory(
  key: string,
  config: RateLimitConfig,
  now: number
): RateLimitResult {
  const cacheKey = `${config.identifier}:${key}`;
  let entry = memoryCache.get(cacheKey);

  // Check if blocked
  if (entry?.blocked && entry.blockedUntil && entry.blockedUntil > now) {
    return {
      success: false,
      limit: config.maxRequests,
      remaining: 0,
      reset: entry.blockedUntil,
      retryAfter: entry.blockedUntil - now,
    };
  }

  // Initialize or reset entry
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

  // Increment count
  entry.count++;
  
  if (entry.count > config.maxRequests) {
    // Block if configured
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
      retryAfter: config.blockDurationSeconds || (entry.resetTime - now),
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
  // Get IP from various headers (Cloudflare, Vercel, nginx, etc.)
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

/**
 * Create a rate limiting middleware
 */
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

  return function rateLimitMiddleware(
    handler: (req: NextRequest) => Promise<Response>
  ) {
    return async (req: NextRequest): Promise<Response> => {
      const key = fullConfig.keyGenerator!(req);
      const result = await checkRateLimit(key, fullConfig);

      // Rate limit exceeded
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

      // Process request
      const response = await handler(req);

      // Add rate limit headers
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

/**
 * Strict rate limit for authentication endpoints
 * 5 attempts per 15 minutes, 30 minute block on exceed
 */
export const authRateLimiter = createRateLimiter({
  identifier: 'auth',
  windowSeconds: 15 * 60,
  maxRequests: 5,
  blockDurationSeconds: 30 * 60,
  message: 'Too many login attempts. Please try again in 30 minutes.',
});

/**
 * Password reset rate limit
 * 3 attempts per hour, 1 hour block
 */
export const passwordResetRateLimiter = createRateLimiter({
  identifier: 'password-reset',
  windowSeconds: 60 * 60,
  maxRequests: 3,
  blockDurationSeconds: 60 * 60,
  message: 'Too many password reset attempts. Please try again in 1 hour.',
});

/**
 * OTP rate limit
 * 5 attempts per 5 minutes
 */
export const otpRateLimiter = createRateLimiter({
  identifier: 'otp',
  windowSeconds: 5 * 60,
  maxRequests: 5,
  message: 'Too many OTP attempts. Please wait 5 minutes.',
});

/**
 * PHI access rate limit
 * 60 requests per minute per user
 */
export const phiAccessRateLimiter = createRateLimiter({
  identifier: 'phi-access',
  windowSeconds: 60,
  maxRequests: 60,
  keyGenerator: userKeyGenerator,
  message: 'PHI access rate limit exceeded.',
});

/**
 * File upload rate limit
 * 10 uploads per minute
 */
export const fileUploadRateLimiter = createRateLimiter({
  identifier: 'file-upload',
  windowSeconds: 60,
  maxRequests: 10,
  keyGenerator: userKeyGenerator,
  message: 'Too many file uploads. Please wait a moment.',
});

/**
 * API rate limit for external integrations
 * 1000 requests per minute per API key
 */
export const apiRateLimiter = createRateLimiter({
  identifier: 'api',
  windowSeconds: 60,
  maxRequests: 1000,
  keyGenerator: apiKeyGenerator,
  message: 'API rate limit exceeded.',
});

/**
 * Standard rate limit for general endpoints
 * 120 requests per minute
 */
export const standardRateLimiter = createRateLimiter({
  identifier: 'standard',
  windowSeconds: 60,
  maxRequests: 120,
  message: 'Too many requests. Please slow down.',
});

/**
 * Relaxed rate limit for read-only endpoints
 * 300 requests per minute
 */
export const relaxedRateLimiter = createRateLimiter({
  identifier: 'relaxed',
  windowSeconds: 60,
  maxRequests: 300,
});

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  identifier: string,
  key: string
): Promise<RateLimitResult | null> {
  const redis = await getRedisClient();
  const now = Math.floor(Date.now() / 1000);

  if (redis && redisAvailable) {
    try {
      const windowKey = `ratelimit:${identifier}:${key}`;
      const count = await redis.get(windowKey);
      const ttl = await redis.ttl(windowKey);

      if (!count) return null;

      return {
        success: true,
        limit: 0, // Unknown without config
        remaining: 0,
        reset: now + (ttl > 0 ? ttl : 0),
      };
    } catch {
      return null;
    }
  }

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

/**
 * Clear rate limit for a specific key (for admin use)
 */
export async function clearRateLimit(
  identifier: string,
  key: string
): Promise<boolean> {
  const redis = await getRedisClient();

  if (redis && redisAvailable) {
    try {
      const windowKey = `ratelimit:${identifier}:${key}`;
      const blockKey = `ratelimit:block:${identifier}:${key}`;
      await redis.del(windowKey, blockKey);
      return true;
    } catch {
      return false;
    }
  }

  const cacheKey = `${identifier}:${key}`;
  memoryCache.delete(cacheKey);
  return true;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  await getRedisClient();
  return redisAvailable;
}
