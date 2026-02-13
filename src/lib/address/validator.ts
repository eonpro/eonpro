/**
 * Address Validator
 * =================
 * Validation logic for parsed addresses.
 */

import type { ParsedAddress, ValidatedAddress } from './types';
import {
  VALID_STATE_CODES,
  ZIP_CODE_PATTERN,
  PO_BOX_PATTERNS,
  MILITARY_STATES,
  MILITARY_CITIES,
} from './constants';

/**
 * Validation result for a single field
 */
interface FieldValidation {
  isValid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Validate state code
 */
export function validateState(state: string): FieldValidation {
  if (!state) {
    return { isValid: false, error: 'State is required' };
  }

  const normalized = state.trim().toUpperCase();

  if (!VALID_STATE_CODES.has(normalized)) {
    return { isValid: false, error: `Invalid state code: ${state}` };
  }

  return { isValid: true };
}

/**
 * Validate ZIP code
 */
export function validateZip(zip: string): FieldValidation {
  if (!zip) {
    return { isValid: false, error: 'ZIP code is required' };
  }

  const trimmed = zip.trim();

  if (!ZIP_CODE_PATTERN.test(trimmed)) {
    return { isValid: false, error: `Invalid ZIP code format: ${zip}` };
  }

  return { isValid: true };
}

/**
 * Validate street address
 */
export function validateStreetAddress(address: string): FieldValidation {
  if (!address) {
    return { isValid: false, error: 'Street address is required' };
  }

  const trimmed = address.trim();

  if (trimmed.length < 5) {
    return { isValid: false, error: 'Street address is too short' };
  }

  if (trimmed.length > 200) {
    return { isValid: false, error: 'Street address is too long' };
  }

  // Check for obviously invalid addresses
  if (/^(test|asdf|xxx|none|na|n\/a)$/i.test(trimmed)) {
    return { isValid: false, error: 'Invalid street address' };
  }

  // Warning for PO Box (might not be shippable for some carriers)
  if (PO_BOX_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return { isValid: true, warning: 'PO Box addresses may not be deliverable by all carriers' };
  }

  return { isValid: true };
}

/**
 * Validate city
 */
export function validateCity(city: string): FieldValidation {
  if (!city) {
    return { isValid: false, error: 'City is required' };
  }

  const trimmed = city.trim();

  if (trimmed.length < 2) {
    return { isValid: false, error: 'City name is too short' };
  }

  if (trimmed.length > 100) {
    return { isValid: false, error: 'City name is too long' };
  }

  // Check for obviously invalid cities
  if (/^(test|asdf|xxx|none|na|n\/a)$/i.test(trimmed)) {
    return { isValid: false, error: 'Invalid city name' };
  }

  return { isValid: true };
}

/**
 * Check if address is a military address
 */
export function isMilitaryAddress(address: ParsedAddress): boolean {
  const state = address.state?.toUpperCase() || '';
  const city = address.city?.toUpperCase() || '';

  return MILITARY_STATES.has(state) || MILITARY_CITIES.has(city);
}

/**
 * Check if address is a PO Box
 */
export function isPOBox(address: ParsedAddress): boolean {
  const address1 = address.address1?.trim() || '';
  return PO_BOX_PATTERNS.some((pattern) => pattern.test(address1));
}

/**
 * Validate a complete address
 *
 * @param address - Parsed address to validate
 * @param options - Validation options
 * @returns Validated address with errors/warnings
 */
export function validateAddress(
  address: ParsedAddress,
  options: {
    requireAllFields?: boolean;
    allowPOBox?: boolean;
    allowMilitary?: boolean;
  } = {}
): ValidatedAddress {
  const { requireAllFields = true, allowPOBox = true, allowMilitary = true } = options;

  const errors: string[] = [];
  const warnings: string[] = [];
  let confidence = 100;

  // Validate street address
  const streetValidation = validateStreetAddress(address.address1);
  if (!streetValidation.isValid) {
    errors.push(streetValidation.error!);
    confidence -= 30;
  } else if (streetValidation.warning) {
    warnings.push(streetValidation.warning);
    confidence -= 10;
  }

  // Validate city
  if (requireAllFields || address.city) {
    const cityValidation = validateCity(address.city);
    if (!cityValidation.isValid) {
      errors.push(cityValidation.error!);
      confidence -= 20;
    }
  } else {
    confidence -= 15;
    warnings.push('City is missing');
  }

  // Validate state
  if (requireAllFields || address.state) {
    const stateValidation = validateState(address.state);
    if (!stateValidation.isValid) {
      errors.push(stateValidation.error!);
      confidence -= 20;
    }
  } else {
    confidence -= 15;
    warnings.push('State is missing');
  }

  // Validate ZIP
  if (requireAllFields || address.zip) {
    const zipValidation = validateZip(address.zip);
    if (!zipValidation.isValid) {
      errors.push(zipValidation.error!);
      confidence -= 15;
    }
  } else {
    confidence -= 10;
    warnings.push('ZIP code is missing');
  }

  // Check PO Box restrictions
  if (!allowPOBox && isPOBox(address)) {
    errors.push('PO Box addresses are not allowed');
    confidence -= 20;
  }

  // Check military address restrictions
  if (!allowMilitary && isMilitaryAddress(address)) {
    errors.push('Military addresses are not allowed');
    confidence -= 20;
  }

  // Ensure confidence doesn't go below 0
  confidence = Math.max(0, confidence);

  return {
    ...address,
    isValid: errors.length === 0,
    confidence,
    warnings,
    errors,
    wasStandardized: false,
  };
}

/**
 * Quick validation check (boolean only)
 *
 * @param address - Address to validate
 * @returns True if address passes basic validation
 */
export function isValidAddress(address: ParsedAddress): boolean {
  return (
    !!address.address1?.trim() &&
    !!address.city?.trim() &&
    !!address.state?.trim() &&
    !!address.zip?.trim() &&
    VALID_STATE_CODES.has(address.state.toUpperCase()) &&
    ZIP_CODE_PATTERN.test(address.zip)
  );
}

/**
 * Check if address has minimum required fields
 *
 * @param address - Address to check
 * @returns True if has minimum fields for parsing
 */
export function hasMinimumFields(address: ParsedAddress): boolean {
  // At minimum, we need address1 or (city + state)
  const hasStreet = !!address.address1?.trim();
  const hasCityState = !!address.city?.trim() && !!address.state?.trim();

  return hasStreet || hasCityState;
}

/**
 * Calculate completeness score (0-100)
 *
 * @param address - Address to score
 * @returns Completeness percentage
 */
export function getCompletenessScore(address: ParsedAddress): number {
  let score = 0;

  if (address.address1?.trim()) score += 30;
  if (address.address2?.trim()) score += 10;
  if (address.city?.trim()) score += 20;
  if (address.state?.trim() && VALID_STATE_CODES.has(address.state.toUpperCase())) score += 20;
  if (address.zip?.trim() && ZIP_CODE_PATTERN.test(address.zip)) score += 20;

  return score;
}
