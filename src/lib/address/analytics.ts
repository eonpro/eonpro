/**
 * Address Validation Analytics
 * ============================
 * Tracks address parsing and validation metrics for monitoring and optimization.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ParsedAddress, ValidatedAddress } from './types';

/**
 * Address validation event types
 */
export type AddressValidationEventType =
  | 'PARSE_SUCCESS'
  | 'PARSE_PARTIAL'
  | 'PARSE_FAILED'
  | 'SMARTY_VALIDATED'
  | 'SMARTY_CORRECTED'
  | 'SMARTY_INVALID'
  | 'SMARTY_ERROR'
  | 'SMARTY_TIMEOUT'
  | 'LOCAL_VALIDATED'
  | 'LOCAL_INVALID';

/**
 * Address validation event
 */
export interface AddressValidationEvent {
  type: AddressValidationEventType;
  clinicId?: number;
  patientId?: number;
  source: 'webhook' | 'intake' | 'manual' | 'migration' | 'unknown';
  inputFormat: 'combined_string' | 'individual_fields' | 'json' | 'unknown';
  originalInput?: string;
  parsedAddress?: Partial<ParsedAddress>;
  validatedAddress?: Partial<ParsedAddress>;
  wasStandardized?: boolean;
  confidence?: number;
  processingTimeMs?: number;
  errorMessage?: string;
}

/**
 * In-memory metrics for fast aggregation
 */
const metrics = {
  parseSuccess: 0,
  parsePartial: 0,
  parseFailed: 0,
  smartyValidated: 0,
  smartyCorrected: 0,
  smartyInvalid: 0,
  smartyError: 0,
  smartyTimeout: 0,
  localValidated: 0,
  localInvalid: 0,
  totalProcessingTimeMs: 0,
  totalRequests: 0,
};

/**
 * Log an address validation event
 */
export async function logAddressValidationEvent(event: AddressValidationEvent): Promise<void> {
  // Update in-memory metrics
  updateMetrics(event);

  // Log to application logger with structured data
  const logData = {
    eventType: event.type,
    clinicId: event.clinicId,
    patientId: event.patientId,
    source: event.source,
    inputFormat: event.inputFormat,
    wasStandardized: event.wasStandardized,
    confidence: event.confidence,
    processingTimeMs: event.processingTimeMs,
    // Don't log actual address data (PHI) - only metadata
    hasAddress1: !!event.parsedAddress?.address1,
    hasCity: !!event.parsedAddress?.city,
    hasState: !!event.parsedAddress?.state,
    hasZip: !!event.parsedAddress?.zip,
  };

  switch (event.type) {
    case 'PARSE_SUCCESS':
    case 'SMARTY_VALIDATED':
    case 'LOCAL_VALIDATED':
      logger.info('[AddressAnalytics] Validation success', logData);
      break;
    case 'PARSE_PARTIAL':
    case 'SMARTY_CORRECTED':
      logger.info('[AddressAnalytics] Validation with corrections', logData);
      break;
    case 'PARSE_FAILED':
    case 'SMARTY_INVALID':
    case 'LOCAL_INVALID':
      logger.warn('[AddressAnalytics] Validation failed', logData);
      break;
    case 'SMARTY_ERROR':
    case 'SMARTY_TIMEOUT':
      logger.error('[AddressAnalytics] External validation error', {
        ...logData,
        errorMessage: event.errorMessage,
      });
      break;
    default:
      logger.debug('[AddressAnalytics] Event logged', logData);
  }

  // Persist to database for long-term analytics (non-blocking)
  persistEventAsync(event).catch((err) => {
    logger.error('[AddressAnalytics] Failed to persist event', {
      error: err.message,
    });
  });
}

/**
 * Update in-memory metrics
 */
function updateMetrics(event: AddressValidationEvent): void {
  metrics.totalRequests++;

  if (event.processingTimeMs) {
    metrics.totalProcessingTimeMs += event.processingTimeMs;
  }

  switch (event.type) {
    case 'PARSE_SUCCESS':
      metrics.parseSuccess++;
      break;
    case 'PARSE_PARTIAL':
      metrics.parsePartial++;
      break;
    case 'PARSE_FAILED':
      metrics.parseFailed++;
      break;
    case 'SMARTY_VALIDATED':
      metrics.smartyValidated++;
      break;
    case 'SMARTY_CORRECTED':
      metrics.smartyCorrected++;
      break;
    case 'SMARTY_INVALID':
      metrics.smartyInvalid++;
      break;
    case 'SMARTY_ERROR':
      metrics.smartyError++;
      break;
    case 'SMARTY_TIMEOUT':
      metrics.smartyTimeout++;
      break;
    case 'LOCAL_VALIDATED':
      metrics.localValidated++;
      break;
    case 'LOCAL_INVALID':
      metrics.localInvalid++;
      break;
  }
}

/**
 * Persist event to database asynchronously
 */
