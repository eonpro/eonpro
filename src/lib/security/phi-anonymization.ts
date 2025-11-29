/**
 * PHI Anonymization Service
 * Removes or replaces PHI before sending to external services
 * HIPAA-compliant data de-identification
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';

// PHI patterns to detect and remove
const PHI_PATTERNS = {
  // Social Security Numbers
  SSN: /\b\d{3}-?\d{2}-?\d{4}\b/gi,
  
  // Phone numbers
  PHONE: /\b(?:\+?1[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/gi,
  
  // Email addresses
  EMAIL: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi,
  
  // Credit card numbers
  CREDIT_CARD: /\b(?:\d{4}[-\s]?){3}\d{4}\b/gi,
  
  // Date patterns (birth dates, etc.)
  DATES: /\b(?:0?[1-9]|1[0-2])[-/](?:0?[1-9]|[12]\d|3[01])[-/](?:19|20)?\d{2}\b/gi,
  
  // Street addresses
  STREET_ADDRESS: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Circle|Cir|Plaza|Pl|Terrace|Ter|Way|Parkway|Pkwy)\b/gi,
  
  // Medical Record Numbers (assuming 6-10 digits)
  MRN: /\b(?:MRN|Medical Record|Patient ID)[:\s#]*\d{6,10}\b/gi,
  
  // DEA numbers
  DEA: /\b[A-Z]{2}\d{7}\b/g,
  
  // NPI numbers (10 digits)
  NPI: /\b\d{10}\b/g,
  
  // IP Addresses
  IP_ADDRESS: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  
  // URLs with potential PHI
  URL_WITH_PARAMS: /https?:\/\/[^\s]+[?&][^\s]+/gi,
};

/**
 * Generate consistent fake data for a given input
 * Uses hashing to ensure same input always produces same output
 */
function generateConsistentFake(input: string, type: string): string {
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  const numHash = parseInt(hash.substring(0, 8), 16);
  
  switch (type) {
    case 'name':
      const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emma', 'Robert', 'Lisa'];
      const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis'];
      return `${firstNames[numHash % firstNames.length]} ${lastNames[(numHash >> 8) % lastNames.length]}`;
    
    case 'date':
      const year = 1950 + (numHash % 50);
      const month = (numHash % 12) + 1;
      const day = (numHash % 28) + 1;
      return `${month}/${day}/${year}`;
    
    case 'phone':
      return `555-${String(numHash % 1000).padStart(3, '0')}-${String((numHash >> 10) % 10000).padStart(4, '0')}`;
    
    case 'email':
      return `patient${numHash % 10000}@example.com`;
    
    case 'ssn':
      return `XXX-XX-${String(numHash % 10000).padStart(4, '0')}`;
    
    case 'address':
      return `${numHash % 9999} Main Street`;
    
    default:
      return '[REDACTED]';
  }
}

/**
 * Anonymize a text string by removing/replacing PHI
 */
