/**
 * AppError Test Suite
 * ===================
 *
 * Tests for the shared error classes and utilities.
 */

import { describe, it, expect } from 'vitest';
import { ZodError, z } from 'zod';

import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
  RateLimitError,
  InternalError,
  DatabaseError,
  AuthenticationError,
  BusinessRuleError,
  IntegrationError,
  ExternalServiceError,
  isAppError,
  isOperationalError,
  Errors,
} from '@/domains/shared/errors';

describe('AppError', () => {
  describe('Base AppError', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test error', 'TEST_CODE', 400, true, {
        extra: 'context',
      });

      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
      expect(error.context).toEqual({ extra: 'context' });
      expect(error.timestamp).toBeInstanceOf(Date);
      expect(error.name).toBe('AppError');
    });

    it('should have default values', () => {
      const error = new AppError('Test', 'TEST');

      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.context).toBeUndefined();
    });

    it('should convert to JSON safely', () => {
      const error = new AppError('Test', 'TEST', 400);
      const json = error.toJSON();

      expect(json).toHaveProperty('error', 'Test');
      expect(json).toHaveProperty('code', 'TEST');
      expect(json).toHaveProperty('statusCode', 400);
      expect(json).toHaveProperty('timestamp');
      // Should NOT expose internal details
      expect(json).not.toHaveProperty('stack');
      expect(json).not.toHaveProperty('context');
    });

    it('should convert to log object with full details', () => {
      const error = new AppError('Test', 'TEST', 400, true, { foo: 'bar' });
      const logObj = error.toLogObject();

      expect(logObj).toHaveProperty('name', 'AppError');
      expect(logObj).toHaveProperty('message', 'Test');
      expect(logObj).toHaveProperty('code', 'TEST');
      expect(logObj).toHaveProperty('context', { foo: 'bar' });
      expect(logObj).toHaveProperty('stack');
    });
  });

  describe('HTTP Error Classes', () => {
    it('BadRequestError should have 400 status', () => {
      const error = new BadRequestError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('Invalid input');
    });

    it('UnauthorizedError should have 401 status', () => {
      const error = new UnauthorizedError();

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Authentication required');
    });

    it('ForbiddenError should have 403 status', () => {
      const error = new ForbiddenError();

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('Access denied');
    });

    it('NotFoundError should have 404 status', () => {
      const error = new NotFoundError('Patient', 123);

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('Patient not found: 123');
      expect(error.resourceType).toBe('Patient');
      expect(error.resourceId).toBe(123);
    });

    it('NotFoundError should work without arguments', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
    });

    it('ConflictError should have 409 status', () => {
      const error = new ConflictError('Email already exists');

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
    });

    it('ValidationError should have 422 status and include errors', () => {
      const errors = [
        { field: 'email', message: 'Invalid email' },
        { field: 'phone', message: 'Invalid phone' },
      ];
      const error = new ValidationError('Validation failed', errors);

      expect(error.statusCode).toBe(422);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual(errors);

      const json = error.toJSON();
      expect(json.errors).toEqual(errors);
    });

    it('RateLimitError should have 429 status', () => {
      const error = new RateLimitError('Too many requests', 60);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(error.retryAfter).toBe(60);
    });
  });

  describe('Server Error Classes', () => {
    it('InternalError should be non-operational', () => {
      const error = new InternalError('Something broke');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.isOperational).toBe(false);
    });

    it('ExternalServiceError should have 502 status', () => {
      const error = new ExternalServiceError('Stripe', 'Payment failed');

      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.serviceName).toBe('Stripe');
    });

    it('DatabaseError should have 500 status', () => {
      const error = new DatabaseError('Connection failed');

      expect(error.statusCode).toBe(500);
      expect(error.code).toBe('DATABASE_ERROR');
    });
  });

  describe('Domain-Specific Error Classes', () => {
    it('AuthenticationError should include reason', () => {
      const error = new AuthenticationError('TOKEN_EXPIRED');

      expect(error.statusCode).toBe(401);
      expect(error.reason).toBe('TOKEN_EXPIRED');
      expect(error.message).toBe('Authentication token has expired');
    });

    it('BusinessRuleError should include rule name', () => {
      const error = new BusinessRuleError(
        'MAX_PATIENTS',
        'Patient limit exceeded for this plan'
      );

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('BUSINESS_RULE_VIOLATION');
      expect(error.rule).toBe('MAX_PATIENTS');
    });

    it('IntegrationError should include integration name', () => {
      const originalError = new Error('API timeout');
      const error = new IntegrationError(
        'Lifefile',
        'Failed to submit order',
        originalError
      );

      expect(error.statusCode).toBe(502);
      expect(error.code).toBe('INTEGRATION_ERROR');
      expect(error.integration).toBe('Lifefile');
      expect(error.originalError).toBe(originalError);
    });
  });

  describe('Type Guards', () => {
    it('isAppError should identify AppError instances', () => {
      expect(isAppError(new AppError('test', 'TEST'))).toBe(true);
      expect(isAppError(new NotFoundError())).toBe(true);
      expect(isAppError(new ValidationError('test'))).toBe(true);
      expect(isAppError(new Error('test'))).toBe(false);
      expect(isAppError('string error')).toBe(false);
      expect(isAppError(null)).toBe(false);
    });

    it('isOperationalError should identify operational errors', () => {
      expect(isOperationalError(new NotFoundError())).toBe(true);
      expect(isOperationalError(new ValidationError('test'))).toBe(true);
      expect(isOperationalError(new InternalError())).toBe(false);
      expect(isOperationalError(new Error('test'))).toBe(false);
    });
  });

  describe('Error Factory Functions', () => {
    it('should create NotFoundError for common resources', () => {
      expect(Errors.patientNotFound(1).message).toBe('Patient not found: 1');
      expect(Errors.providerNotFound(2).message).toBe('Provider not found: 2');
      expect(Errors.orderNotFound(3).message).toBe('Order not found: 3');
      expect(Errors.invoiceNotFound(4).message).toBe('Invoice not found: 4');
      expect(Errors.appointmentNotFound(5).message).toBe('Appointment not found: 5');
      expect(Errors.clinicNotFound(6).message).toBe('Clinic not found: 6');
      expect(Errors.userNotFound(7).message).toBe('User not found: 7');
    });

    it('should create other common errors', () => {
      expect(Errors.unauthorized('Custom message').message).toBe('Custom message');
      expect(Errors.forbidden('No access').message).toBe('No access');
      expect(Errors.badRequest('Bad input').code).toBe('BAD_REQUEST');
      expect(Errors.validation('Invalid', []).code).toBe('VALIDATION_ERROR');
      expect(Errors.conflict('Duplicate').code).toBe('CONFLICT');
      expect(Errors.rateLimit(30).retryAfter).toBe(30);
      expect(Errors.internal('Oops').isOperational).toBe(false);
      expect(Errors.database('DB error').code).toBe('DATABASE_ERROR');
      expect(Errors.external('Stripe', 'Failed').serviceName).toBe('Stripe');
    });
  });

  describe('Error inheritance', () => {
    it('all errors should be instances of Error', () => {
      expect(new AppError('test', 'TEST')).toBeInstanceOf(Error);
      expect(new NotFoundError()).toBeInstanceOf(Error);
      expect(new ValidationError('test')).toBeInstanceOf(Error);
    });

    it('all errors should be instances of AppError', () => {
      expect(new BadRequestError()).toBeInstanceOf(AppError);
      expect(new UnauthorizedError()).toBeInstanceOf(AppError);
      expect(new ForbiddenError()).toBeInstanceOf(AppError);
      expect(new NotFoundError()).toBeInstanceOf(AppError);
      expect(new ConflictError()).toBeInstanceOf(AppError);
      expect(new ValidationError('test')).toBeInstanceOf(AppError);
      expect(new RateLimitError()).toBeInstanceOf(AppError);
      expect(new InternalError()).toBeInstanceOf(AppError);
      expect(new DatabaseError()).toBeInstanceOf(AppError);
      expect(new AuthenticationError('TOKEN_EXPIRED')).toBeInstanceOf(AppError);
    });

    it('errors should have proper stack traces', () => {
      const error = new NotFoundError('Patient', 1);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NotFoundError');
    });
  });
});
