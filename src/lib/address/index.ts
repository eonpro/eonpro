/**
 * Address Module
 * ==============
 * Centralized address parsing, normalization, and validation.
 * 
 * @example
 * ```typescript
 * import {
 *   parseAddressString,
 *   extractAddressFromPayload,
 *   smartParseAddress,
 *   validateAddress,
 *   validateAndStandardizeAddress,
 *   normalizeState,
 *   normalizeZip,
 * } from '@/lib/address';
 * 
 * // Parse a combined address string
 * const address = parseAddressString('289 Marcus St, Hamilton, Montana, 59840');
 * // => { address1: '289 Marcus St', city: 'Hamilton', state: 'MT', zip: '59840' }
 * 
 * // Extract from a payload with various field names
 * const address = extractAddressFromPayload({
 *   shipping_address: '123 Main St, Apt 4B, New York, NY, 10001',
 * });
 * 
 * // Validate with SmartyStreets (if configured)
 * const validated = await validateAndStandardizeAddress(address);
 * ```
 */

// Types
export type {
  ParsedAddress,
  ValidatedAddress,
  AddressParseOptions,
  AddressValidationOptions,
  RawAddressInput,
  SmartyStreetsCandidate,
  SmartyStreetsValidationResult,
} from './types';

// Parser
export {
  parseAddressString,
  extractAddressFromPayload,
  smartParseAddress,
  tryParseJsonAddress,
  isApartmentString,
  isStateName,
  isZipCode,
  extractZipFromString,
  extractCityState,
} from './parser';

// Normalizer
export {
  normalizeState,
  normalizeZip,
  normalizeCity,
  normalizeStreetAddress,
  normalizeStreetSuffix,
  normalizeDirectional,
  normalizeAddress,
  capitalizeWords,
  toTitleCase,
  formatAddressOneLine,
  formatAddressMultiLine,
} from './normalizer';
export type { NormalizeStreetOptions, NormalizeAddressOptions } from './normalizer';

// Validator
export {
  validateAddress,
  validateState,
  validateZip,
  validateStreetAddress,
  validateCity,
  isValidAddress,
  hasMinimumFields,
  getCompletenessScore,
  isMilitaryAddress,
  isPOBox,
} from './validator';

// SmartyStreets
export {
  isSmartyStreetsConfigured,
  validateWithSmartyStreets,
  validateAndStandardizeAddress,
} from './smartystreets';

// Constants (for advanced use cases)
export {
  STATE_NAME_TO_CODE,
  VALID_STATE_CODES,
  APT_PATTERNS,
  APT_STANDALONE_PATTERNS,
  SECONDARY_UNIT_DESIGNATORS,
  STREET_SUFFIXES,
  DIRECTIONALS,
  ZIP_CODE_PATTERN,
  PO_BOX_PATTERNS,
  MILITARY_STATES,
  MILITARY_CITIES,
} from './constants';

// Analytics
export {
  logAddressValidationEvent,
  logParseSuccess,
  logParseFailed,
  logSmartyStreetsResult,
  getAddressValidationMetrics,
  resetAddressValidationMetrics,
} from './analytics';
export type { AddressValidationEvent, AddressValidationEventType } from './analytics';
