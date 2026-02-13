/**
 * Address Normalizer
 * ==================
 * Standardization utilities for address components.
 */

import {
  STATE_NAME_TO_CODE,
  VALID_STATE_CODES,
  STREET_SUFFIXES,
  DIRECTIONALS,
  ZIP_CODE_PATTERN,
  SECONDARY_UNIT_DESIGNATORS,
} from './constants';
import type { ParsedAddress } from './types';

/**
 * Words that should stay UPPERCASE in addresses
 * (directionals, unit designators)
 */
const UPPERCASE_WORDS = new Set([
  // Directionals
  'N',
  'S',
  'E',
  'W',
  'NE',
  'NW',
  'SE',
  'SW',
  // Unit designators
  'APT',
  'STE',
  'BLDG',
  'FL',
  'RM',
  'PH',
  'TH',
  // PO Box
  'PO',
  'BOX',
]);

/**
 * Words that should stay lowercase when not first word
 * (articles, prepositions)
 */
const LOWERCASE_WORDS = new Set(['of', 'the', 'and', 'at', 'by', 'in', 'on']);

/**
 * Convert a string to proper title case for addresses
 *
 * Rules:
 * - First letter of each word capitalized, rest lowercase
 * - Directionals stay uppercase (N, S, E, W, NE, NW, SE, SW)
 * - Unit designators stay uppercase (APT, STE, BLDG)
 * - Numbers preserved as-is
 * - Handles ordinals correctly (1ST, 2ND, 3RD, 4TH)
 *
 * @param str - String to convert
 * @returns Title-cased string
 *
 * @example
 * toTitleCase('123 MAIN STREET') // '123 Main Street'
 * toTitleCase('456 NW OAK AVE') // '456 NW Oak Ave'
 * toTitleCase('APT 2078') // 'Apt 2078'
 * toTitleCase('1ST FLOOR') // '1st Floor'
 */
export function toTitleCase(str: string | null | undefined): string {
  if (!str) return '';

  const trimmed = str.trim();
  if (!trimmed) return '';

  // Split on whitespace while preserving the separator
  const words = trimmed.split(/(\s+)/);

  return words
    .map((word, index) => {
      // Skip whitespace
      if (/^\s+$/.test(word)) return word;

      const upperWord = word.toUpperCase();

      // Check if it's a directional or unit designator that should stay uppercase
      if (UPPERCASE_WORDS.has(upperWord)) {
        return upperWord;
      }

      // Check for ordinals (1ST, 2ND, 3RD, 4TH, etc.)
      const ordinalMatch = word.match(/^(\d+)(ST|ND|RD|TH)$/i);
      if (ordinalMatch) {
        return ordinalMatch[1] + ordinalMatch[2].toLowerCase();
      }

      // Pure numbers - leave as-is
      if (/^\d+$/.test(word)) {
        return word;
      }

      // Alphanumeric with number first (like "4TH", "12A") - preserve structure
      if (/^\d+[A-Za-z]+$/.test(word)) {
        const match = word.match(/^(\d+)([A-Za-z]+)$/);
        if (match) {
          return match[1] + match[2].toLowerCase();
        }
      }

      // Check for lowercase words (not first word)
      if (index > 0 && LOWERCASE_WORDS.has(word.toLowerCase())) {
        return word.toLowerCase();
      }

      // Standard title case: first letter uppercase, rest lowercase
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join('');
}

/**
 * Normalize state input to 2-letter code
 *
 * @param value - State name or code
 * @returns Normalized 2-letter state code or original value
 */
export function normalizeState(value?: string): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  const normalizedLower = trimmed.toLowerCase();

  // Direct lookup (handles both full names and codes)
  if (STATE_NAME_TO_CODE[normalizedLower]) {
    return STATE_NAME_TO_CODE[normalizedLower];
  }

  // Already a valid 2-letter code (case insensitive)
  const upperCase = trimmed.toUpperCase();
  if (VALID_STATE_CODES.has(upperCase)) {
    return upperCase;
  }

  // Try removing non-alpha characters
  const alphaOnly = trimmed
    .replace(/[^a-zA-Z\s]/g, '')
    .trim()
    .toLowerCase();
  if (STATE_NAME_TO_CODE[alphaOnly]) {
    return STATE_NAME_TO_CODE[alphaOnly];
  }

  // Fuzzy match: check if input contains a state name
  for (const [stateName, stateCode] of Object.entries(STATE_NAME_TO_CODE)) {
    if (stateName.length > 2 && normalizedLower.includes(stateName)) {
      return stateCode;
    }
  }

  // Return uppercase if it's 2 chars, otherwise original
  return trimmed.length === 2 ? upperCase : trimmed;
}

/**
 * Normalize ZIP code to standard format
 *
 * @param value - ZIP code input
 * @returns Normalized ZIP code (5 or 5+4 format)
 */
export function normalizeZip(value?: string): string {
  if (!value) return '';

  const trimmed = value.trim();
  if (!trimmed) return '';

  // Extract digits and hyphen
  const cleaned = trimmed.replace(/[^\d-]/g, '');

  // Check for 5+4 format
  const match5Plus4 = cleaned.match(/^(\d{5})-?(\d{4})$/);
  if (match5Plus4) {
    return `${match5Plus4[1]}-${match5Plus4[2]}`;
  }

  // Check for 5-digit format
  const match5 = cleaned.match(/^(\d{5})$/);
  if (match5) {
    return match5[1];
  }

  // Extract first 5 digits if present
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length >= 5) {
    const zip5 = digits.substring(0, 5);
    if (digits.length >= 9) {
      return `${zip5}-${digits.substring(5, 9)}`;
    }
    return zip5;
  }

  return trimmed;
}