export function anonymizeText(text: string): string {
  let anonymized = text;
  
  // Replace SSNs
  anonymized = anonymized.replace(PHI_PATTERNS.SSN, '[SSN-REDACTED]');
  
  // Replace phone numbers
  anonymized = anonymized.replace(PHI_PATTERNS.PHONE, (match) => 
    generateConsistentFake(match, 'phone')
  );
  
  // Replace email addresses
  anonymized = anonymized.replace(PHI_PATTERNS.EMAIL, (match) => 
    generateConsistentFake(match, 'email')
  );
  
  // Replace credit cards
  anonymized = anonymized.replace(PHI_PATTERNS.CREDIT_CARD, 'XXXX-XXXX-XXXX-XXXX');
  
  // Replace dates (but keep relative time references)
  anonymized = anonymized.replace(PHI_PATTERNS.DATES, (match) => {
    // Keep common relative dates
    if (match.toLowerCase().includes('today') || 
        match.toLowerCase().includes('yesterday') ||
        match.toLowerCase().includes('tomorrow')) {
      return match;
    }
    return generateConsistentFake(match, 'date');
  });
  
  // Replace street addresses
  anonymized = anonymized.replace(PHI_PATTERNS.STREET_ADDRESS, 
    generateConsistentFake('address', 'address')
  );
  
  // Replace medical record numbers
  anonymized = anonymized.replace(PHI_PATTERNS.MRN, 'MRN: [REDACTED]');
  
  // Replace DEA numbers
  anonymized = anonymized.replace(PHI_PATTERNS.DEA, 'DEA-REDACTED');
  
  // Replace potential NPI numbers (be careful not to replace other 10-digit numbers)
  anonymized = anonymized.replace(/\bNPI[:\s#]*\d{10}\b/gi, 'NPI: [REDACTED]');
  
  // Replace IP addresses
  anonymized = anonymized.replace(PHI_PATTERNS.IP_ADDRESS, '0.0.0.0');
  
  // Replace URLs with parameters
  anonymized = anonymized.replace(PHI_PATTERNS.URL_WITH_PARAMS, (url) => {
    const baseUrl = url.split('?')[0];
    return `${baseUrl}?[params-redacted]`;
  });
  
  return anonymized;
}

/**
 * Anonymize patient name consistently
 */
export function anonymizeName(firstName: string, lastName: string): string {
  const combined = `${firstName}-${lastName}`;
  return generateConsistentFake(combined, 'name');
}

/**
 * Anonymize an object by removing/replacing PHI fields
 */
export function anonymizeObject<T extends Record<string, any>>(
  obj: T,
  fieldsToAnonymize: string[] = []
): T {
  const anonymized = { ...obj };
  
  // Standard PHI fields to always check
  const standardPHIFields = [
    'ssn', 'socialSecurityNumber',
    'dob', 'dateOfBirth', 'birthDate',
    'phone', 'phoneNumber', 'mobile', 'cell',
    'email', 'emailAddress',
    'address', 'street', 'streetAddress',
    'firstName', 'lastName', 'name', 'patientName',
    'mrn', 'medicalRecordNumber', 'patientId',
    'creditCard', 'cardNumber',
    'dea', 'deaNumber',
    'npi', 'npiNumber',
    'ipAddress', 'ip'
  ];
  
  const allFieldsToCheck = [...new Set([...standardPHIFields, ...fieldsToAnonymize])];
  
  for (const field of allFieldsToCheck) {
    if (field in anonymized) {
      const value = anonymized[field as keyof T];
      
      if (typeof value === 'string') {
        // Apply appropriate anonymization based on field name
        if (field.toLowerCase().includes('name')) {
          anonymized[field as keyof T] = generateConsistentFake(value, 'name') as any;
        } else if (field.toLowerCase().includes('date') || field === 'dob') {
          anonymized[field as keyof T] = generateConsistentFake(value, 'date') as any;
        } else if (field.toLowerCase().includes('phone')) {
          anonymized[field as keyof T] = generateConsistentFake(value, 'phone') as any;
        } else if (field.toLowerCase().includes('email')) {
          anonymized[field as keyof T] = generateConsistentFake(value, 'email') as any;
        } else if (field.toLowerCase().includes('ssn')) {
          anonymized[field as keyof T] = generateConsistentFake(value, 'ssn') as any;
        } else if (field.toLowerCase().includes('address')) {
          anonymized[field as keyof T] = generateConsistentFake(value, 'address') as any;
        } else {
          // For any other PHI field, anonymize the text content
          anonymized[field as keyof T] = anonymizeText(value) as any;
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively anonymize nested objects
        anonymized[field as keyof T] = anonymizeObject(value) as any;
      }
    }
  }
  
  return anonymized;
}

/**
 * Create an anonymization mapping for re-identification
 * (Store securely, never send to external services)
 */
export function createAnonymizationMap(
  originalData: Record<string, any>
): Map<string, string> {
  const mapping = new Map<string, string>();
  
  // Store mappings for potential re-identification
  if (originalData.firstName && originalData.lastName) {
    const anonName = anonymizeName(originalData.firstName, originalData.lastName);
    mapping.set(anonName, `${originalData.firstName} ${originalData.lastName}`);
  }
  
  if (originalData.email) {
    const anonEmail = generateConsistentFake(originalData.email, 'email');
    mapping.set(anonEmail, originalData.email);
  }
  
  if (originalData.phone) {
    const anonPhone = generateConsistentFake(originalData.phone, 'phone');
    mapping.set(anonPhone, originalData.phone);
  }
  
  return mapping;
}

/**
 * Log anonymization for audit purposes
 */
export function logAnonymization(
  userId: number,
  purpose: string,
  dataType: string
): void {
  logger.security('PHI Anonymization', {
    userId,
    purpose,
    dataType,
    timestamp: new Date().toISOString()
  });
}
