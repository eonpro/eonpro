/**
 * Application Error Classes
 * =========================
 *
 * Standardized error classes for consistent error handling across the application.
 * These classes enable:
 * - Type-safe error handling
 * - Consistent API error responses
 * - Proper error logging and monitoring
 * - HIPAA-compliant error messages (no PHI in errors)
 *
 * @module domains/shared/errors
 * @version 1.0.0
 */

/**
 * Base application error class
 * All custom errors should extend this class
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, unknown>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    isOperational = true,
    context?: Record<string, unknown>
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Convert to JSON-safe object for API responses
   * IMPORTANT: Never include sensitive data in toJSON output
   */
  toJSON(): Record<string, unknown> {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
    };
  }

  /**
   * Convert to detailed object for logging (internal use only)
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isOperational: this.isOperational,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }
}

// ============================================================================
// HTTP Error Classes (4xx)
// ============================================================================

/**
 * 400 Bad Request - Invalid input data
 */
export class BadRequestError extends AppError {
  constructor(message = 'Bad request', context?: Record<string, unknown>) {
    super(message, 'BAD_REQUEST', 400, true, context);
  }
}

/**
 * 401 Unauthorized - Authentication required
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', context?: Record<string, unknown>) {
    super(message, 'UNAUTHORIZED', 401, true, context);
  }
}

/**
 * 403 Forbidden - Insufficient permissions
 */
export class ForbiddenError extends AppError {
  constructor(message = 'Access denied', context?: Record<string, unknown>) {
    super(message, 'FORBIDDEN', 403, true, context);
  }
}

/**
 * 404 Not Found - Resource not found
 */
export class NotFoundError extends AppError {
  public readonly resourceType?: string;
  public readonly resourceId?: string | number;

  constructor(resourceType?: string, resourceId?: string | number, message?: string) {
    let defaultMessage = 'Resource not found';
    if (resourceType) {
      defaultMessage =
        resourceId !== undefined
          ? `${resourceType} not found: ${String(resourceId)}`
          : `${resourceType} not found`;
    }

    super(message ?? defaultMessage, 'NOT_FOUND', 404, true, {
      resourceType,
      resourceId,
    });

    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * 409 Conflict - Resource conflict (duplicate, version mismatch)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', context?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, true, context);
  }
}

/**
 * 422 Unprocessable Entity - Validation errors
 */
export class ValidationError extends AppError {
  public readonly errors: ValidationErrorDetail[];

  constructor(message = 'Validation failed', errors: ValidationErrorDetail[] = []) {
    super(message, 'VALIDATION_ERROR', 422, true, { errors });
    this.errors = errors;
  }

  override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      errors: this.errors,
    };
  }
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code?: string;
  value?: unknown;
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  public readonly retryAfter?: number;

  constructor(message = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Server Error Classes (5xx)
// ============================================================================

/**
 * 500 Internal Server Error - Unexpected server error
 */
export class InternalError extends AppError {
  constructor(message = 'Internal server error', context?: Record<string, unknown>) {
    // isOperational = false because this indicates a bug
    super(message, 'INTERNAL_ERROR', 500, false, context);
  }
}

/**
 * 502 Bad Gateway - External service error
 */
export class ExternalServiceError extends AppError {
  public readonly serviceName: string;

  constructor(serviceName: string, message?: string, context?: Record<string, unknown>) {
    super(
      message ?? `External service error: ${serviceName}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      true,
      { ...context, serviceName }
    );
    this.serviceName = serviceName;
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  public readonly retryAfter?: number;

  constructor(message = 'Service temporarily unavailable', retryAfter?: number) {
    super(message, 'SERVICE_UNAVAILABLE', 503, true, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

// ============================================================================
// Domain-Specific Error Classes
// ============================================================================

/**
 * Database operation error
 */
export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', context?: Record<string, unknown>) {
    super(message, 'DATABASE_ERROR', 500, true, context);
  }
}

/**
 * Authentication/session error
 */
export class AuthenticationError extends AppError {
  public readonly reason:
    | 'INVALID_CREDENTIALS'
    | 'TOKEN_EXPIRED'
    | 'TOKEN_INVALID'
    | 'SESSION_EXPIRED'
    | 'MFA_REQUIRED'
    | 'ACCOUNT_LOCKED';

  constructor(
    reason:
      | 'INVALID_CREDENTIALS'
      | 'TOKEN_EXPIRED'
      | 'TOKEN_INVALID'
      | 'SESSION_EXPIRED'
      | 'MFA_REQUIRED'
      | 'ACCOUNT_LOCKED',
    message?: string
  ) {
    const defaultMessages: Record<string, string> = {
      INVALID_CREDENTIALS: 'Invalid email or password',
      TOKEN_EXPIRED: 'Authentication token has expired',
      TOKEN_INVALID: 'Invalid authentication token',
      SESSION_EXPIRED: 'Session has expired',
      MFA_REQUIRED: 'Multi-factor authentication required',
      ACCOUNT_LOCKED: 'Account is locked',
    };

    super(message ?? defaultMessages[reason], reason, 401, true);
    this.reason = reason;
  }
}

/**
 * Business rule violation error
 */
export class BusinessRuleError extends AppError {
  public readonly rule: string;

  constructor(rule: string, message: string, context?: Record<string, unknown>) {
    super(message, 'BUSINESS_RULE_VIOLATION', 400, true, { ...context, rule });
    this.rule = rule;
  }
}

/**
 * Integration/external API error
 */
export class IntegrationError extends AppError {
  public readonly integration: string;
  public readonly originalError?: unknown;

  constructor(
    integration: string,
    message: string,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message, 'INTEGRATION_ERROR', 502, true, {
      ...context,
      integration,
    });
    this.integration = integration;
    this.originalError = originalError;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if error is an AppError instance
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Check if error is operational (expected) vs programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}

// ============================================================================
// Error Factory Functions
// ============================================================================

/**
 * Create NotFoundError for common resources
 */
export const Errors = {
  patientNotFound: (id?: string | number) => new NotFoundError('Patient', id),
  providerNotFound: (id?: string | number) => new NotFoundError('Provider', id),
  orderNotFound: (id?: string | number) => new NotFoundError('Order', id),
  invoiceNotFound: (id?: string | number) => new NotFoundError('Invoice', id),
  appointmentNotFound: (id?: string | number) => new NotFoundError('Appointment', id),
  clinicNotFound: (id?: string | number) => new NotFoundError('Clinic', id),
  userNotFound: (id?: string | number) => new NotFoundError('User', id),
  documentNotFound: (id?: string | number) => new NotFoundError('Document', id),
  ticketNotFound: (id?: string | number) => new NotFoundError('Ticket', id),

  unauthorized: (message?: string) => new UnauthorizedError(message),
  forbidden: (message?: string) => new ForbiddenError(message),
  badRequest: (message: string) => new BadRequestError(message),
  validation: (message: string, errors?: ValidationErrorDetail[]) =>
    new ValidationError(message, errors),
  conflict: (message: string) => new ConflictError(message),
  rateLimit: (retryAfter?: number) => new RateLimitError(undefined, retryAfter),
  internal: (message?: string) => new InternalError(message),
  database: (message?: string) => new DatabaseError(message),
  external: (service: string, message?: string) => new ExternalServiceError(service, message),
} as const;