async function persistEventAsync(event: AddressValidationEvent): Promise<void> {
  try {
    await prisma.addressValidationLog.create({
      data: {
        eventType: event.type,
        clinicId: event.clinicId || null,
        patientId: event.patientId || null,
        source: event.source,
        inputFormat: event.inputFormat,
        wasStandardized: event.wasStandardized || false,
        confidence: event.confidence || null,
        processingTimeMs: event.processingTimeMs || null,
        errorMessage: event.errorMessage || null,
        // Store hashed/truncated input for debugging (not full PHI)
        inputPreview: event.originalInput
          ? event.originalInput.substring(0, 20) + '...'
          : null,
        createdAt: new Date(),
      },
    });
  } catch (error) {
    // Table might not exist yet - that's OK
    if (error instanceof Error && error.message.includes('does not exist')) {
      logger.debug('[AddressAnalytics] Log table not yet created - skipping persistence');
    } else {
      throw error;
    }
  }
}

/**
 * Get current metrics snapshot
 */
export function getAddressValidationMetrics(): {
  parseSuccessRate: number;
  smartySuccessRate: number;
  averageProcessingTimeMs: number;
  totalRequests: number;
  breakdown: typeof metrics;
} {
  const totalParseAttempts = metrics.parseSuccess + metrics.parsePartial + metrics.parseFailed;
  const totalSmartyAttempts =
    metrics.smartyValidated +
    metrics.smartyCorrected +
    metrics.smartyInvalid +
    metrics.smartyError +
    metrics.smartyTimeout;

  return {
    parseSuccessRate:
      totalParseAttempts > 0
        ? ((metrics.parseSuccess + metrics.parsePartial) / totalParseAttempts) * 100
        : 0,
    smartySuccessRate:
      totalSmartyAttempts > 0
        ? ((metrics.smartyValidated + metrics.smartyCorrected) / totalSmartyAttempts) * 100
        : 0,
    averageProcessingTimeMs:
      metrics.totalRequests > 0
        ? metrics.totalProcessingTimeMs / metrics.totalRequests
        : 0,
    totalRequests: metrics.totalRequests,
    breakdown: { ...metrics },
  };
}

/**
 * Reset metrics (useful for testing)
 */
export function resetAddressValidationMetrics(): void {
  Object.keys(metrics).forEach((key) => {
    (metrics as any)[key] = 0;
  });
}

/**
 * Log a successful parse
 */
export function logParseSuccess(
  parsed: ParsedAddress,
  options: {
    clinicId?: number;
    patientId?: number;
    source?: AddressValidationEvent['source'];
    inputFormat?: AddressValidationEvent['inputFormat'];
    originalInput?: string;
    processingTimeMs?: number;
  } = {}
): void {
  const isComplete = parsed.address1 && parsed.city && parsed.state && parsed.zip;

  logAddressValidationEvent({
    type: isComplete ? 'PARSE_SUCCESS' : 'PARSE_PARTIAL',
    clinicId: options.clinicId,
    patientId: options.patientId,
    source: options.source || 'unknown',
    inputFormat: options.inputFormat || 'unknown',
    originalInput: options.originalInput,
    parsedAddress: parsed,
    processingTimeMs: options.processingTimeMs,
  });
}

/**
 * Log a parse failure
 */
export function logParseFailed(
  originalInput: string,
  options: {
    clinicId?: number;
    patientId?: number;
    source?: AddressValidationEvent['source'];
    errorMessage?: string;
  } = {}
): void {
  logAddressValidationEvent({
    type: 'PARSE_FAILED',
    clinicId: options.clinicId,
    patientId: options.patientId,
    source: options.source || 'unknown',
    inputFormat: 'unknown',
    originalInput,
    errorMessage: options.errorMessage,
  });
}

/**
 * Log SmartyStreets validation result
 */
export function logSmartyStreetsResult(
  result: {
    success: boolean;
    isDeliverable: boolean;
    wasStandardized?: boolean;
    error?: string;
  },
  options: {
    clinicId?: number;
    patientId?: number;
    processingTimeMs?: number;
    confidence?: number;
  } = {}
): void {
  let eventType: AddressValidationEventType;

  if (!result.success) {
    eventType = result.error?.includes('timeout') ? 'SMARTY_TIMEOUT' : 'SMARTY_ERROR';
  } else if (!result.isDeliverable) {
    eventType = 'SMARTY_INVALID';
  } else if (result.wasStandardized) {
    eventType = 'SMARTY_CORRECTED';
  } else {
    eventType = 'SMARTY_VALIDATED';
  }

  logAddressValidationEvent({
    type: eventType,
    clinicId: options.clinicId,
    patientId: options.patientId,
    source: 'webhook',
    inputFormat: 'combined_string',
    wasStandardized: result.wasStandardized,
    confidence: options.confidence,
    processingTimeMs: options.processingTimeMs,
    errorMessage: result.error,
  });
}
