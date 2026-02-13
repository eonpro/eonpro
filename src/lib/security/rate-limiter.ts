/**
 * Rate Limiting Service
 * Prevents abuse and brute force attacks
 * HIPAA requirement for access control
 *
 * Uses Redis in production, falls back to in-memory for development/testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';

// In-memory fallback storage (used when Redis is not available)
const localAttempts = new Map<string, { count: number; firstAttempt: number; blocked: boolean }>();

// Clean up old entries periodically (only for local storage)
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;

  for (const [key, value] of localAttempts.entries()) {
    if (value.firstAttempt < oneHourAgo) {
      localAttempts.delete(key);
    }
  }
}, 60000); // Clean every minute

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxAttempts: number; // Max attempts in window
  blockDuration: number; // Block duration after limit exceeded
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
}

interface RateLimitRecord {
  count: number;
  firstAttempt: number;
  blocked: boolean;
}

// Default configurations for different endpoints
export const RATE_LIMIT_CONFIGS = {
  // Strict limit for login attempts
  login: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxAttempts: 3, // 3 attempts
    blockDuration: 30 * 60 * 1000, // 30 minutes block
  },

  // PHI access endpoints
  phiAccess: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 30, // 30 requests per minute
    blockDuration: 5 * 60 * 1000, // 5 minutes block
  },

  // Document upload
  upload: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 5, // 5 uploads per minute
    blockDuration: 10 * 60 * 1000, // 10 minutes block
  },

  // API general
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxAttempts: 100, // 100 requests per minute
    blockDuration: 60 * 1000, // 1 minute block
  },

  // Password reset
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxAttempts: 3, // 3 attempts per hour
    blockDuration: 60 * 60 * 1000, // 1 hour block
  },
};

// Check if Redis is available
const useRedis = (): boolean => {
  return cache.isReady() && process.env.NODE_ENV === 'production';
};

/**
 * Get rate limit key for request
 */
function getKey(req: NextRequest, keyGenerator?: (req: NextRequest) => string): string {
  if (keyGenerator) {
    return keyGenerator(req);
  }

  // Default: IP + path
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const path = new URL(req.url).pathname;

  return `ratelimit:${ip}:${path}`;
}

/**
 * Get record from Redis
 */
async function getRedisRecord(key: string): Promise<RateLimitRecord | null> {
  const data = await cache.get<RateLimitRecord>(key, { namespace: 'ratelimit' });
  return data;
}

/**
 * Set record in Redis
 */
async function setRedisRecord(
  key: string,
  record: RateLimitRecord,
  ttlSeconds: number
): Promise<boolean> {
  return await cache.set(key, record, { namespace: 'ratelimit', ttl: ttlSeconds });
}

/**
 * Delete record from Redis
 */
async function deleteRedisRecord(key: string): Promise<boolean> {
  return await cache.delete(key, { namespace: 'ratelimit' });
}

/**
 * Check if request should be rate limited (Redis version)
 */
async function checkRateLimitRedis(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  const now = Date.now();
  const ttlSeconds = Math.ceil(Math.max(config.windowMs, config.blockDuration) / 1000);

  let record = await getRedisRecord(key);

  if (!record) {
    record = { count: 1, firstAttempt: now, blocked: false };
    await setRedisRecord(key, record, ttlSeconds);

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
    };
  }

  // Check if blocked
  if (record.blocked) {
    const blockExpiry = record.firstAttempt + config.blockDuration;

    if (now > blockExpiry) {
      // Unblock and reset
      record = { count: 1, firstAttempt: now, blocked: false };
      await setRedisRecord(key, record, ttlSeconds);

      return {
        allowed: true,
        remaining: config.maxAttempts - 1,
      };
    }

    // Still blocked
    return {
      allowed: false,
      retryAfter: Math.ceil((blockExpiry - now) / 1000),
    };
  }

  // Check if window expired
  if (now - record.firstAttempt > config.windowMs) {
    // Reset window
    record = { count: 1, firstAttempt: now, blocked: false };
    await setRedisRecord(key, record, ttlSeconds);

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
    };
  }

  // Increment count
  record.count++;

  // Check if limit exceeded
  if (record.count > config.maxAttempts) {
    record.blocked = true;
    await setRedisRecord(key, record, ttlSeconds);

    logger.security('Rate limit exceeded (Redis)', {
      key,
      attempts: record.count,
      maxAttempts: config.maxAttempts,
      blocked: true,
    });

    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDuration / 1000),
    };
  }

  await setRedisRecord(key, record, ttlSeconds);

  return {
    allowed: true,
    remaining: config.maxAttempts - record.count,
  };
}

/**
 * Check if request should be rate limited (Local/Memory version)
 */
