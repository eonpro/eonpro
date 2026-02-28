/**
 * SmartyStreets Address Validation Service
 * ========================================
 * Integration with SmartyStreets US Street Address API for
 * address validation, standardization, and deliverability verification.
 *
 * API Documentation: https://www.smarty.com/docs/cloud/us-street-api
 */

import { logger } from '@/lib/logger';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';
import type {
  ParsedAddress,
  ValidatedAddress,
  SmartyStreetsCandidate,
  SmartyStreetsValidationResult,
  AddressValidationOptions,
} from './types';
import { validateAddress as localValidate } from './validator';
import { logSmartyStreetsResult } from './analytics';

/**
 * SmartyStreets API configuration
 */
const SMARTYSTREETS_API_URL = 'https://us-street.api.smarty.com/street-address';

/**
 * Get SmartyStreets credentials from environment
 */
function getCredentials(): { authId: string; authToken: string } | null {
  const authId = process.env.SMARTYSTREETS_AUTH_ID;
  const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

  if (!authId || !authToken) {
    return null;
  }

  return { authId, authToken };
}

/**
 * Check if SmartyStreets is configured
 */
export function isSmartyStreetsConfigured(): boolean {
  return getCredentials() !== null;
}

/**
 * DPV Match Codes explanation
 * Y - Confirmed; the entire address was DPV confirmed deliverable
 * N - Not Confirmed; the address could not be DPV confirmed as deliverable
 * S - Confirmed by dropping the secondary info (apartment, suite, etc.)
 * D - Confirmed but missing secondary info (there should be an apartment/suite)
 */
function interpretDpvMatchCode(code: string): {
  isDeliverable: boolean;
  description: string;
} {
  switch (code) {
    case 'Y':
      return { isDeliverable: true, description: 'Address confirmed deliverable' };
    case 'S':
      return {
        isDeliverable: true,
        description: 'Address deliverable, but secondary info was dropped',
      };
    case 'D':
      return {
        isDeliverable: true,
        description: 'Address deliverable, but missing secondary info (apt/suite)',
      };
    case 'N':
      return { isDeliverable: false, description: 'Address could not be confirmed as deliverable' };
    default:
      return { isDeliverable: false, description: 'Unknown delivery status' };
  }
}

/**
 * Convert SmartyStreets candidate to ParsedAddress
 */
function candidateToAddress(candidate: SmartyStreetsCandidate): ParsedAddress {
  const components = candidate.components;

  // Build address line 1
  const address1Parts: string[] = [];
  if (components.primary_number) address1Parts.push(components.primary_number);
  if (components.street_predirection) address1Parts.push(components.street_predirection);
  if (components.street_name) address1Parts.push(components.street_name);
  if (components.street_suffix) address1Parts.push(components.street_suffix);
  if (components.street_postdirection) address1Parts.push(components.street_postdirection);

  // Build address line 2
  const address2Parts: string[] = [];
  if (components.secondary_designator) address2Parts.push(components.secondary_designator);
  if (components.secondary_number) address2Parts.push(components.secondary_number);

  // Build ZIP (5+4 if available)
  let zip = components.zipcode;
  if (components.plus4_code) {
    zip = `${components.zipcode}-${components.plus4_code}`;
  }

  return {
    address1: address1Parts.join(' ') || candidate.delivery_line_1,
    address2: address2Parts.join(' ') || candidate.delivery_line_2 || '',
    city: components.city_name || components.default_city_name || '',
    state: components.state_abbreviation,
    zip,
    country: 'US',
  };
}

/**
 * Validate address using SmartyStreets API
 *
 * @param address - Address to validate
 * @param options - Validation options
 * @returns Validation result with standardized address
 */
