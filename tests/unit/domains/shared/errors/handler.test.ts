/**
 * Error Handler Test Suite
 * ========================
 *
 * Tests for the API error handler utilities.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { ZodError, z } from 'zod';

import {
  handleApiError,
  withErrorHandler,
  assertOrThrow,
  getUserMessage,
  AppError,
  NotFoundError,
  ValidationError,
  BadRequestError,
  Errors,
} from '@/domains/shared/errors';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock Prisma client
vi.mock('@prisma/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@prisma/client')>();
  return {
    ...actual,
    Prisma: {
      ...actual.Prisma,
      PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
        code: string;
        meta?: Record<string, unknown>;
        constructor(message: string, { code, meta }: { code: string; meta?: Record<string, unknown> }) {
          super(message);
          this.code = code;
          this.meta = meta;
        }
      },
      PrismaClientUnknownRequestError: class extends Error {},
      PrismaClientValidationError: class extends Error {},
      PrismaClientInitializationError: class extends Error {},
    },
  };
});

describe('Error Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleApiError', () => {
    it('should handle AppError and return correct response', async () => {
      const error = new NotFoundError('Patient', 123);
      const response = handleApiError(error);

      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toBe('Patient not found: 123');
      expect(body.code).toBe('NOT_FOUND');
      expect(body.statusCode).toBe(404);
      expect(body.timestamp).toBeDefined();
    });

    it('should handle ValidationError with error details', async () => {
      const error = new ValidationError('Validation failed', [
        { field: 'email', message: 'Invalid email format' },
        { field: 'phone', message: 'Phone is required' },
      ]);

      const response = handleApiError(error);

      expect(response.status).toBe(422);

      const body = await response.json();
      expect(body.errors).toHaveLength(2);
      expect(body.errors[0].field).toBe('email');
    });

    it('should include requestId when provided', async () => {
      const error = new BadRequestError('Invalid input');
      const response = handleApiError(error, { requestId: 'req-123' });

      const body = await response.json();
      expect(body.requestId).toBe('req-123');
    });

    it('should handle ZodError', async () => {
      const schema = z.object({
        email: z.string().email(),
        age: z.number().min(0),
      });

      let zodError: ZodError | null = null;
      try {
        schema.parse({ email: 'invalid', age: -5 });
      } catch (e) {
        zodError = e as ZodError;
      }

      expect(zodError).not.toBeNull();

      const response = handleApiError(zodError!);

      expect(response.status).toBe(422);

      const body = await response.json();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.errors).toBeDefined();
      expect(body.errors.length).toBeGreaterThan(0);
    });

    it('should handle standard Error', async () => {
      const error = new Error('Something went wrong');
      const response = handleApiError(error);

      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should handle unknown error types', async () => {
      const response = handleApiError('string error');

      expect(response.status).toBe(500);

      const body = await response.json();
      expect(body.error).toBe('An unexpected error occurred');
    });

    it('should handle null/undefined errors', async () => {
      const response1 = handleApiError(null);
      const response2 = handleApiError(undefined);

      expect(response1.status).toBe(500);
      expect(response2.status).toBe(500);
    });

    it('should detect "not found" in error messages', async () => {
      const error = new Error('Record not found in database');
      const response = handleApiError(error);

      expect(response.status).toBe(404);
    });

    it('should detect "unauthorized" in error messages', async () => {
      const error = new Error('User is unauthorized');
      const response = handleApiError(error);

      expect(response.status).toBe(401);
    });

    it('should detect "forbidden" in error messages', async () => {
      const error = new Error('Access forbidden');
      const response = handleApiError(error);

      expect(response.status).toBe(403);
    });
  });

  describe('withErrorHandler', () => {
    it('should return handler result on success', async () => {
      const handler = withErrorHandler(async () => {
        return NextResponse.json({ success: true });
      });

      const response = await handler();

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
    });

    it('should catch and handle errors', async () => {
      const handler = withErrorHandler(async () => {
        throw new NotFoundError('Patient', 1);
      });

      const response = await handler();

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should pass through arguments', async () => {
      const handler = withErrorHandler(async (id: number, name: string) => {
        return NextResponse.json({ id, name });
      });

      const response = await handler(123, 'test');

      const body = await response.json();
      expect(body.id).toBe(123);
      expect(body.name).toBe('test');
    });
  });

  describe('assertOrThrow', () => {
    it('should not throw when value is present', () => {
      const value = { id: 1, name: 'Test' };

      expect(() => {
        assertOrThrow(value, Errors.patientNotFound(1));
      }).not.toThrow();
    });

    it('should throw when value is null', () => {
      expect(() => {
        assertOrThrow(null, Errors.patientNotFound(1));
      }).toThrow(NotFoundError);
    });

    it('should throw when value is undefined', () => {
      expect(() => {
        assertOrThrow(undefined, Errors.patientNotFound(1));
      }).toThrow(NotFoundError);
    });

    it('should narrow type after assertion', () => {
      interface Patient {
        id: number;
        name: string;
      }

      const maybePatient: Patient | null = { id: 1, name: 'Test' };

      assertOrThrow(maybePatient, Errors.patientNotFound(1));

      // TypeScript should now know maybePatient is Patient
      expect(maybePatient.id).toBe(1);
      expect(maybePatient.name).toBe('Test');
    });
  });

  describe('getUserMessage', () => {
    it('should return message from AppError', () => {
      const error = new NotFoundError('Patient', 1);
      expect(getUserMessage(error)).toBe('Patient not found: 1');
    });

    it('should return message from standard Error in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Detailed error message');
      expect(getUserMessage(error)).toBe('Detailed error message');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return generic message from standard Error in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Detailed error message');
      expect(getUserMessage(error)).toBe('An unexpected error occurred');

      process.env.NODE_ENV = originalEnv;
    });

    it('should return generic message for unknown types', () => {
      expect(getUserMessage('string')).toBe('An unexpected error occurred');
      expect(getUserMessage(123)).toBe('An unexpected error occurred');
      expect(getUserMessage(null)).toBe('An unexpected error occurred');
    });
  });
});