/**
 * Normalize street suffix to USPS abbreviation
 *
 * @param suffix - Street suffix (e.g., "Street", "Ave")
 * @returns Normalized suffix (e.g., "ST", "AVE")
 */
export function normalizeStreetSuffix(suffix: string): string {
  if (!suffix) return '';

  const lower = suffix.trim().toLowerCase();
  return STREET_SUFFIXES[lower] || suffix.toUpperCase();
}

/**
 * Normalize directional (N, S, E, W, etc.)
 *
 * @param directional - Directional input
 * @returns Normalized directional
 */
export function normalizeDirectional(directional: string): string {
  if (!directional) return '';

  const lower = directional.trim().toLowerCase();
  return DIRECTIONALS[lower] || directional.toUpperCase();
}

/**
 * Capitalize words in a string (Title Case)
 *
 * @param value - String to capitalize
 * @returns Title-cased string
 */
export function capitalizeWords(value: string): string {
  if (!value) return '';

  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Normalize city name
 *
 * @param city - City name
 * @returns Normalized city name (title case)
 */
export function normalizeCity(city?: string): string {
  if (!city) return '';

  const trimmed = city.trim();
  if (!trimmed) return '';

  // Remove trailing punctuation
  const cleaned = trimmed.replace(/[.,;:]+$/, '').trim();

  // Apply proper title case
  return toTitleCase(cleaned);
}

/**
 * Options for normalizing street address
 */
export interface NormalizeStreetOptions {
  /** Apply title case formatting (default: true) */
  titleCase?: boolean;
  /** Standardize suffix to USPS abbreviation (default: false) */
  standardizeSuffix?: boolean;
}

/**
 * Normalize street address
 *
 * @param address - Street address
 * @param options - Normalization options
 * @returns Normalized address (title case by default)
 *
 * @example
 * normalizeStreetAddress('123 MAIN STREET') // '123 Main Street'
 * normalizeStreetAddress('456 NW OAK AVE') // '456 NW Oak Ave'
 */
export function normalizeStreetAddress(
  address?: string,
  options: NormalizeStreetOptions | boolean = {}
): string {
  if (!address) return '';

  // Handle legacy boolean parameter (standardizeSuffix)
  const opts: NormalizeStreetOptions =
    typeof options === 'boolean' ? { standardizeSuffix: options } : options;

  const { titleCase = true, standardizeSuffix = false } = opts;

  let normalized = address.trim();
  if (!normalized) return '';

  // Convert multiple spaces to single
  normalized = normalized.replace(/\s+/g, ' ');

  // Standardize suffix if requested
  if (standardizeSuffix) {
    const words = normalized.split(' ');
    const lastWord = words[words.length - 1];
    const normalizedSuffix = normalizeStreetSuffix(lastWord);
    if (normalizedSuffix !== lastWord.toUpperCase()) {
      words[words.length - 1] = normalizedSuffix;
      normalized = words.join(' ');
    }
  }

  // Apply title case by default for display
  if (titleCase) {
    normalized = toTitleCase(normalized);
  }

  return normalized;
}

/**
 * Options for normalizing a complete address
 */
export interface NormalizeAddressOptions {
  /** Standardize street suffix to USPS abbreviation (default: false) */
  standardizeStreet?: boolean;
  /** Apply title case to city (default: true) */
  capitalizeCity?: boolean;
  /** Apply title case to street addresses (default: true) */
  titleCase?: boolean;
}

/**
 * Normalize a complete address
 *
 * @param address - Parsed address
 * @param options - Normalization options
 * @returns Normalized address (title case by default)
 *
 * @example
 * normalizeAddress({ address1: '123 MAIN ST', city: 'NEW YORK', state: 'ny', zip: '10001' })
 * // { address1: '123 Main St', city: 'New York', state: 'NY', zip: '10001', ... }
 */
export function normalizeAddress(
  address: ParsedAddress,
  options: NormalizeAddressOptions = {}
): ParsedAddress {
  const { standardizeStreet = false, capitalizeCity = true, titleCase = true } = options;

  return {
    address1: normalizeStreetAddress(address.address1, {
      titleCase,
      standardizeSuffix: standardizeStreet,
    }),
    address2: titleCase ? toTitleCase(address.address2) : address.address2?.trim() || '',
    city: capitalizeCity ? normalizeCity(address.city) : address.city?.trim() || '',
    state: normalizeState(address.state),
    zip: normalizeZip(address.zip),
    country: address.country?.trim().toUpperCase() || 'US',
  };
}

/**
 * Format address as single-line string
 *
 * @param address - Parsed address
 * @returns Formatted address string
 */
export function formatAddressOneLine(address: ParsedAddress): string {
  const parts: string[] = [];

  if (address.address1) parts.push(address.address1);
  if (address.address2) parts.push(address.address2);
  if (address.city) parts.push(address.city);
  if (address.state) {
    if (address.zip) {
      parts.push(`${address.state} ${address.zip}`);
    } else {
      parts.push(address.state);
    }
  } else if (address.zip) {
    parts.push(address.zip);
  }

  return parts.join(', ');
}

/**
 * Format address as multi-line string
 *
 * @param address - Parsed address
 * @returns Formatted address with line breaks
 */
export function formatAddressMultiLine(address: ParsedAddress): string {
  const lines: string[] = [];

  if (address.address1) lines.push(address.address1);
  if (address.address2) lines.push(address.address2);

  const cityStateZip: string[] = [];
  if (address.city) cityStateZip.push(address.city);
  if (address.state) cityStateZip.push(address.state);
  if (address.zip) cityStateZip.push(address.zip);

  if (cityStateZip.length > 0) {
    lines.push(cityStateZip.join(', '));
  }

  return lines.join('\n');
}
