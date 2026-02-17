/**
 * Address Parser
 * ==============
 * Robust parsing of combined address strings into individual components.
 *
 * Handles formats like:
 * - "289 Marcus St, Hamilton, Montana, 59840"
 * - "201 ELBRIDGE AVE, APT F, Cloverdale, California, 95425"
 * - "2900 W Dallas St, 130, Houston, TX, 77019"
 * - "123 Main St, New York, NY 10001"
 */

import type { ParsedAddress, AddressParseOptions, RawAddressInput } from './types';
import {
  STATE_NAME_TO_CODE,
  VALID_STATE_CODES,
  APT_PATTERNS,
  APT_STANDALONE_PATTERNS,
  ZIP_CODE_PATTERN,
  ZIP_CODE_LOOSE_PATTERN,
} from './constants';
import { normalizeState, normalizeZip } from './normalizer';

/**
 * Default parsing options
 */
const DEFAULT_OPTIONS: AddressParseOptions = {
  normalizeState: true,
  standardizeStreet: false,
  validateZip: true,
  defaultCountry: 'US',
};

/**
 * Check if a string looks like an apartment/unit number
 *
 * Handles various formats:
 * - Prefixed: "APT 123", "Unit B", "STE 100", "#4"
 * - Bare numbers: "130", "2078"
 * - Alphanumeric: "4B", "G05", "A1", "12A"
 * - With dashes: "A-1", "12-B"
 */
