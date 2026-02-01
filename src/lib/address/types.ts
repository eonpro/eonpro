/**
 * Address Types
 * =============
 * Type definitions for the address parsing and validation system.
 */

import type { USStateCode } from '@/lib/usStates';

/**
 * Parsed address components
 */
export interface ParsedAddress {
  /** Primary street address (e.g., "123 Main St") */
  address1: string;
  /** Secondary address line (e.g., "Apt 4B", "Suite 100") */
  address2: string;
  /** City name */
  city: string;
  /** State code (2-letter, e.g., "CA") */
  state: string;
  /** ZIP code (5 or 9 digit format) */
  zip: string;
  /** Country code (default: "US") */
  country?: string;
}

/**
 * Address with validation metadata
 */
export interface ValidatedAddress extends ParsedAddress {
  /** Whether the address passed validation */
  isValid: boolean;
  /** Validation confidence score (0-100) */
  confidence: number;
  /** Validation warnings */
  warnings: string[];
  /** Validation errors */
  errors: string[];
  /** Whether address was corrected/standardized */
  wasStandardized: boolean;
  /** Original input before standardization */
  originalInput?: string;
}

/**
 * Address parsing options
 */
export interface AddressParseOptions {
  /** Whether to normalize state names to codes */
  normalizeState?: boolean;
  /** Whether to standardize street abbreviations */
  standardizeStreet?: boolean;
  /** Whether to validate ZIP code format */
  validateZip?: boolean;
  /** Default country if not specified */
  defaultCountry?: string;
}

/**
 * SmartyStreets API response types
 */
export interface SmartyStreetsCandidate {
  input_index: number;
  candidate_index: number;
  delivery_line_1: string;
  delivery_line_2?: string;
  last_line: string;
  delivery_point_barcode: string;
  components: {
    primary_number: string;
    street_predirection?: string;
    street_name: string;
    street_suffix?: string;
    street_postdirection?: string;
    secondary_number?: string;
    secondary_designator?: string;
    city_name: string;
    default_city_name?: string;
    state_abbreviation: string;
    zipcode: string;
    plus4_code?: string;
    delivery_point: string;
    delivery_point_check_digit: string;
  };
  metadata: {
    record_type: string;
    zip_type: string;
    county_fips: string;
    county_name: string;
    carrier_route: string;
    congressional_district: string;
    rdi: string;
    elot_sequence: string;
    elot_sort: string;
    latitude: number;
    longitude: number;
    precision: string;
    time_zone: string;
    utc_offset: number;
    dst: boolean;
  };
  analysis: {
    dpv_match_code: string;
    dpv_footnotes: string;
    dpv_cmra: string;
    dpv_vacant: string;
    dpv_no_stat: string;
    active: string;
    footnotes?: string;
    lacslink_code?: string;
    lacslink_indicator?: string;
    suitelink_match?: boolean;
  };
}

/**
 * SmartyStreets validation result
 */
export interface SmartyStreetsValidationResult {
  success: boolean;
  isDeliverable: boolean;
  candidates: SmartyStreetsCandidate[];
  standardizedAddress?: ParsedAddress;
  dpvMatchCode?: string;
  footnotes?: string[];
  error?: string;
}

/**
 * Address validation service options
 */
export interface AddressValidationOptions {
  /** Use external validation service */
  useExternalValidation?: boolean;
  /** Timeout for external API calls (ms) */
  timeout?: number;
  /** Maximum candidates to return */
  maxCandidates?: number;
  /** Whether to accept partial matches */
  acceptPartialMatch?: boolean;
}

/**
 * Raw address input that may contain various field names
 */
export interface RawAddressInput {
  // Combined address strings
  shipping_address?: string;
  billing_address?: string;
  address?: string;
  full_address?: string;
  
  // Individual components
  address1?: string;
  address_line1?: string;
  address_line_1?: string;
  addressLine1?: string;
  street_address?: string;
  streetAddress?: string;
  
  address2?: string;
  address_line2?: string;
  address_line_2?: string;
  addressLine2?: string;
  apartment?: string;
  apt?: string;
  suite?: string;
  unit?: string;
  
  city?: string;
  shipping_city?: string;
  shippingCity?: string;
  
  state?: string;
  shipping_state?: string;
  shippingState?: string;
  province?: string;
  
  zip?: string;
  zipCode?: string;
  zip_code?: string;
  postal_code?: string;
  postalCode?: string;
  shipping_zip?: string;
  shippingZip?: string;
  
  country?: string;
  shipping_country?: string;
  shippingCountry?: string;
}
