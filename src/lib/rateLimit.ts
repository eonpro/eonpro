/**
 * Rate Limiting Middleware
 * Protects API endpoints from abuse and DOS attacks
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

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

// Create different caches for different rate limit tiers
const caches = new Map<string, LRUCache<string, RateLimitEntry>>();

/**
 * Get or create a cache for a specific tier
 */
function getCache(tier: string): LRUCache<string, RateLimitEntry> {
  if (!caches.has(tier)) {
    caches.set(tier, new LRUCache<string, RateLimitEntry>({
      max: 10000, // Max number of keys to store
      ttl: 15 * 60 * 1000, // 15 minutes TTL
    }));
  }
  return caches.get(tier)!;
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: NextRequest): string {
  // Try to get real IP from various headers
  const forwarded = req.headers.get('x-forwarded-for');
  const real = req.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0] || real || 'unknown';
  
  return `ratelimit:${ip}`;
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

  return function rateLimitMiddleware(
    handler: (req: NextRequest) => Promise<Response>
  ) {
    return async (req: NextRequest) => {
      const key = keyGenerator(req);
      const cache = getCache('default');
      const now = Date.now();

      // Get current rate limit entry
      let entry = cache.get(key);

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
      cache.set(key, entry);

      // Process request
      const response = await handler(req);

      // Optionally skip counting based on response
      if (
        (skipSuccessfulRequests && response.status < 400) ||
        (skipFailedRequests && response.status >= 400)
      ) {
        entry.count--;
        cache.set(key, entry);
      }

      // Add rate limit headers to response
      const remaining = Math.max(0, max - entry.count);
      const modifiedResponse = new Response(response.body, response);
      modifiedResponse.headers.set('X-RateLimit-Limit', max.toString());
      modifiedResponse.headers.set('X-RateLimit-Remaining', remaining.toString());
      modifiedResponse.headers.set('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

      return modifiedResponse;
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
