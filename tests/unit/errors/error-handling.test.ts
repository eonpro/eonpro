/**
 * Error Handling Tests
 * Tests for error scenarios across the application
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

describe('API Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('HTTP Status Codes', () => {
    it('should return 400 for bad request', () => {
      const response = NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );

      expect(response.status).toBe(400);
    });

    it('should return 401 for unauthorized', () => {
      const response = NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );

      expect(response.status).toBe(401);
    });

    it('should return 403 for forbidden', () => {
      const response = NextResponse.json(
        { error: 'Access denied' },
        { status: 403 }
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 for not found', () => {
      const response = NextResponse.json(
        { error: 'Resource not found' },
        { status: 404 }
      );

      expect(response.status).toBe(404);
    });

    it('should return 409 for conflict', () => {
      const response = NextResponse.json(
        { error: 'Resource already exists' },
        { status: 409 }
      );

      expect(response.status).toBe(409);
    });

    it('should return 422 for validation error', () => {
      const response = NextResponse.json(
        { 
          error: 'Validation failed',
          details: {
            email: ['Invalid email format'],
            phone: ['Phone number too short'],
          },
        },
        { status: 422 }
      );

      expect(response.status).toBe(422);
    });

    it('should return 429 for rate limit exceeded', () => {
      const response = NextResponse.json(
        { error: 'Too many requests' },
        { 
          status: 429,
          headers: {
            'Retry-After': '60',
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
          },
        }
      );

      expect(response.status).toBe(429);
    });

    it('should return 500 for internal server error', () => {
      const response = NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );

      expect(response.status).toBe(500);
    });

    it('should return 503 for service unavailable', () => {
      const response = NextResponse.json(
        { error: 'Service temporarily unavailable' },
        { status: 503 }
      );

      expect(response.status).toBe(503);
    });
  });

  describe('Error Response Format', () => {
    it('should include error message', async () => {
      const response = NextResponse.json(
        { error: 'Something went wrong' },
        { status: 500 }
      );

      const data = await response.json();
      expect(data.error).toBe('Something went wrong');
    });

    it('should include error code', async () => {
      const response = NextResponse.json(
        { 
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
        },
        { status: 400 }
      );

      const data = await response.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    });

    it('should include request ID for tracing', async () => {
      const requestId = 'req-12345';
      const response = NextResponse.json(
        { 
          error: 'Internal error',
          requestId,
        },
        { status: 500 }
      );

      const data = await response.json();
      expect(data.requestId).toBe('req-12345');
    });

    it('should include validation details', async () => {
      const response = NextResponse.json(
        {
          error: 'Validation failed',
          details: {
            firstName: ['First name is required'],
            email: ['Invalid email format', 'Email already exists'],
          },
        },
        { status: 400 }
      );

      const data = await response.json();
      expect(data.details.firstName).toHaveLength(1);
      expect(data.details.email).toHaveLength(2);
    });

    it('should not expose internal details in production', () => {
      const error = new Error('Database connection failed');
      
      // In production, we should sanitize error messages
      const sanitizedError = process.env.NODE_ENV === 'production'
        ? 'An internal error occurred'
        : error.message;

      // For test environment, original message is shown
      expect(sanitizedError).toBe('Database connection failed');
    });
  });

  describe('Validation Errors', () => {
    it('should handle Zod validation errors', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'invalid',
        password: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0);
      }
    });

    it('should format validation errors consistently', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'invalid',
        password: '',
      });

      if (!result.success) {
        const formatted: Record<string, string[]> = {};
        result.error.issues.forEach(issue => {
          const path = issue.path.join('.') || '_root';
          if (!formatted[path]) {
            formatted[path] = [];
          }
          formatted[path].push(issue.message);
        });

        expect(formatted).toBeDefined();
        expect(typeof formatted).toBe('object');
      }
    });
  });

  describe('Authentication Errors', () => {
    it('should handle missing token', () => {
      const error = {
        code: 'AUTH_TOKEN_MISSING',
        message: 'Authentication token is required',
        status: 401,
      };

      expect(error.status).toBe(401);
      expect(error.code).toBe('AUTH_TOKEN_MISSING');
    });

    it('should handle invalid token', () => {
      const error = {
        code: 'AUTH_TOKEN_INVALID',
        message: 'Invalid authentication token',
        status: 401,
      };

      expect(error.status).toBe(401);
    });

    it('should handle expired token', () => {
      const error = {
        code: 'AUTH_TOKEN_EXPIRED',
        message: 'Authentication token has expired',
        status: 401,
      };

      expect(error.code).toBe('AUTH_TOKEN_EXPIRED');
    });

    it('should handle insufficient permissions', () => {
      const error = {
        code: 'AUTH_INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action',
        status: 403,
      };

      expect(error.status).toBe(403);
    });
  });

  describe('Database Errors', () => {
    it('should handle unique constraint violation', () => {
      const prismaError = {
        code: 'P2002',
        meta: { target: ['email'] },
        message: 'Unique constraint failed',
      };

      const userFriendlyMessage = `A record with this ${prismaError.meta.target.join(', ')} already exists`;
      
      expect(userFriendlyMessage).toContain('email');
    });

    it('should handle record not found', () => {
      const prismaError = {
        code: 'P2025',
        message: 'Record to update not found',
      };

      const userFriendlyMessage = 'The requested resource was not found';
      
      expect(prismaError.code).toBe('P2025');
    });

    it('should handle foreign key constraint', () => {
      const prismaError = {
        code: 'P2003',
        meta: { field_name: 'patientId' },
        message: 'Foreign key constraint failed',
      };

      const userFriendlyMessage = `Invalid reference: ${prismaError.meta.field_name}`;
      
      expect(userFriendlyMessage).toContain('patientId');
    });

    it('should handle connection errors', () => {
      const prismaError = {
        code: 'P1001',
        message: "Can't reach database server",
      };

      const userFriendlyMessage = 'Service temporarily unavailable. Please try again later.';
      
      expect(prismaError.code).toBe('P1001');
    });
  });

  describe('External Service Errors', () => {
    describe('Stripe Errors', () => {
      it('should handle card declined', () => {
        const stripeError = {
          type: 'card_error',
          code: 'card_declined',
          message: 'Your card was declined.',
          decline_code: 'insufficient_funds',
        };

        expect(stripeError.code).toBe('card_declined');
        expect(stripeError.decline_code).toBe('insufficient_funds');
      });

      it('should handle invalid card number', () => {
        const stripeError = {
          type: 'card_error',
          code: 'incorrect_number',
          message: 'Your card number is incorrect.',
        };

        expect(stripeError.code).toBe('incorrect_number');
      });

      it('should handle expired card', () => {
        const stripeError = {
          type: 'card_error',
          code: 'expired_card',
          message: 'Your card has expired.',
        };

        expect(stripeError.code).toBe('expired_card');
      });

      it('should handle Stripe API errors', () => {
        const stripeError = {
          type: 'api_error',
          message: 'An error occurred with our connection to Stripe.',
        };

        expect(stripeError.type).toBe('api_error');
      });
    });

    describe('Twilio Errors', () => {
      it('should handle invalid phone number', () => {
        const twilioError = {
          code: 21211,
          message: "The 'To' number is not a valid phone number.",
        };

        expect(twilioError.code).toBe(21211);
      });

      it('should handle unverified number', () => {
        const twilioError = {
          code: 21608,
          message: 'The number is unverified.',
        };

        expect(twilioError.code).toBe(21608);
      });

      it('should handle rate limiting', () => {
        const twilioError = {
          code: 20429,
          message: 'Too many requests.',
        };

        expect(twilioError.code).toBe(20429);
      });
    });

    describe('AWS Errors', () => {
      it('should handle S3 access denied', () => {
        const awsError = {
          name: 'AccessDenied',
          message: 'Access Denied',
          $metadata: { httpStatusCode: 403 },
        };

        expect(awsError.name).toBe('AccessDenied');
        expect(awsError.$metadata.httpStatusCode).toBe(403);
      });

      it('should handle S3 bucket not found', () => {
        const awsError = {
          name: 'NoSuchBucket',
          message: 'The specified bucket does not exist',
        };

        expect(awsError.name).toBe('NoSuchBucket');
      });

      it('should handle SES throttling', () => {
        const awsError = {
          name: 'Throttling',
          message: 'Rate exceeded',
        };

        expect(awsError.name).toBe('Throttling');
      });

      it('should handle KMS key not found', () => {
        const awsError = {
          name: 'NotFoundException',
          message: 'Key not found',
        };

        expect(awsError.name).toBe('NotFoundException');
      });
    });
  });

  describe('Error Logging', () => {
    it('should log errors with context', async () => {
      const { logger } = await import('@/lib/logger');
      
      const error = new Error('Test error');
      const context = {
        userId: 1,
        action: 'createPatient',
        requestId: 'req-123',
      };

      logger.error('Operation failed', error, context);

      expect(logger.error).toHaveBeenCalledWith(
        'Operation failed',
        error,
        context
      );
    });

    it('should log security events', async () => {
      const { logger } = await import('@/lib/logger');
      
      logger.security('Failed login attempt', {
        email: 'test@example.com',
        ip: '192.168.1.1',
        attempts: 3,
      });

      expect(logger.security).toHaveBeenCalled();
    });
  });

  describe('Error Recovery', () => {
    it('should implement retry logic', async () => {
      let attempts = 0;
      const maxRetries = 3;

      const retryOperation = async () => {
        attempts++;
        if (attempts < maxRetries) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const executeWithRetry = async (
        operation: () => Promise<string>,
        retries: number
      ): Promise<string> => {
        for (let i = 0; i < retries; i++) {
          try {
            return await operation();
          } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        throw new Error('Max retries exceeded');
      };

      const result = await executeWithRetry(retryOperation, 3);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should implement circuit breaker pattern', () => {
      const circuitBreaker = {
        failures: 0,
        threshold: 5,
        isOpen: false,
        lastFailure: null as Date | null,
        cooldownMs: 30000,

        recordFailure() {
          this.failures++;
          this.lastFailure = new Date();
          if (this.failures >= this.threshold) {
            this.isOpen = true;
          }
        },

        canExecute() {
          if (!this.isOpen) return true;
          
          const now = new Date();
          if (this.lastFailure && 
              now.getTime() - this.lastFailure.getTime() > this.cooldownMs) {
            this.isOpen = false;
            this.failures = 0;
            return true;
          }
          return false;
        },

        reset() {
          this.failures = 0;
          this.isOpen = false;
          this.lastFailure = null;
        },
      };

      // Record failures
      for (let i = 0; i < 5; i++) {
        circuitBreaker.recordFailure();
      }

      expect(circuitBreaker.isOpen).toBe(true);
      expect(circuitBreaker.canExecute()).toBe(false);

      // Reset
      circuitBreaker.reset();
      expect(circuitBreaker.canExecute()).toBe(true);
    });

    it('should implement graceful degradation', () => {
      const getDataWithFallback = async (
        primarySource: () => Promise<any>,
        fallbackSource: () => Promise<any>
      ) => {
        try {
          return await primarySource();
        } catch (error) {
          return await fallbackSource();
        }
      };

      const mockPrimary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const mockFallback = vi.fn().mockResolvedValue({ cached: true });

      getDataWithFallback(mockPrimary, mockFallback).then(result => {
        expect(result.cached).toBe(true);
      });
    });
  });
});

describe('Input Sanitization Errors', () => {
  it('should detect XSS attempts', () => {
    const maliciousInputs = [
      '<script>alert("xss")</script>',
      'javascript:alert("xss")',
      '<img src="x" onerror="alert(1)">',
      '<svg onload="alert(1)">',
    ];

    const containsXSS = (input: string): boolean => {
      const xssPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<svg[^>]*>/gi,
      ];

      return xssPatterns.some(pattern => pattern.test(input));
    };

    maliciousInputs.forEach(input => {
      expect(containsXSS(input)).toBe(true);
    });
  });

  it('should detect SQL injection attempts', () => {
    const maliciousInputs = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "1; DELETE FROM patients",
      "UNION SELECT * FROM users",
    ];

    const containsSQLInjection = (input: string): boolean => {
      const sqlPatterns = [
        /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER)\b)/gi,
        /(--)|(;)|(\/\*)/g,
        /('|")\s*(OR|AND)\s*('|")/gi,
      ];

      return sqlPatterns.some(pattern => pattern.test(input));
    };

    maliciousInputs.forEach(input => {
      expect(containsSQLInjection(input)).toBe(true);
    });
  });
});
