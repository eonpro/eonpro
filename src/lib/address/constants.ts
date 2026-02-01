/**
 * Address Constants
 * =================
 * State mappings, patterns, and configuration for address parsing.
 */

/**
 * State name to 2-letter code mapping
 * Includes full names, common abbreviations, and codes
 */
export const STATE_NAME_TO_CODE: Record<string, string> = {
  // Full names
  'alabama': 'AL',
  'alaska': 'AK',
  'arizona': 'AZ',
  'arkansas': 'AR',
  'california': 'CA',
  'colorado': 'CO',
  'connecticut': 'CT',
  'delaware': 'DE',
  'florida': 'FL',
  'georgia': 'GA',
  'hawaii': 'HI',
  'idaho': 'ID',
  'illinois': 'IL',
  'indiana': 'IN',
  'iowa': 'IA',
  'kansas': 'KS',
  'kentucky': 'KY',
  'louisiana': 'LA',
  'maine': 'ME',
  'maryland': 'MD',
  'massachusetts': 'MA',
  'michigan': 'MI',
  'minnesota': 'MN',
  'mississippi': 'MS',
  'missouri': 'MO',
  'montana': 'MT',
  'nebraska': 'NE',
  'nevada': 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  'ohio': 'OH',
  'oklahoma': 'OK',
  'oregon': 'OR',
  'pennsylvania': 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  'tennessee': 'TN',
  'texas': 'TX',
  'utah': 'UT',
  'vermont': 'VT',
  'virginia': 'VA',
  'washington': 'WA',
  'west virginia': 'WV',
  'wisconsin': 'WI',
  'wyoming': 'WY',
  'district of columbia': 'DC',
  'puerto rico': 'PR',
  'virgin islands': 'VI',
  'guam': 'GU',
  'american samoa': 'AS',
  'northern mariana islands': 'MP',
  
  // 2-letter codes (identity mapping)
  'al': 'AL', 'ak': 'AK', 'az': 'AZ', 'ar': 'AR', 'ca': 'CA',
  'co': 'CO', 'ct': 'CT', 'de': 'DE', 'fl': 'FL', 'ga': 'GA',
  'hi': 'HI', 'id': 'ID', 'il': 'IL', 'in': 'IN', 'ia': 'IA',
  'ks': 'KS', 'ky': 'KY', 'la': 'LA', 'me': 'ME', 'md': 'MD',
  'ma': 'MA', 'mi': 'MI', 'mn': 'MN', 'ms': 'MS', 'mo': 'MO',
  'mt': 'MT', 'ne': 'NE', 'nv': 'NV', 'nh': 'NH', 'nj': 'NJ',
  'nm': 'NM', 'ny': 'NY', 'nc': 'NC', 'nd': 'ND', 'oh': 'OH',
  'ok': 'OK', 'or': 'OR', 'pa': 'PA', 'ri': 'RI', 'sc': 'SC',
  'sd': 'SD', 'tn': 'TN', 'tx': 'TX', 'ut': 'UT', 'vt': 'VT',
  'va': 'VA', 'wa': 'WA', 'wv': 'WV', 'wi': 'WI', 'wy': 'WY',
  'dc': 'DC', 'pr': 'PR', 'vi': 'VI', 'gu': 'GU', 'as': 'AS', 'mp': 'MP',
};

/**
 * Valid 2-letter state codes
 */
export const VALID_STATE_CODES = new Set(Object.values(STATE_NAME_TO_CODE));

/**
 * Apartment/Unit designator patterns
 */
export const APT_PATTERNS = [
  /^APT\.?\s*/i,
  /^APARTMENT\s*/i,
  /^UNIT\s*/i,
  /^STE\.?\s*/i,
  /^SUITE\s*/i,
  /^#\s*/,
  /^BLDG\.?\s*/i,
  /^BUILDING\s*/i,
  /^FLOOR\s*/i,
  /^FL\.?\s*/i,
  /^RM\.?\s*/i,
  /^ROOM\s*/i,
  /^DEPT\.?\s*/i,
  /^LOT\s*/i,
  /^SPACE\s*/i,
  /^SPC\.?\s*/i,
  /^TRLR\.?\s*/i,
  /^TRAILER\s*/i,
];

/**
 * Secondary unit designators (USPS standard)
 */
export const SECONDARY_UNIT_DESIGNATORS = [
  'APT', 'APARTMENT',
  'BLDG', 'BUILDING',
  'DEPT', 'DEPARTMENT',
  'FL', 'FLOOR',
  'HNGR', 'HANGAR',
  'LOT',
  'OFC', 'OFFICE',
  'PH', 'PENTHOUSE',
  'RM', 'ROOM',
  'SPC', 'SPACE',
  'STE', 'SUITE',
  'TRLR', 'TRAILER',
  'UNIT',
  '#',
];

/**
 * Street suffix abbreviations (USPS standard)
 */
export const STREET_SUFFIXES: Record<string, string> = {
  'avenue': 'AVE',
  'ave': 'AVE',
  'av': 'AVE',
  'boulevard': 'BLVD',
  'blvd': 'BLVD',
  'circle': 'CIR',
  'cir': 'CIR',
  'court': 'CT',
  'ct': 'CT',
  'drive': 'DR',
  'dr': 'DR',
  'expressway': 'EXPY',
  'expy': 'EXPY',
  'freeway': 'FWY',
  'fwy': 'FWY',
  'highway': 'HWY',
  'hwy': 'HWY',
  'lane': 'LN',
  'ln': 'LN',
  'parkway': 'PKWY',
  'pkwy': 'PKWY',
  'place': 'PL',
  'pl': 'PL',
  'road': 'RD',
  'rd': 'RD',
  'square': 'SQ',
  'sq': 'SQ',
  'street': 'ST',
  'st': 'ST',
  'terrace': 'TER',
  'ter': 'TER',
  'trail': 'TRL',
  'trl': 'TRL',
  'way': 'WAY',
};

/**
 * Directional abbreviations
 */
export const DIRECTIONALS: Record<string, string> = {
  'north': 'N',
  'south': 'S',
  'east': 'E',
  'west': 'W',
  'northeast': 'NE',
  'northwest': 'NW',
  'southeast': 'SE',
  'southwest': 'SW',
  'n': 'N',
  's': 'S',
  'e': 'E',
  'w': 'W',
  'ne': 'NE',
  'nw': 'NW',
  'se': 'SE',
  'sw': 'SW',
};

/**
 * ZIP code validation pattern (5 digits or 5+4 format)
 */
export const ZIP_CODE_PATTERN = /^\d{5}(-\d{4})?$/;

/**
 * Loose ZIP code pattern (just 5 digits anywhere)
 */
export const ZIP_CODE_LOOSE_PATTERN = /\b(\d{5})(-\d{4})?\b/;

/**
 * PO Box patterns
 */
export const PO_BOX_PATTERNS = [
  /^P\.?\s*O\.?\s*BOX\s*/i,
  /^POST\s*OFFICE\s*BOX\s*/i,
  /^POB\s*/i,
];

/**
 * Military address patterns
 */
export const MILITARY_STATES = new Set(['AA', 'AE', 'AP']);
export const MILITARY_CITIES = new Set(['APO', 'FPO', 'DPO']);
