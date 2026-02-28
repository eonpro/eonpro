/**
 * API Error Handler
 * =================
 *
 * Centralized error handling for API routes.
 * Converts errors to consistent JSON responses with proper status codes.
 *
 * @module domains/shared/errors/handler
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';

import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';

import { logger } from '@/lib/logger';

import {
  AppError,
  BadRequestError,
  ConflictError,
  DatabaseError,
  ForbiddenError,
  InternalError,
  isAppError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
  type ValidationErrorDetail,
} from './AppError';
import { TenantContextRequiredError } from '@/lib/tenant-context-errors';

// ============================================================================
// Constants
// ============================================================================

const GENERIC_ERROR_MESSAGE = 'An unexpected error occurred';

// ============================================================================
// Types
// ============================================================================

interface ErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  requestId?: string;
  errors?: ValidationErrorDetail[];
  timestamp: string;
}

interface HandleApiErrorOptions {
  /** Request ID for tracing */
  requestId?: string;
  /** Whether to log the error */
  logError?: boolean;
  /** Additional context for logging */
  context?: Record<string, unknown>;
  /** Route identifier for error tracking (e.g., 'GET /api/tickets/stats') */
  route?: string;
}

// ============================================================================
// Main Error Handler
// ============================================================================

/**
 * Handle errors in API routes and return appropriate NextResponse
 *
 * @example
 * ```typescript
 * export async function POST(req: NextRequest) {
 *   try {
 *     const data = await someOperation();
 *     return NextResponse.json(data);
 *   } catch (error) {
 *     return handleApiError(error);
 *   }
 * }
 * ```
 */
export function handleApiError(
  error: unknown,
  options: HandleApiErrorOptions = {}
): NextResponse<ErrorResponse> {
  const { requestId, logError = true, context, route } = options;
  const timestamp = new Date().toISOString();

  // Convert error to AppError if needed
  const appError = normalizeError(error);

  // Log error (skip operational client errors in production)
  if (logError && shouldLogError(appError)) {
    logErrorDetails(appError, { requestId, route, ...context });
  }

  // Build response
  const response: ErrorResponse = {
    error: appError.message,
    code: appError.code,
    statusCode: appError.statusCode,
    timestamp,
  };

  if (requestId) {
    response.requestId = requestId;
  }

  // Include validation errors if present
  if (appError instanceof ValidationError) {
    response.errors = appError.errors;
  }

  const headers = new Headers();
  if (
    appError instanceof ServiceUnavailableError &&
    appError.retryAfter != null &&
    appError.retryAfter > 0
  ) {
    headers.set('Retry-After', String(appError.retryAfter));
  }

  return NextResponse.json(response, { status: appError.statusCode, headers });
}

// ============================================================================
// Error Normalization
// ============================================================================

/**
 * Convert any error type to an AppError
 */
function normalizeError(error: unknown): AppError {
  // Already an AppError
  if (isAppError(error)) {
    return error;
  }

  // Tenant context missing — session likely lacks clinicId (e.g. after token refresh).
  // Return 403 so the client can prompt re-login instead of showing a generic 500.
  if (error instanceof TenantContextRequiredError) {
    return new ForbiddenError(
      'Clinic context is required. Please log in again.'
    );
  }

  // Zod validation errors
  if (error instanceof ZodError) {
    return convertZodError(error);
  }

  // Prisma errors
  if (isPrismaError(error)) {
    return convertPrismaError(error);
  }

  // Standard Error
  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('not found')) {
      return new NotFoundError(undefined, undefined, error.message);
    }

    if (message.includes('unauthorized') || message.includes('authentication')) {
      return new AppError(error.message, 'UNAUTHORIZED', 401);
    }

    if (message.includes('forbidden') || message.includes('permission')) {
      return new AppError(error.message, 'FORBIDDEN', 403);
    }

    // P2024 / connection pool - return 503 so clients can retry instead of treating as 500
    if (
      message.includes('p2024') ||
      message.includes('connection pool') ||
      message.includes('timed out fetching')
    ) {
      return new ServiceUnavailableError(
        'Service is busy. Please try again in a moment.',
        10
      );
    }

    // Unknown error - treat as internal
    return new InternalError(
      process.env.NODE_ENV === 'production' ? GENERIC_ERROR_MESSAGE : error.message
    );
  }

  // Unknown error type
  return new InternalError(GENERIC_ERROR_MESSAGE);
}

/**
 * Convert Zod validation errors to ValidationError
 */
function convertZodError(error: ZodError): ValidationError {
  const errors: ValidationErrorDetail[] = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return new ValidationError('Validation failed', errors);
}

/**
 * Check if error is a Prisma error
 */