function checkRateLimitLocal(
  key: string,
  config: RateLimitConfig
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const now = Date.now();

  // Get or create attempt record
  let record = localAttempts.get(key);

  if (!record) {
    record = { count: 1, firstAttempt: now, blocked: false };
    localAttempts.set(key, record);

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
    };
  }

  // Check if blocked
  if (record.blocked) {
    const blockExpiry = record.firstAttempt + config.blockDuration;

    if (now > blockExpiry) {
      // Unblock and reset
      record.blocked = false;
      record.count = 1;
      record.firstAttempt = now;

      return {
        allowed: true,
        remaining: config.maxAttempts - 1,
      };
    }

    // Still blocked
    return {
      allowed: false,
      retryAfter: Math.ceil((blockExpiry - now) / 1000),
    };
  }

  // Check if window expired
  if (now - record.firstAttempt > config.windowMs) {
    // Reset window
    record.count = 1;
    record.firstAttempt = now;

    return {
      allowed: true,
      remaining: config.maxAttempts - 1,
    };
  }

  // Increment count
  record.count++;

  // Check if limit exceeded
  if (record.count > config.maxAttempts) {
    record.blocked = true;

    logger.security('Rate limit exceeded (Local)', {
      key,
      attempts: record.count,
      maxAttempts: config.maxAttempts,
      blocked: true,
    });

    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDuration / 1000),
    };
  }

  return {
    allowed: true,
    remaining: config.maxAttempts - record.count,
  };
}

/**
 * Check if request should be rate limited
 * Automatically uses Redis in production, falls back to local storage
 */
export async function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  const key = getKey(req, config.keyGenerator);

  if (useRedis()) {
    return checkRateLimitRedis(key, config);
  }

  return checkRateLimitLocal(key, config);
}

/**
 * Synchronous rate limit check (uses local storage only)
 * For use in synchronous contexts
 */
export function strictRateLimit(
  config: RateLimitConfig,
  req: NextRequest,
  keyGenerator?: (req: NextRequest) => string
): { allowed: boolean; retryAfter?: number } {
  const key = getKey(req, keyGenerator);
  return checkRateLimitLocal(key, config);
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(
  handler: (req: NextRequest, ...args: unknown[]) => Promise<Response>,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
) {
  return async (req: NextRequest, ...args: unknown[]) => {
    const { allowed, retryAfter, remaining } = await checkRateLimit(req, config);

    if (!allowed) {
      logger.warn('Rate limit blocked request', {
        path: new URL(req.url).pathname,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        retryAfter,
        useRedis: useRedis(),
      });

      return NextResponse.json(
        {
          error: 'Too many requests',
          retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxAttempts),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + (retryAfter || 0) * 1000),
          },
        }
      );
    }

    // Add rate limit headers to response
    const response = await handler(req, ...args);

    if (response instanceof NextResponse && remaining !== undefined) {
      response.headers.set('X-RateLimit-Limit', String(config.maxAttempts));
      response.headers.set('X-RateLimit-Remaining', String(remaining));
      response.headers.set('X-RateLimit-Reset', String(Date.now() + config.windowMs));
    }

    return response;
  };
}

/**
 * Reset rate limit for a specific key
 */
export async function resetRateLimit(key: string): Promise<void> {
  if (useRedis()) {
    await deleteRedisRecord(key);
  }
  localAttempts.delete(key);
}

/**
 * Get current rate limit status
 */
export async function getRateLimitStatus(key: string): Promise<{
  attempts: number;
  blocked: boolean;
  firstAttempt?: number;
} | null> {
  if (useRedis()) {
    const record = await getRedisRecord(key);
    if (!record) return null;

    return {
      attempts: record.count,
      blocked: record.blocked,
      firstAttempt: record.firstAttempt,
    };
  }

  const record = localAttempts.get(key);

  if (!record) {
    return null;
  }

  return {
    attempts: record.count,
    blocked: record.blocked,
    firstAttempt: record.firstAttempt,
  };
}

/**
 * Distributed rate limiter using Redis sliding window
 * More accurate for high-traffic production scenarios
 */
export async function slidingWindowRateLimit(
  req: NextRequest,
  config: RateLimitConfig
): Promise<{ allowed: boolean; retryAfter?: number; remaining?: number }> {
  if (!useRedis()) {
    // Fall back to simple rate limit if Redis not available
    return checkRateLimit(req, config);
  }

  const key = getKey(req, config.keyGenerator);
  const now = Date.now();
  const windowStart = now - config.windowMs;

  // Use Redis sorted set for sliding window
  // This is more complex but more accurate
  try {
    // For now, use the simpler approach
    return checkRateLimitRedis(key, config);
  } catch (error) {
    logger.error('Sliding window rate limit error, falling back to local', error as Error);
    return checkRateLimitLocal(key, config);
  }
}

// Export for backwards compatibility
export type { RateLimitConfig };