export function isApartmentString(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;

  // Check prefixed patterns (APT, UNIT, etc.)
  if (APT_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;

  // Check standalone patterns (bare numbers, alphanumeric combos)
  if (APT_STANDALONE_PATTERNS.some((pattern) => pattern.test(trimmed))) return true;

  return false;
}

/**
 * Check if a string is a valid US state name or code
 */
export function isStateName(str: string): boolean {
  if (!str) return false;
  const normalized = str.trim().toLowerCase();
  return STATE_NAME_TO_CODE[normalized] !== undefined;
}

/**
 * Check if a string is a valid US ZIP code
 */
export function isZipCode(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  return ZIP_CODE_PATTERN.test(trimmed);
}

/**
 * Extract ZIP code from a string that may contain "State ZIP"
 */
export function extractZipFromString(str: string): { remaining: string; zip: string } | null {
  const match = str.match(ZIP_CODE_LOOSE_PATTERN);
  if (match) {
    const zip = match[0];
    const remaining = str.replace(zip, '').trim();
    return { remaining, zip };
  }
  return null;
}

/**
 * Extract state from a "City State" or "City, State" string
 */
export function extractCityState(str: string): { city: string; state: string } | null {
  const trimmed = str.trim();

  // Try to match "CITY STATE_NAME" or "CITY STATE_CODE" pattern
  for (const [stateName, stateCode] of Object.entries(STATE_NAME_TO_CODE)) {
    if (stateName.length < 2) continue;

    // Match state at end of string (with optional comma/space)
    const regex = new RegExp(`^(.+?)[,\\s]+\\b(${stateName})\\b$`, 'i');
    const match = trimmed.match(regex);
    if (match) {
      return { city: match[1].trim(), state: stateCode };
    }
  }

  return null;
}

/**
 * Parse a combined address string into components
 *
 * @param addressString - Combined address like "123 Main St, City, State, 12345"
 * @param options - Parsing options
 * @returns Parsed address components
 */
export function parseAddressString(
  addressString: string,
  options: AddressParseOptions = {}
): ParsedAddress {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const result: ParsedAddress = {
    address1: '',
    address2: '',
    city: '',
    state: '',
    zip: '',
    country: opts.defaultCountry,
  };

  if (!addressString || typeof addressString !== 'string') {
    return result;
  }

  const originalInput = addressString.trim();

  // Split by comma
  const parts = originalInput
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return result;
  }

  // Single part - just return as address1
  if (parts.length === 1) {
    // Check if it contains a ZIP
    const zipExtract = extractZipFromString(parts[0]);
    if (zipExtract) {
      result.zip = normalizeZip(zipExtract.zip);

      // Try to extract state from remaining
      const cityState = extractCityState(zipExtract.remaining);
      if (cityState) {
        result.city = cityState.city;
        result.state = opts.normalizeState ? normalizeState(cityState.state) : cityState.state;
      } else {
        result.address1 = zipExtract.remaining;
      }
    } else {
      result.address1 = parts[0];
    }
    return result;
  }

  // Work backwards to identify components
  const remainingParts = [...parts];

  // Step 1: Extract ZIP code (usually last or second-to-last)
  let lastPart = remainingParts[remainingParts.length - 1];

  if (isZipCode(lastPart)) {
    result.zip = normalizeZip(lastPart);
    remainingParts.pop();
    lastPart = remainingParts[remainingParts.length - 1] || '';
  } else {
    // Check if last part contains "STATE ZIP" pattern
    const stateZipMatch = lastPart.match(/^(.+?)\s+(\d{5}(-\d{4})?)$/);
    if (stateZipMatch) {
      const possibleState = stateZipMatch[1].trim();
      if (isStateName(possibleState)) {
        result.state = opts.normalizeState ? normalizeState(possibleState) : possibleState;
        result.zip = normalizeZip(stateZipMatch[2]);
        remainingParts.pop();
        lastPart = remainingParts[remainingParts.length - 1] || '';
      }
    }
  }

  // Step 2: Extract state
  if (!result.state && remainingParts.length > 0) {
    lastPart = remainingParts[remainingParts.length - 1];

    if (isStateName(lastPart)) {
      result.state = opts.normalizeState ? normalizeState(lastPart) : lastPart;
      remainingParts.pop();
    } else {
      // Check for "City State" combined in last part
      const cityState = extractCityState(lastPart);
      if (cityState) {
        result.city = cityState.city;
        result.state = opts.normalizeState ? normalizeState(cityState.state) : cityState.state;
        remainingParts.pop();
      }
    }
  }

  // Step 3: Extract city (next-to-last remaining part, if not already extracted)
  if (!result.city && remainingParts.length > 1) {
    lastPart = remainingParts[remainingParts.length - 1];

    // City should not look like an apartment number
    if (!isApartmentString(lastPart)) {
      result.city = lastPart;
      remainingParts.pop();
    }
  }

  // Step 4: Process remaining parts (street address and apartment)
  if (remainingParts.length === 0) {
    // Nothing left
  } else if (remainingParts.length === 1) {
    result.address1 = remainingParts[0];
  } else if (remainingParts.length === 2) {
    // Check if second part is apartment
    if (isApartmentString(remainingParts[1])) {
      result.address1 = remainingParts[0];
      result.address2 = remainingParts[1];
    } else {
      // Both parts are address (e.g., "123 Main St, Building A")
      result.address1 = remainingParts[0];
      result.address2 = remainingParts[1];
    }
  } else {
    // 3+ parts remaining - first is address1, check for apt in middle
    result.address1 = remainingParts[0];

    // Check if second part is apartment
    if (isApartmentString(remainingParts[1])) {
      result.address2 = remainingParts[1];
      // If there's a third part that's not apt, it might be the city
      if (remainingParts.length > 2 && !result.city) {
        result.city = remainingParts[2];
      }
    } else {
      // Second part might be city if we don't have one
      if (!result.city) {
        result.city = remainingParts[1];
      } else {
        // Otherwise treat as address2
        result.address2 = remainingParts[1];
      }
    }
  }

  return result;
}

/**
 * Extract address from a payload with various field name conventions
 *
 * @param payload - Object with address fields (various naming conventions)
 * @param options - Parsing options
 * @returns Parsed and normalized address
 */