function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError ||
    error instanceof Prisma.PrismaClientUnknownRequestError ||
    error instanceof Prisma.PrismaClientValidationError ||
    error instanceof Prisma.PrismaClientInitializationError
  );
}

/**
 * Convert Prisma errors to appropriate AppError
 *
 * Connection-related errors (P1xxx) return 503 Service Unavailable
 * to properly indicate the service is temporarily unavailable.
 */
function convertPrismaError(
  error:
    | Prisma.PrismaClientKnownRequestError
    | Prisma.PrismaClientUnknownRequestError
    | Prisma.PrismaClientValidationError
    | Prisma.PrismaClientInitializationError
): AppError {
  // Known request errors
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      // Unique constraint violation
      case 'P2002': {
        const metaTarget = error.meta?.target;
        const targetArr = Array.isArray(metaTarget) ? metaTarget : [];
        const targetStr = typeof metaTarget === 'string' ? metaTarget : targetArr.join(', ');
        const isPatientConstraint =
          targetArr.some(
            (t) =>
              typeof t === 'string' &&
              ['clinicId', 'patientId', 'email'].some((k) => t.toLowerCase().includes(k))
          ) || targetStr.toLowerCase().includes('patient');
        return new ConflictError(
          isPatientConstraint ? 'This patient already exists.' : `A record with this ${targetStr || 'field'} already exists`
        );
      }

      // Foreign key constraint violation
      case 'P2003': {
        const fieldName = error.meta?.field_name as string | undefined;
        return new BadRequestError(
          fieldName
            ? `Cannot complete operation: related records exist (${fieldName})`
            : 'Cannot complete operation: related records still exist'
        );
      }

      // Record not found
      case 'P2001':
      case 'P2025':
        return new NotFoundError();

      // Required field missing
      case 'P2011':
      case 'P2012':
        return new BadRequestError('Required field is missing');

      // Value too long
      case 'P2000':
        return new BadRequestError('Input value is too long');

      // =====================================================
      // SCHEMA MISMATCH ERRORS - Return 503 Service Unavailable
      // These indicate migrations need to be applied
      // =====================================================

      // P2010: Raw query failed (often schema mismatch)
      case 'P2010':
        return new ServiceUnavailableError(
          'Database schema update in progress. Please try again in a moment.',
          10
        );

      // P2021: Table does not exist
      case 'P2021':
        return new ServiceUnavailableError(
          'System update in progress. Please try again in a moment.',
          10
        );

      // P2022: Column does not exist
      case 'P2022':
        return new ServiceUnavailableError(
          'System update in progress. Please try again in a moment.',
          10
        );

      // =====================================================
      // CONNECTION ERRORS - Return 503 Service Unavailable
      // These indicate the database is temporarily unavailable
      // =====================================================

      // P1001: Can't reach database server
      case 'P1001':
        return new ServiceUnavailableError(
          'Database server is unreachable. Please try again in a moment.',
          5 // Retry after 5 seconds
        );

      // P1002: Database server timed out
      case 'P1002':
        return new ServiceUnavailableError('Database connection timed out. Please try again.', 5);

      // P1008: Operations timed out
      case 'P1008':
        return new ServiceUnavailableError('Database operation timed out. Please try again.', 5);

      // P1017: Server closed the connection
      case 'P1017':
        return new ServiceUnavailableError('Database connection was closed. Please try again.', 3);

      // P2024: Connection pool exhausted (timed out waiting for a connection)
      case 'P2024':
        return new ServiceUnavailableError(
          'Service is busy. Please try again in a moment.',
          10 // Retry-After: 10 seconds
        );

      // Default - check for connection/pool errors that may slip through
      default: {
        const code = String(error.code || '');
        const msg = (error.message || '').toLowerCase();
        const isPoolOrConnection =
          code === 'P2024' ||
          code.includes('P2024') ||
          msg.includes('p2024') ||
          msg.includes('connection pool') ||
          msg.includes('timed out fetching');
        if (isPoolOrConnection) {
          return new ServiceUnavailableError(
            'Service is busy. Please try again in a moment.',
            10
          );
        }
        return new DatabaseError(`Database error: ${error.code}`);
      }
    }
  }

  // Validation errors - check if it's a schema mismatch
  if (error instanceof Prisma.PrismaClientValidationError) {
    const errorMessage = error.message.toLowerCase();
    // Schema mismatch indicators
    if (
      errorMessage.includes('unknown field') ||
      errorMessage.includes('unknown argument') ||
      errorMessage.includes('does not exist') ||
      errorMessage.includes('unknown type')
    ) {
      return new ServiceUnavailableError(
        'System update in progress. Please try again in a moment.',
        10
      );
    }
    return new BadRequestError('Invalid data format');
  }

  // Initialization errors - treat as 503 since DB isn't ready
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ServiceUnavailableError(
      'Database is initializing. Please try again in a moment.',
      10
    );
  }

  // Unknown Prisma error - check for connection-related messages
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
  if (
    errorMessage.includes('connection') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('econnrefused') ||
    errorMessage.includes('econnreset') ||
    errorMessage.includes('pool')
  ) {
    return new ServiceUnavailableError('Database connection issue. Please try again.', 5);
  }

  return new DatabaseError('Database operation failed');
}

