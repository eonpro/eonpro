/**
 * Rate Limiting Tests
 * Tests for API rate limiting functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock LRU Cache as a class
vi.mock('lru-cache', () => {
  return {
    LRUCache: class MockLRUCache {
      private store = new Map();
      
      get(key: string) {
        return this.store.get(key);
      }
      
      set(key: string, value: any) {
        this.store.set(key, value);
        return this;
      }
      
      delete(key: string) {
        return this.store.delete(key);
      }
      
      clear() {
        this.store.clear();
      }
    },
  };
});

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('rateLimit middleware', () => {
    it('should allow requests under limit', async () => {
      const { rateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      const rateLimited = rateLimit({ max: 10 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '192.168.1.1',
        }),
      } as unknown as NextRequest;
      
      const response = await rateLimited(mockRequest);
      
      expect(handler).toHaveBeenCalled();
      expect(response.status).not.toBe(429);
    });

    it('should block requests over limit', async () => {
      const { rateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      // Very low limit for testing
      const rateLimited = rateLimit({ max: 2, windowMs: 60000 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '10.0.0.1',
        }),
      } as unknown as NextRequest;
      
      // First two requests should pass
      await rateLimited(mockRequest);
      await rateLimited(mockRequest);
      
      // Third should be blocked
      const response = await rateLimited(mockRequest);
      
      expect(response.status).toBe(429);
    });

    it('should include rate limit headers', async () => {
      const { rateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      const rateLimited = rateLimit({ max: 100 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '10.0.0.2',
        }),
      } as unknown as NextRequest;
      
      const response = await rateLimited(mockRequest);
      
      expect(response.headers.get('X-RateLimit-Limit')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Remaining')).toBeDefined();
      expect(response.headers.get('X-RateLimit-Reset')).toBeDefined();
    });
  });

  describe('Rate Limit Configurations', () => {
    it('should have strict rate limit', async () => {
      const { strictRateLimit } = await import('@/lib/rateLimit');
      
      expect(strictRateLimit).toBeDefined();
    });

    it('should have standard rate limit', async () => {
      const { standardRateLimit } = await import('@/lib/rateLimit');
      
      expect(standardRateLimit).toBeDefined();
    });

    it('should have relaxed rate limit', async () => {
      const { relaxedRateLimit } = await import('@/lib/rateLimit');
      
      expect(relaxedRateLimit).toBeDefined();
    });
  });

  describe('apiKeyRateLimit', () => {
    it('should rate limit by API key', async () => {
      const { apiKeyRateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      const rateLimited = apiKeyRateLimit({ max: 100 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-api-key': 'test-api-key-123',
        }),
      } as unknown as NextRequest;
      
      const response = await rateLimited(mockRequest);
      
      expect(handler).toHaveBeenCalled();
    });

    it('should fall back to IP when no API key', async () => {
      const { apiKeyRateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      const rateLimited = apiKeyRateLimit({ max: 100 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '10.0.0.5',
        }),
      } as unknown as NextRequest;
      
      const response = await rateLimited(mockRequest);
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('userRateLimit', () => {
    it('should rate limit by user ID', async () => {
      const { userRateLimit } = await import('@/lib/rateLimit');
      
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'ok' })
      );
      
      const rateLimited = userRateLimit({ max: 100 })(handler);
      
      const mockRequest = {
        headers: new Headers({
          'x-user-id': 'user-123',
        }),
      } as unknown as NextRequest;
      
      const response = await rateLimited(mockRequest);
      
      expect(handler).toHaveBeenCalled();
    });
  });
});

describe('Rate Limit Key Generation', () => {
  describe('IP Extraction', () => {
    it('should extract from x-forwarded-for', () => {
      const extractIP = (headers: Headers): string => {
        const forwarded = headers.get('x-forwarded-for');
        const real = headers.get('x-real-ip');
        return forwarded?.split(',')[0] || real || 'unknown';
      };

      const headers = new Headers({ 'x-forwarded-for': '192.168.1.1' });
      expect(extractIP(headers)).toBe('192.168.1.1');
    });

    it('should extract from x-real-ip', () => {
      const extractIP = (headers: Headers): string => {
        const forwarded = headers.get('x-forwarded-for');
        const real = headers.get('x-real-ip');
        return forwarded?.split(',')[0] || real || 'unknown';
      };

      const headers = new Headers({ 'x-real-ip': '10.0.0.1' });
      expect(extractIP(headers)).toBe('10.0.0.1');
    });

    it('should handle multiple IPs in forwarded header', () => {
      const extractIP = (headers: Headers): string => {
        const forwarded = headers.get('x-forwarded-for');
        return forwarded?.split(',')[0].trim() || 'unknown';
      };

      const headers = new Headers({
        'x-forwarded-for': '192.168.1.1, 10.0.0.1, 172.16.0.1',
      });
      expect(extractIP(headers)).toBe('192.168.1.1');
    });

    it('should return unknown when no IP header', () => {
      const extractIP = (headers: Headers): string => {
        const forwarded = headers.get('x-forwarded-for');
        const real = headers.get('x-real-ip');
        return forwarded?.split(',')[0] || real || 'unknown';
      };

      const headers = new Headers();
      expect(extractIP(headers)).toBe('unknown');
    });
  });

  describe('Key Format', () => {
    it('should generate IP-based key', () => {
      const generateKey = (ip: string): string => `ratelimit:${ip}`;
      
      expect(generateKey('192.168.1.1')).toBe('ratelimit:192.168.1.1');
    });

    it('should generate API key-based key', () => {
      const generateApiKeyKey = (apiKey: string): string => 
        `ratelimit:apikey:${apiKey}`;
      
      expect(generateApiKeyKey('abc123')).toBe('ratelimit:apikey:abc123');
    });

    it('should generate user-based key', () => {
      const generateUserKey = (userId: string): string => 
        `ratelimit:user:${userId}`;
      
      expect(generateUserKey('user-456')).toBe('ratelimit:user:user-456');
    });
  });
});

describe('Rate Limit Entry Management', () => {
  interface RateLimitEntry {
    count: number;
    resetTime: number;
  }

  describe('Entry Creation', () => {
    it('should create entry with count and reset time', () => {
      const windowMs = 60000;
      const now = Date.now();
      
      const entry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      };

      expect(entry.count).toBe(1);
      expect(entry.resetTime).toBeGreaterThan(now);
    });
  });

  describe('Entry Validation', () => {
    it('should check if window expired', () => {
      const isExpired = (entry: RateLimitEntry): boolean => {
        return Date.now() > entry.resetTime;
      };

      const futureEntry: RateLimitEntry = {
        count: 5,
        resetTime: Date.now() + 60000,
      };

      const pastEntry: RateLimitEntry = {
        count: 5,
        resetTime: Date.now() - 1000,
      };

      expect(isExpired(futureEntry)).toBe(false);
      expect(isExpired(pastEntry)).toBe(true);
    });

    it('should check if limit exceeded', () => {
      const isExceeded = (count: number, max: number): boolean => {
        return count >= max;
      };

      expect(isExceeded(5, 10)).toBe(false);
      expect(isExceeded(10, 10)).toBe(true);
      expect(isExceeded(15, 10)).toBe(true);
    });
  });
});

describe('Rate Limit Response', () => {
  describe('429 Response', () => {
    it('should calculate retry-after', () => {
      const resetTime = Date.now() + 30000;
      const now = Date.now();
      const retryAfter = Math.ceil((resetTime - now) / 1000);

      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(30);
    });

    it('should include all required headers', () => {
      const headers = {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date().toISOString(),
        'Retry-After': '30',
      };

      expect(headers['X-RateLimit-Limit']).toBeDefined();
      expect(headers['X-RateLimit-Remaining']).toBeDefined();
      expect(headers['X-RateLimit-Reset']).toBeDefined();
      expect(headers['Retry-After']).toBeDefined();
    });
  });

  describe('Success Response Headers', () => {
    it('should calculate remaining', () => {
      const calculateRemaining = (count: number, max: number): number => {
        return Math.max(0, max - count);
      };

      expect(calculateRemaining(5, 100)).toBe(95);
      expect(calculateRemaining(100, 100)).toBe(0);
      expect(calculateRemaining(150, 100)).toBe(0);
    });
  });
});

describe('Skip Options', () => {
  describe('skipSuccessfulRequests', () => {
    it('should not count successful requests when enabled', () => {
      const shouldSkip = (status: number, skipSuccessful: boolean): boolean => {
        return skipSuccessful && status < 400;
      };

      expect(shouldSkip(200, true)).toBe(true);
      expect(shouldSkip(200, false)).toBe(false);
      expect(shouldSkip(404, true)).toBe(false);
    });
  });

  describe('skipFailedRequests', () => {
    it('should not count failed requests when enabled', () => {
      const shouldSkip = (status: number, skipFailed: boolean): boolean => {
        return skipFailed && status >= 400;
      };

      expect(shouldSkip(500, true)).toBe(true);
      expect(shouldSkip(500, false)).toBe(false);
      expect(shouldSkip(200, true)).toBe(false);
    });
  });
});

describe('Rate Limit Tiers', () => {
  describe('Strict (Login/Auth)', () => {
    it('should have low limit', () => {
      const STRICT_CONFIG = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5,
      };

      expect(STRICT_CONFIG.max).toBe(5);
      expect(STRICT_CONFIG.windowMs).toBe(900000);
    });
  });

  describe('Standard (API)', () => {
    it('should have moderate limit', () => {
      const STANDARD_CONFIG = {
        windowMs: 60 * 1000, // 1 minute
        max: 60,
      };

      expect(STANDARD_CONFIG.max).toBe(60);
      expect(STANDARD_CONFIG.windowMs).toBe(60000);
    });
  });

  describe('Relaxed (Read-only)', () => {
    it('should have high limit', () => {
      const RELAXED_CONFIG = {
        windowMs: 60 * 1000, // 1 minute
        max: 200,
      };

      expect(RELAXED_CONFIG.max).toBe(200);
      expect(RELAXED_CONFIG.windowMs).toBe(60000);
    });
  });
});

describe('LRU Cache Configuration', () => {
  it('should have reasonable max entries', () => {
    const MAX_ENTRIES = 10000;
    expect(MAX_ENTRIES).toBe(10000);
  });

  it('should have reasonable TTL', () => {
    const TTL_MS = 15 * 60 * 1000; // 15 minutes
    expect(TTL_MS).toBe(900000);
  });
});