export function extractAddressFromPayload(
  payload: RawAddressInput,
  options: AddressParseOptions = {}
): ParsedAddress {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // First, try to get individual components
  const address1 = String(
    payload.address1 ||
      payload.address_line1 ||
      payload.address_line_1 ||
      payload.addressLine1 ||
      payload.street_address ||
      payload.streetAddress ||
      ''
  ).trim();

  const address2 = String(
    payload.address2 ||
      payload.address_line2 ||
      payload.address_line_2 ||
      payload.addressLine2 ||
      payload.apartment ||
      payload.apt ||
      payload.suite ||
      payload.unit ||
      ''
  ).trim();

  const city = String(payload.city || payload.shipping_city || payload.shippingCity || '').trim();

  const state = String(
    payload.state || payload.shipping_state || payload.shippingState || payload.province || ''
  ).trim();

  const zip = String(
    payload.zip ||
      payload.zipCode ||
      payload.zip_code ||
      payload.postal_code ||
      payload.postalCode ||
      payload.shipping_zip ||
      payload.shippingZip ||
      ''
  ).trim();

  const country = String(
    payload.country ||
      payload.shipping_country ||
      payload.shippingCountry ||
      opts.defaultCountry ||
      'US'
  ).trim();

  // Check if we have individual components
  const hasIndividualComponents = city || state || zip || address2;

  // Check for combined address strings
  const combinedAddress = String(
    payload.shipping_address ||
      payload.billing_address ||
      payload.address ||
      payload.full_address ||
      ''
  ).trim();

  // Detect corrupted individual components (e.g. from bad Airtable mapping when address has apt)
  // When an address has an apartment/unit, Airtable's naive comma split shifts all fields:
  //   apt → city, city → state, state → zip, zip → lost
  const cityLooksLikeApt = city ? isApartmentString(city) : false;
  const zipLooksLikeState = zip ? isStateName(zip) && !isZipCode(zip) : false;
  const stateLooksLikeZip = state ? isZipCode(state) : false;
  const stateLooksLikeCity = state ? (!isStateName(state) && !isZipCode(state) && state.length > 2) : false;
  const zipNotValid = zip ? (!isZipCode(zip) && zip.length > 0) : false;
  const individualComponentsLookCorrupted =
    cityLooksLikeApt || zipLooksLikeState || stateLooksLikeZip ||
    (stateLooksLikeCity && zipNotValid);

  // If we have a parseable combined address and individual fields look wrong, prefer parsing
  if (
    combinedAddress &&
    combinedAddress.includes(',') &&
    individualComponentsLookCorrupted
  ) {
    const parsed = parseAddressString(combinedAddress, opts);
    return {
      ...parsed,
      country,
    };
  }

  // If we have individual components and they look valid, use them
  if (hasIndividualComponents) {
    return {
      address1: address1 || combinedAddress.split(',')[0]?.trim() || '',
      address2,
      city,
      state: opts.normalizeState ? normalizeState(state) : state,
      zip: normalizeZip(zip),
      country,
    };
  }

  // If we have a combined address, parse it
  if (combinedAddress && combinedAddress.includes(',')) {
    const parsed = parseAddressString(combinedAddress, opts);
    return {
      ...parsed,
      country,
    };
  }

  // Fallback: use whatever we have
  return {
    address1: address1 || combinedAddress,
    address2,
    city,
    state: opts.normalizeState ? normalizeState(state) : state,
    zip: normalizeZip(zip),
    country,
  };
}

/**
 * Try to parse a JSON address string
 *
 * @param jsonString - JSON string that might contain address
 * @returns Parsed address or null if not valid JSON
 */
export function tryParseJsonAddress(jsonString: string): ParsedAddress | null {
  if (!jsonString || !jsonString.trim().startsWith('{')) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonString);
    return extractAddressFromPayload(parsed);
  } catch {
    return null;
  }
}

/**
 * Smart parse that handles both JSON and string formats
 *
 * @param input - Address input (JSON string, formatted string, or object)
 * @param options - Parsing options
 * @returns Parsed address
 */
export function smartParseAddress(
  input: string | RawAddressInput,
  options: AddressParseOptions = {}
): ParsedAddress {
  if (typeof input === 'string') {
    // Try JSON first
    const jsonResult = tryParseJsonAddress(input);
    if (jsonResult) {
      return jsonResult;
    }

    // Parse as formatted string
    return parseAddressString(input, options);
  }

  // Object input
  return extractAddressFromPayload(input, options);
}
