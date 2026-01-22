/**
 * Shared Error Module
 * ===================
 *
 * Centralized error handling for the application.
 *
 * @module domains/shared/errors
 *
 * @example
 * ```typescript
 * import {
 *   AppError,
 *   NotFoundError,
 *   ValidationError,
 *   Errors,
 *   handleApiError,
 *   assertOrThrow,
 * } from '@/domains/shared/errors';
 *
 * // Throw specific errors
 * throw new NotFoundError('Patient', patientId);
 * throw new ValidationError('Invalid input', [{ field: 'email', message: 'Invalid email' }]);
 *
 * // Use factory functions
 * throw Errors.patientNotFound(patientId);
 * throw Errors.unauthorized('Token expired');
 *
 * // Handle errors in API routes
 * try {
 *   await someOperation();
 * } catch (error) {
 *   return handleApiError(error);
 * }
 *
 * // Assert and throw
 * const patient = await repo.findById(id);
 * assertOrThrow(patient, Errors.patientNotFound(id));
 * // patient is now guaranteed non-null
 * ```
 */

// Error classes
export {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  ExternalServiceError,
  ServiceUnavailableError,
  DatabaseError,
  AuthenticationError,
  BusinessRuleError,
  IntegrationError,
  type ValidationErrorDetail,
} from './AppError';

// Type guards
export { isAppError, isOperationalError } from './AppError';

// Error factories
export { Errors } from './AppError';

// Error handler
export {
  handleApiError,
  withErrorHandler,
  assertOrThrow,
  getUserMessage,
} from './handler';
