/**
 * SAFE DATABASE QUERY WRAPPER
 *
 * Wraps critical database queries with:
 * 1. Pre-query schema validation (optional)
 * 2. Automatic retry on transient failures
 * 3. Detailed error logging
 * 4. Query timeout protection
 *
 * Use this for CRITICAL operations like:
 * - Fetching invoices/payments (billing data)
 * - Fetching prescriptions (patient safety)
 * - Fetching SOAP notes (medical records)
 */

import { PrismaClient } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface SafeQueryOptions {
  /** Name of the operation for logging */
  operationName: string;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Timeout in milliseconds (default: 10000) */
  timeout?: number;
  /** Whether to validate schema before query (default: false for performance) */
  validateSchema?: boolean;
  /** Table name for schema validation */
  tableName?: string;
}

export interface SafeQueryResult<T> {
  success: boolean;
  data?: T;
  error?: {
    type: 'SCHEMA_ERROR' | 'QUERY_ERROR' | 'TIMEOUT' | 'UNKNOWN';
    message: string;
    retryable: boolean;
  };
  attempts: number;
  duration: number;
}

/**
 * Execute a database query with safety guards
 */
export async function safeQuery<T>(
  queryFn: () => Promise<T>,
  options: SafeQueryOptions
): Promise<SafeQueryResult<T>> {
  const {
    operationName,
    maxRetries = 3,
    timeout = 10000,
    validateSchema = false,
    tableName,
  } = options;

  const startTime = Date.now();
  let attempts = 0;
  let lastError: Error | null = null;

  // Schema validation (only if explicitly requested)
  if (validateSchema && tableName) {
    try {
      const { prisma } = await import('@/lib/db');
      const { validateTableBeforeOperation } = await import('./schema-validator');

      const schemaResult = await validateTableBeforeOperation(tableName as any, prisma);

      if (!schemaResult.valid) {
        logger.error(`[SafeQuery] Schema validation failed for ${operationName}`, {
          table: tableName,
          error: schemaResult.error,
        });

        return {
          success: false,
          error: {
            type: 'SCHEMA_ERROR',
            message: schemaResult.error || 'Schema validation failed',
            retryable: false,
          },
          attempts: 0,
          duration: Date.now() - startTime,
        };
      }
    } catch (error: any) {
      logger.warn(`[SafeQuery] Schema validation check failed`, { error: error.message });
      // Continue with query - don't block on validation failures
    }
  }

  // Retry loop
  while (attempts < maxRetries) {
    attempts++;

    try {
      // Execute with timeout
      const result = await Promise.race([
        queryFn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Query timeout')), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;

      if (attempts > 1) {
        logger.info(`[SafeQuery] ${operationName} succeeded after ${attempts} attempts`, {
          duration,
        });
      }

      return {
        success: true,
        data: result,
        attempts,
        duration,
      };
    } catch (error: any) {
      lastError = error;

      // Determine if error is retryable
      const isRetryable = isRetryableError(error);

      logger.warn(`[SafeQuery] ${operationName} attempt ${attempts} failed`, {
        error: error.message,
        retryable: isRetryable,
        willRetry: isRetryable && attempts < maxRetries,
      });

      if (!isRetryable) {
        break;
      }

      // Wait before retry (exponential backoff)
      if (attempts < maxRetries) {
        await sleep(Math.min(1000 * Math.pow(2, attempts - 1), 5000));
      }
    }
  }

  // All retries exhausted
  const duration = Date.now() - startTime;

  logger.error(`[SafeQuery] ${operationName} failed after ${attempts} attempts`, {
    error: lastError?.message,
    duration,
  });

  return {
    success: false,
    error: {
      type: lastError?.message === 'Query timeout' ? 'TIMEOUT' : 'QUERY_ERROR',
      message: lastError?.message || 'Unknown error',
      retryable: false,
    },
    attempts,
    duration,
  };
}

/**
 * Safe wrapper for invoice queries - CRITICAL for billing
 */
export async function safeInvoiceQuery<T>(
  queryFn: () => Promise<T>,
  description: string
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, {
    operationName: `Invoice: ${description}`,
    validateSchema: true,
    tableName: 'Invoice',
    maxRetries: 3,
    timeout: 15000,
  });
}

/**
 * Safe wrapper for payment queries - CRITICAL for billing
 */
export async function safePaymentQuery<T>(
  queryFn: () => Promise<T>,
  description: string
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, {
    operationName: `Payment: ${description}`,
    validateSchema: true,
    tableName: 'Payment',
    maxRetries: 3,
    timeout: 15000,
  });
}

/**
 * Safe wrapper for prescription queries - CRITICAL for patient safety
 */
export async function safePrescriptionQuery<T>(
  queryFn: () => Promise<T>,
  description: string
): Promise<SafeQueryResult<T>> {
  return safeQuery(queryFn, {
    operationName: `Prescription: ${description}`,
    validateSchema: true,
    tableName: 'Prescription',
    maxRetries: 3,
    timeout: 10000,
  });
}

/**
 * Determine if an error is transient and can be retried
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Retryable errors
  const retryablePatterns = [
    'connection',
    'timeout',
    'econnreset',
    'econnrefused',
    'temporarily unavailable',
    'too many connections',
    'deadlock',
    'lock wait timeout',
  ];

  // Non-retryable errors
  const nonRetryablePatterns = [
    'does not exist',
    'invalid',
    'syntax error',
    'permission denied',
    'foreign key',
    'unique constraint',
    'not null constraint',
  ];

  for (const pattern of nonRetryablePatterns) {
    if (message.includes(pattern)) {
      return false;
    }
  }

  for (const pattern of retryablePatterns) {
    if (message.includes(pattern)) {
      return true;
    }
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch query executor for multiple related queries
 * Ensures all queries succeed or returns partial results with errors
 */
export async function safeBatchQuery<T extends Record<string, () => Promise<any>>>(
  queries: T,
  options: Omit<SafeQueryOptions, 'operationName'>
): Promise<{
  success: boolean;
  results: { [K in keyof T]?: Awaited<ReturnType<T[K]>> };
  errors: { [K in keyof T]?: string };
}> {
  const results: Record<string, any> = {};
  const errors: Record<string, string> = {};
  let allSuccess = true;

  for (const [name, queryFn] of Object.entries(queries)) {
    const result = await safeQuery(queryFn, {
      ...options,
      operationName: name,
    });

    if (result.success) {
      results[name] = result.data;
    } else {
      allSuccess = false;
      errors[name] = result.error?.message || 'Unknown error';
    }
  }

  return {
    success: allSuccess,
    results,
    errors,
  };
}