export async function validateWithSmartyStreets(
  address: ParsedAddress,
  options: AddressValidationOptions & { clinicId?: number; patientId?: number } = {}
): Promise<SmartyStreetsValidationResult> {
  const {
    timeout = 5000,
    maxCandidates = 1,
    acceptPartialMatch = true,
    clinicId,
    patientId,
  } = options;

  const startTime = Date.now();
  const credentials = getCredentials();

  if (!credentials) {
    logger.warn('[SmartyStreets] Not configured - falling back to local validation');
    const localResult = localValidate(address);
    return {
      success: true,
      isDeliverable: localResult.isValid,
      candidates: [],
      standardizedAddress: address,
      error: 'SmartyStreets not configured - used local validation only',
    };
  }

  try {
    // Build query parameters
    const params = new URLSearchParams({
      'auth-id': credentials.authId,
      'auth-token': credentials.authToken,
      street: address.address1 || '',
      street2: address.address2 || '',
      city: address.city || '',
      state: address.state || '',
      zipcode: address.zip || '',
      candidates: String(maxCandidates),
      match: acceptPartialMatch ? 'invalid' : 'strict',
    });

    logger.debug('[SmartyStreets] Validating address', {
      street: address.address1?.substring(0, 20),
      city: address.city,
      state: address.state,
      zip: address.zip,
    });

    const response = await circuitBreakers.addressValidation.execute(async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      try {
        const res = await fetch(`${SMARTYSTREETS_API_URL}?${params}`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        return res;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      const processingTimeMs = Date.now() - startTime;
      logger.error('[SmartyStreets] API error', {
        status: response.status,
        error: errorText.substring(0, 200),
      });

      // Log analytics
      logSmartyStreetsResult(
        { success: false, isDeliverable: false, error: `API error: ${response.status}` },
        { clinicId, patientId, processingTimeMs }
      );

      return {
        success: false,
        isDeliverable: false,
        candidates: [],
        error: `SmartyStreets API error: ${response.status}`,
      };
    }

    const candidates: SmartyStreetsCandidate[] = await response.json();

    if (candidates.length === 0) {
      const processingTimeMs = Date.now() - startTime;
      logger.info('[SmartyStreets] No candidates found - address may be invalid', {
        address1: address.address1?.substring(0, 20),
      });

      // Log analytics
      logSmartyStreetsResult(
        { success: true, isDeliverable: false, error: 'No candidates found' },
        { clinicId, patientId, processingTimeMs }
      );

      return {
        success: true,
        isDeliverable: false,
        candidates: [],
        error: 'Address could not be verified',
      };
    }

    // Use first candidate as the standardized address
    const bestCandidate = candidates[0];
    const standardizedAddress = candidateToAddress(bestCandidate);

    // Interpret DPV match code
    const dpvResult = interpretDpvMatchCode(bestCandidate.analysis.dpv_match_code);

    // Parse footnotes
    const footnotes = bestCandidate.analysis.footnotes
      ? bestCandidate.analysis.footnotes.split('#').filter(Boolean)
      : [];

    const processingTimeMs = Date.now() - startTime;

    // Check if address was standardized (changed)
    const wasStandardized =
      standardizedAddress.address1 !== address.address1 ||
      standardizedAddress.city !== address.city ||
      standardizedAddress.state !== address.state ||
      standardizedAddress.zip !== address.zip;

    logger.info('[SmartyStreets] Address validated', {
      isDeliverable: dpvResult.isDeliverable,
      dpvMatchCode: bestCandidate.analysis.dpv_match_code,
      standardizedCity: standardizedAddress.city,
      standardizedState: standardizedAddress.state,
      standardizedZip: standardizedAddress.zip,
      wasStandardized,
      processingTimeMs,
    });

    // Log analytics
    logSmartyStreetsResult(
      { success: true, isDeliverable: dpvResult.isDeliverable, wasStandardized },
      { clinicId, patientId, processingTimeMs, confidence: dpvResult.isDeliverable ? 100 : 50 }
    );

    return {
      success: true,
      isDeliverable: dpvResult.isDeliverable,
      candidates,
      standardizedAddress,
      dpvMatchCode: bestCandidate.analysis.dpv_match_code,
      footnotes,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const processingTimeMs = Date.now() - startTime;

    if (errorMessage.includes('abort')) {
      logger.warn('[SmartyStreets] Request timed out', { timeout });

      // Log analytics
      logSmartyStreetsResult(
        { success: false, isDeliverable: false, error: 'timeout' },
        { clinicId, patientId, processingTimeMs }
      );

      return {
        success: false,
        isDeliverable: false,
        candidates: [],
        error: 'Request timed out',
      };
    }

    logger.error('[SmartyStreets] Validation error', { error: errorMessage });

    // Log analytics
    logSmartyStreetsResult(
      { success: false, isDeliverable: false, error: errorMessage },
      { clinicId, patientId, processingTimeMs }
    );

    return {
      success: false,
      isDeliverable: false,
      candidates: [],
      error: errorMessage,
    };
  }
}

/**
 * Validate and standardize address with optional SmartyStreets integration
 *
 * @param address - Address to validate
 * @param options - Validation options
 * @returns Validated address with standardization
 */
export async function validateAndStandardizeAddress(
  address: ParsedAddress,
  options: AddressValidationOptions = {}
): Promise<ValidatedAddress> {
  const { useExternalValidation = true } = options;

  // Start with local validation
  const localResult = localValidate(address);

  // If not using external validation or address is clearly invalid, return local result
  if (!useExternalValidation || localResult.errors.length > 2) {
    return localResult;
  }

  // If SmartyStreets is not configured, return local result
  if (!isSmartyStreetsConfigured()) {
    return {
      ...localResult,
      warnings: [...localResult.warnings, 'External address validation not configured'],
    };
  }

  try {
    const smartyResult = await validateWithSmartyStreets(address, options);

    if (!smartyResult.success) {
      return {
        ...localResult,
        warnings: [...localResult.warnings, `External validation failed: ${smartyResult.error}`],
      };
    }

    // Use standardized address if available
    const finalAddress = smartyResult.standardizedAddress || address;

    // Build warnings from footnotes
    const externalWarnings: string[] = [];
    if (smartyResult.footnotes) {
      externalWarnings.push(...smartyResult.footnotes.map((f) => `Address note: ${f}`));
    }

    // Determine confidence based on DPV match
    let confidence = localResult.confidence;
    if (smartyResult.isDeliverable) {
      confidence = Math.max(confidence, 90);
      if (smartyResult.dpvMatchCode === 'Y') {
        confidence = 100;
      }
    } else {
      confidence = Math.min(confidence, 50);
    }

    // Check if address was changed
    const wasStandardized =
      finalAddress.address1 !== address.address1 ||
      finalAddress.city !== address.city ||
      finalAddress.state !== address.state ||
      finalAddress.zip !== address.zip;

    return {
      ...finalAddress,
      isValid: smartyResult.isDeliverable || localResult.isValid,
      confidence,
      warnings: [...localResult.warnings, ...externalWarnings],
      errors: smartyResult.isDeliverable ? [] : localResult.errors,
      wasStandardized,
      originalInput: wasStandardized
        ? `${address.address1}, ${address.city}, ${address.state} ${address.zip}`
        : undefined,
    };
  } catch (error) {
    logger.error('[AddressValidation] External validation error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      ...localResult,
      warnings: [...localResult.warnings, 'External validation unavailable'],
    };
  }
}
