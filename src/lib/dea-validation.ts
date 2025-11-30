/**
 * DEA Number Validation
 * 
 * DEA numbers follow a specific format:
 * - 2 letters + 6 digits + 1 check digit (9 characters total)
 * - First letter: Registrant type
 * - Second letter: First letter of registrant's last name (or business name for organizations)
 * - Last digit: Check digit calculated from the other digits
 * 
 * Registrant Type Codes (First Letter):
 * - A, B, F, G: Deprecated (older registrations)
 * - C: Practitioner (physician, dentist, veterinarian)
 * - D: Teaching Institution
 * - E: Manufacturer
 * - H: Distributor
 * - J: Importer
 * - K: Exporter
 * - L: Reverse Distributor
 * - M: Mid-Level Practitioner (NP, PA, etc.)
 * - N: Military Practitioner
 * - P: Narcotic Treatment Program
 * - R: Narcotic Treatment Program (newer)
 * - S: Narcotic Treatment Program (newer)
 * - T: Narcotic Treatment Program (newer)
 * - U: Narcotic Treatment Program (newer)
 * - X: Suboxone/Subutex Prescriber (DATA 2000 waiver)
 */

// Valid first letter codes for DEA numbers
const VALID_FIRST_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'R', 'S', 'T', 'U', 'X'];

// Practitioner codes (for providers)
const PRACTITIONER_CODES = ['A', 'B', 'C', 'D', 'F', 'G', 'M', 'N', 'X'];

export interface DEAValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
  registrantType?: string;
  lastNameInitial?: string;
}

/**
 * Get the registrant type description based on the first letter
 */
function getRegistrantType(letter: string): string {
  const types: Record<string, string> = {
    'A': 'Deprecated Practitioner',
    'B': 'Deprecated Practitioner',
    'C': 'Practitioner (MD, DO, DDS, DVM)',
    'D': 'Teaching Institution',
    'E': 'Manufacturer',
    'F': 'Deprecated Practitioner',
    'G': 'Deprecated Practitioner',
    'H': 'Distributor',
    'J': 'Importer',
    'K': 'Exporter',
    'L': 'Reverse Distributor',
    'M': 'Mid-Level Practitioner (NP, PA)',
    'N': 'Military Practitioner',
    'P': 'Narcotic Treatment Program',
    'R': 'Narcotic Treatment Program',
    'S': 'Narcotic Treatment Program',
    'T': 'Narcotic Treatment Program',
    'U': 'Narcotic Treatment Program',
    'X': 'Suboxone/Subutex Prescriber',
  };
  return types[letter.toUpperCase()] || 'Unknown';
}

/**
 * Calculate the DEA check digit
 * 
 * Algorithm:
 * 1. Add digits in positions 1, 3, 5 (odd positions)
 * 2. Add digits in positions 2, 4, 6 (even positions) and multiply by 2
 * 3. Add the two sums together
 * 4. The check digit is the last digit of this sum
 */
function calculateCheckDigit(digits: string): number {
  const d = digits.split('').map(Number);
  
  // Sum of odd position digits (1st, 3rd, 5th)
  const oddSum = d[0] + d[2] + d[4];
  
  // Sum of even position digits (2nd, 4th, 6th) multiplied by 2
  const evenSum = (d[1] + d[3] + d[5]) * 2;
  
  // Total sum
  const total = oddSum + evenSum;
  
  // Check digit is the last digit of the total
  return total % 10;
}

/**
 * Validate a DEA number format and checksum
 * 
 * @param deaNumber - The DEA number to validate
 * @param lastName - Optional: Provider's last name to verify the second letter
 * @returns Validation result with details
 */
export function validateDEA(deaNumber: string, lastName?: string): DEAValidationResult {
  const warnings: string[] = [];
  
  // Remove any spaces or dashes
  const dea = deaNumber.replace(/[\s-]/g, '').toUpperCase();
  
  // Check length
  if (dea.length !== 9) {
    return {
      isValid: false,
      error: 'DEA number must be exactly 9 characters',
    };
  }
  
  // Check format: 2 letters followed by 7 digits
  const formatRegex = /^[A-Z]{2}\d{7}$/;
  if (!formatRegex.test(dea)) {
    return {
      isValid: false,
      error: 'DEA number must be 2 letters followed by 7 digits',
    };
  }
  
  const firstLetter = dea[0];
  const secondLetter = dea[1];
  const digits = dea.substring(2, 8); // First 6 digits
  const checkDigit = parseInt(dea[8], 10); // 7th digit (check digit)
  
  // Validate first letter (registrant type)
  if (!VALID_FIRST_LETTERS.includes(firstLetter)) {
    return {
      isValid: false,
      error: `Invalid registrant type code: ${firstLetter}`,
    };
  }
  
  // Calculate and verify check digit
  const calculatedCheckDigit = calculateCheckDigit(digits);
  if (calculatedCheckDigit !== checkDigit) {
    return {
      isValid: false,
      error: 'Invalid DEA number (checksum failed)',
    };
  }
  
  // If last name is provided, verify the second letter matches
  if (lastName) {
    const expectedInitial = lastName.trim().toUpperCase()[0];
    if (secondLetter !== expectedInitial) {
      warnings.push(
        `Second letter '${secondLetter}' does not match provider's last name initial '${expectedInitial}'`
      );
    }
  }
  
  // Check if it's a practitioner code
  if (!PRACTITIONER_CODES.includes(firstLetter)) {
    warnings.push(
      `Registrant type '${firstLetter}' is not typically used for individual practitioners`
    );
  }
  
  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    registrantType: getRegistrantType(firstLetter),
    lastNameInitial: secondLetter,
  };
}

/**
 * Simple validation check - returns true/false only
 */
export function isValidDEA(deaNumber: string): boolean {
  return validateDEA(deaNumber).isValid;
}

/**
 * Format a DEA number for display (adds a space after the letters)
 */
export function formatDEA(deaNumber: string): string {
  const dea = deaNumber.replace(/[\s-]/g, '').toUpperCase();
  if (dea.length === 9) {
    return `${dea.substring(0, 2)} ${dea.substring(2)}`;
  }
  return deaNumber;
}