// ============================================================================
// Logging
// ============================================================================

/**
 * Determine if error should be logged
 */
function shouldLogError(error: AppError): boolean {
  // Always log server errors
  if (error.statusCode >= 500) {
    return true;
  }

  // Log non-operational errors (bugs)
  if (!error.isOperational) {
    return true;
  }

  // In development, log everything
  if (process.env.NODE_ENV === 'development') {
    return true;
  }

  // Skip common client errors in production
  const skipCodes = ['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_ERROR'];
  return !skipCodes.includes(error.code);
}

/**
 * Log error details
 */
function logErrorDetails(error: AppError, context?: Record<string, unknown>): void {
  const logData = {
    ...error.toLogObject(),
    ...context,
  };

  if (error.statusCode >= 500 || !error.isOperational) {
    logger.error(`[${error.code}] ${error.message}`, error, logData);
  } else {
    logger.warn(`[${error.code}] ${error.message}`, logData);
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap async handler with error handling
 *
 * @example
 * ```typescript
 * export const GET = withErrorHandler(async (req) => {
 *   const data = await someOperation();
 *   return NextResponse.json(data);
 * });
 * ```
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
): (...args: T) => Promise<NextResponse> {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

/**
 * Global API handler wrapper - use for ALL API routes.
 * Catches errors, adds requestId, returns structured response via handleApiError.
 * Automatically adds Sentry tracing and emits request-level metrics.
 *
 * Use with or without auth:
 *   export const GET = withApiHandler(handler);
 *   export const GET = withAuth(withApiHandler(handler));
 *
 * Note: withAuth already uses handleApiError in its catch - use withApiHandler
 * for routes that don't use withAuth (webhooks, public, etc).
 */
export function withApiHandler<
  T extends [NextRequest, ...unknown[]],
  R extends Promise<Response>,
>(
  handler: (...args: T) => R
): (...args: T) => Promise<Response> {
  return async (...args: T): Promise<Response> => {
    const req = args[0] as NextRequest;
    const requestId = req?.headers?.get?.('x-request-id') ?? crypto.randomUUID();
    const route = req ? `${req.method} ${new URL(req.url).pathname}` : 'unknown';
    const startTime = Date.now();

    try {
      // Lazy-load Sentry to avoid circular deps and keep this file lightweight
      const Sentry = await import('@sentry/nextjs');

      return await Sentry.startSpan(
        {
          name: route,
          op: 'http.server',
          attributes: {
            'http.method': req?.method || 'UNKNOWN',
            'http.url': req ? new URL(req.url).pathname : 'unknown',
            'http.request_id': requestId,
          },
        },
        async () => {
          try {
            const response = await handler(...args);
            const durationMs = Date.now() - startTime;

            // Emit request metrics for Sentry dashboards
            try {
              const { emitRequestMetrics } = await import('@/lib/observability/metrics');
              const statusCode = response instanceof Response ? response.status : 200;
              emitRequestMetrics({
                route: req ? new URL(req.url).pathname : 'unknown',
                method: req?.method || 'UNKNOWN',
                statusCode,
                durationMs,
                queryCount: 0,
                dbTimeMs: 0,
              });
            } catch {
              // Metrics module not available
            }

            return response;
          } catch (error) {
            Sentry.captureException(error);
            throw error;
          }
        }
      );
    } catch (error) {
      return handleApiError(error, {
        requestId,
        route,
      });
    }
  };
}

/**
 * Assert condition and throw error if false
 *
 * @example
 * ```typescript
 * assertOrThrow(patient, Errors.patientNotFound(id));
 * // patient is now non-null
 * ```
 */
export function assertOrThrow<T>(value: T | null | undefined, error: AppError): asserts value is T {
  if (value === null || value === undefined) {
    throw error;
  }
}

/**
 * Extract user-safe error message
 */
export function getUserMessage(error: unknown): string {
  if (isAppError(error)) {
    return error.message;
  }

  if (error instanceof Error) {
    // Don't expose internal error messages in production
    if (process.env.NODE_ENV === 'production') {
      return GENERIC_ERROR_MESSAGE;
    }
    return error.message;
  }

  return GENERIC_ERROR_MESSAGE;
}
