/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DOS attacks
 *
 * Uses Redis for distributed rate limiting in production,
 * with LRU cache fallback for development/testing
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import cache from '@/lib/cache/redis';
import { logger } from '@/lib/logger';

interface RateLimitConfig {
  windowMs?: number; // Time window in milliseconds
  max?: number; // Max requests per window
  message?: string; // Error message when rate limited
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Rate limit namespace for Redis
const RATE_LIMIT_NAMESPACE = 'ratelimit';

// Create different caches for different rate limit tiers (fallback)
const localCaches = new Map<string, LRUCache<string, RateLimitEntry>>();

/**
 * Get or create a local cache for a specific tier (fallback when Redis unavailable)
 */
function getLocalCache(tier: string): LRUCache<string, RateLimitEntry> {
  if (!localCaches.has(tier)) {
    localCaches.set(
      tier,
      new LRUCache<string, RateLimitEntry>({
        max: 10000, // Max number of keys to store
        ttl: 15 * 60 * 1000, // 15 minutes TTL
      })
    );
  }
  return localCaches.get(tier)!;
}

/**
 * Get rate limit entry from Redis or local cache
 */
async function getRateLimitEntry(key: string, tier: string): Promise<RateLimitEntry | null> {
  // Try Redis first
  if (cache.isReady()) {
    try {
      const entry = await cache.get<RateLimitEntry>(key, { namespace: RATE_LIMIT_NAMESPACE });
      return entry;
    } catch (err) {
      logger.warn('Redis rate limit read failed, using local cache');
    }
  }

  // Fallback to local cache
  const localCache = getLocalCache(tier);
  return localCache.get(key) || null;
}

/**
 * Set rate limit entry in Redis or local cache
 */
async function setRateLimitEntry(
  key: string,
  entry: RateLimitEntry,
  tier: string,
  ttlSeconds: number
): Promise<void> {
  // Try Redis first
  if (cache.isReady()) {
    try {
      await cache.set(key, entry, { namespace: RATE_LIMIT_NAMESPACE, ttl: ttlSeconds });
      return;
    } catch (err) {
      logger.warn('Redis rate limit write failed, using local cache');
    }
  }

  // Fallback to local cache
  const localCache = getLocalCache(tier);
  localCache.set(key, entry);
}

/**
 * Default key generator - uses IP address.
 * When x-clinic-id is present, key includes clinicId so rate limits are per-tenant (no cross-tenant exhaustion).
 */
function defaultKeyGenerator(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const real = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0]?.trim() || real || 'unknown';
  const clinicId = req.headers.get('x-clinic-id');
  if (clinicId != null && clinicId !== '') {
    return `ratelimit:${clinicId}:ip:${ip}`;
  }
  return `ratelimit:ip:${ip}`;
}

/**
 * Main rate limiting middleware
 */
export function rateLimit(config: RateLimitConfig = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    max = 100, // 100 requests per minute default
    message = 'Too many requests, please try again later.',
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = config;

  const tier = `default-${max}-${windowMs}`;
  const ttlSeconds = Math.ceil(windowMs / 1000);

  return function rateLimitMiddleware(handler: (req: NextRequest) => Promise<Response>) {
    return async (req: NextRequest) => {
      try {
        const key = keyGenerator(req);
        const now = Date.now();

        // Get current rate limit entry (from Redis or local cache)
        let entry = await getRateLimitEntry(key, tier);

        // Initialize or reset if window expired
        if (!entry || now > entry.resetTime) {
          entry = {
            count: 0,
            resetTime: now + windowMs,
          };
        }

        // Check if limit exceeded
        if (entry.count >= max) {
          const retryAfter = Math.ceil((entry.resetTime - now) / 1000);

          logger.warn('Rate limit exceeded', {
            key,
            count: entry.count,
            max,
            retryAfter,
          });

          return NextResponse.json(
            { error: message },
            {
              status: 429,
              headers: {
                'X-RateLimit-Limit': max.toString(),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
                'Retry-After': retryAfter.toString(),
              },
            }
          );
        }

        // Increment counter before processing
        entry.count++;
        await setRateLimitEntry(key, entry, tier, ttlSeconds);

        // Process request
        const response = await handler(req);

        // Optionally skip counting based on response
        if (
          (skipSuccessfulRequests && response.status < 400) ||
          (skipFailedRequests && response.status >= 400)
        ) {
          entry.count--;
          await setRateLimitEntry(key, entry, tier, ttlSeconds);
        }

        // Add rate limit headers to response.
        // Clone the response to safely append headers without disturbing the body stream.
        // Using `new Response(response.body, response)` can fail when the body has already
        // been transferred through another Response wrapper (e.g. addSecurityHeaders in auth
        // middleware), leaving the stream locked/disturbed.
        const remaining = Math.max(0, max - entry.count);
        const clonedHeaders = new Headers(response.headers);
        clonedHeaders.set('X-RateLimit-Limit', max.toString());
        clonedHeaders.set('X-RateLimit-Remaining', remaining.toString());
        clonedHeaders.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: clonedHeaders,
        });
      } catch (error) {
        // Rate limiter should never cause a route to fail — log and passthrough
        logger.error('[RateLimit] Unhandled error in rate limit middleware', {
          error: error instanceof Error ? error.message : String(error),
        });

        // Attempt to call handler without rate limiting as fallback
        try {
          return await handler(req);
        } catch (innerError) {
          // Handler itself failed — return a generic 500
          return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
          );
        }
      }
    };
  };
}

/**
 * Strict rate limit for sensitive endpoints (login, password reset)
 */
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per 15 minutes
  message: 'Too many attempts. Please try again in 15 minutes.',
});

/**
 * Standard rate limit for API endpoints
 */
export const standardRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
});

/**
 * Relaxed rate limit for read-only endpoints
 */
export const relaxedRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute
});

/**
 * Rate limit for super-admin endpoints (analytics, global queries).
 * These are expensive cross-tenant queries that should be called infrequently.
 */
export const superAdminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute
  message: 'Too many admin requests. Please try again shortly.',
});

/**
 * Rate limit by API key for external integrations
 */
export function apiKeyRateLimit(config: Omit<RateLimitConfig, 'keyGenerator'> = {}) {
  return rateLimit({
    ...config,
    keyGenerator: (req: NextRequest) => {
      const apiKey = req.headers.get('x-api-key');
      return apiKey ? `ratelimit:apikey:${apiKey}` : defaultKeyGenerator(req);
    },
  });
}

/**
 * Rate limit by user ID for authenticated endpoints
 */
export function userRateLimit(config: Omit<RateLimitConfig, 'keyGenerator'> = {}) {
  return rateLimit({
    ...config,
    keyGenerator: (req: NextRequest) => {
      const userId = req.headers.get('x-user-id');
      return userId ? `ratelimit:user:${userId}` : defaultKeyGenerator(req);
    },
  });
}

/**
 * Combine rate limiting with authentication
 */
export function withRateLimitAndAuth(
  authMiddleware: Function,
  rateLimitConfig: RateLimitConfig = {}
) {
  const rateLimiter = rateLimit(rateLimitConfig);

  return (handler: Function) => {
    return rateLimiter(async (req: NextRequest) => {
      return authMiddleware(handler)(req);
    });
  };
}
