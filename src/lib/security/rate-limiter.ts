/**
 * Rate Limiting Service
 * Prevents abuse and brute force attacks
 * HIPAA requirement for access control
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

// In-memory storage (use Redis in production)
const attempts = new Map<string, { count: number; firstAttempt: number; blocked: boolean }>();

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  
  for (const [key, value] of attempts.entries()) {
    if (value.firstAttempt < oneHourAgo) {
      attempts.delete(key);
    }
  }
}, 60000); // Clean every minute

interface RateLimitConfig {
  windowMs: number;     // Time window in milliseconds
  maxAttempts: number;   // Max attempts in window
  blockDuration: number; // Block duration after limit exceeded
  keyGenerator?: (req: NextRequest) => string; // Custom key generator
}

// Default configurations for different endpoints
export const RATE_LIMIT_CONFIGS = {
  // Strict limit for login attempts
  login: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxAttempts: 3,            // 3 attempts
    blockDuration: 30 * 60 * 1000, // 30 minutes block
  },
  
  // PHI access endpoints
  phiAccess: {
    windowMs: 60 * 1000,       // 1 minute
    maxAttempts: 30,           // 30 requests per minute
    blockDuration: 5 * 60 * 1000, // 5 minutes block
  },
  
  // Document upload
  upload: {
    windowMs: 60 * 1000,       // 1 minute
    maxAttempts: 5,            // 5 uploads per minute
    blockDuration: 10 * 60 * 1000, // 10 minutes block
  },
  
  // API general
  api: {
    windowMs: 60 * 1000,       // 1 minute
    maxAttempts: 100,          // 100 requests per minute
    blockDuration: 60 * 1000,  // 1 minute block
  },
  
  // Password reset
  passwordReset: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxAttempts: 3,            // 3 attempts per hour
    blockDuration: 60 * 60 * 1000, // 1 hour block
  }
};

/**
 * Get rate limit key for request
 */
function getKey(req: NextRequest, keyGenerator?: (req: NextRequest) => string): string {
  if (keyGenerator) {
    return keyGenerator(req);
  }
  
  // Default: IP + path
  const ip = req.headers.get('x-forwarded-for') || 
             req.headers.get('x-real-ip') || 
             'unknown';
  const path = new URL(req.url).pathname;
  
  return `${ip}:${path}`;
}

/**
 * Check if request should be rate limited
 */
export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const key = getKey(req, config.keyGenerator);
  const now = Date.now();
  
  // Get or create attempt record
  let record = attempts.get(key);
  
  if (!record) {
    record = { count: 1, firstAttempt: now, blocked: false };
    attempts.set(key, record);
    
    return {
      allowed: true,
      remaining: config.maxAttempts - 1
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
        remaining: config.maxAttempts - 1
      };
    }
    
    // Still blocked
    return {
      allowed: false,
      retryAfter: Math.ceil((blockExpiry - now) / 1000)
    };
  }
  
  // Check if window expired
  if (now - record.firstAttempt > config.windowMs) {
    // Reset window
    record.count = 1;
    record.firstAttempt = now;
    
    return {
      allowed: true,
      remaining: config.maxAttempts - 1
    };
  }
  
  // Increment count
  record.count++;
  
  // Check if limit exceeded
  if (record.count > config.maxAttempts) {
    record.blocked = true;
    
    logger.security('Rate limit exceeded', {
      key,
      attempts: record.count,
      maxAttempts: config.maxAttempts,
      blocked: true
    });
    
    return {
      allowed: false,
      retryAfter: Math.ceil(config.blockDuration / 1000)
    };
  }
  
  return {
    allowed: true,
    remaining: config.maxAttempts - record.count
  };
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(
  handler: (req: NextRequest, ...args: any[]) => Promise<Response>,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.api
) {
  return async (req: NextRequest, ...args: any[]) => {
    const { allowed, retryAfter, remaining } = checkRateLimit(req, config);
    
    if (!allowed) {
      logger.warn('Rate limit blocked request', {
        path: new URL(req.url).pathname,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        retryAfter
      });
      
      return NextResponse.json(
        { 
          error: 'Too many requests', 
          retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(config.maxAttempts),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + (retryAfter || 0) * 1000)
          }
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
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(key: string): {
  attempts: number;
  blocked: boolean;
  firstAttempt?: number;
} | null {
  const record = attempts.get(key);
  
  if (!record) {
    return null;
  }
  
  return {
    attempts: record.count,
    blocked: record.blocked,
    firstAttempt: record.firstAttempt
  };
}
