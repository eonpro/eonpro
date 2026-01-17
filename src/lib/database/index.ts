/**
 * DATABASE UTILITIES INDEX
 * 
 * Central export point for all database utilities
 * including schema validation and safe query wrappers
 */

export {
  validateDatabaseSchema,
  validateTableBeforeOperation,
  runStartupValidation,
  type SchemaValidationResult,
  type SchemaError,
  type SchemaWarning,
} from './schema-validator';

export {
  safeQuery,
  safeInvoiceQuery,
  safePaymentQuery,
  safePrescriptionQuery,
  safeBatchQuery,
  type SafeQueryOptions,
  type SafeQueryResult,
} from './safe-query';
