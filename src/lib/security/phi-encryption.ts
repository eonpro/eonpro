/**
 * PHI Encryption Service
 * ======================
 * 
 * HIPAA-compliant encryption for Protected Health Information (PHI)
 * using AES-256-GCM authenticated encryption.
 * 
 * @module security/phi-encryption
 * @version 2.0.0
 * @security CRITICAL - This module handles all PHI encryption/decryption
 * 
 * ## Features
 * - AES-256-GCM authenticated encryption
 * - Unique IV (Initialization Vector) per encryption
 * - AWS KMS integration for production key management
 * - Key rotation support
 * - Batch encryption/decryption operations
 * 
 * ## Security Notes
 * - NEVER log decrypted PHI data
 * - NEVER store encryption keys in code
 * - ALWAYS use async versions in production for KMS support
 * - Key must be 32 bytes (256 bits)
 * 
 * ## Usage
 * ```typescript
 * import { encryptPHI, decryptPHI } from '@/lib/security/phi-encryption';
 * 
 * // Encrypt sensitive data
 * const encrypted = encryptPHI(patient.ssn);
 * 
 * // Decrypt for authorized access
 * const ssn = decryptPHI(encrypted);
 * ```
 * 
 * ## Encrypted Data Format
 * `base64(iv):base64(authTag):base64(ciphertext)`
 * 
 * @see {@link https://csrc.nist.gov/publications/detail/sp/800-38d/final} NIST GCM Specification
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';
import { getEncryptionKey, isKMSEnabled } from './kms';

const algorithm = 'aes-256-gcm';
const ivLength = 16;    // Initialization vector length
const tagLength = 16;   // GCM auth tag length

// ============================================================================
// Key Management
// ============================================================================

let encryptionKey: Buffer | null = null;
let keyInitPromise: Promise<void> | null = null;

/**
 * Initialize the encryption key (async for KMS support)
 */
async function initializeKey(): Promise<void> {
  if (encryptionKey) {
    return;
  }
  
  encryptionKey = await getEncryptionKey();
  
  if (encryptionKey.length !== 32) {
    throw new Error('Encryption key must be 32 bytes');
  }
}

/**
 * Get the encryption key, initializing if needed
 */
async function getKey(): Promise<Buffer> {
  if (!keyInitPromise) {
    keyInitPromise = initializeKey();
  }
  
  await keyInitPromise;
  
  if (!encryptionKey) {
    throw new Error('Encryption key not initialized');
  }
  
  return encryptionKey;
}

/**
 * Get the encryption key synchronously (for legacy code)
 * Falls back to environment variable if KMS not ready
 */
function getKeySync(): Buffer {
  if (encryptionKey) {
    return encryptionKey;
  }
  
  // Fallback to environment variable for sync operations
  const keyHex = process.env.ENCRYPTION_KEY;
  
  if (!keyHex) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required. ' +
      'Generate with: openssl rand -hex 32'
    );
  }
  
  if (keyHex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes (64 hex characters). ' +
      'Current length: ' + keyHex.length
    );
  }
  
  try {
    const key = Buffer.from(keyHex, 'hex');
    encryptionKey = key; // Cache it
    return key;
  } catch {
    throw new Error('ENCRYPTION_KEY must be valid hexadecimal');
  }
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypts PHI data using AES-256-GCM
 * @param text - The plaintext PHI to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData
 */
export function encryptPHI(text: string | null | undefined): string | null {
  if (!text) {
    return null;
  }
  
  try {
    const key = getKeySync();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV, auth tag, and encrypted data
    // Format: base64(iv):base64(authTag):base64(encrypted)
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64')
    ].join(':');
  } catch (error) {
    logger.error('Failed to encrypt PHI', error as Error);
    throw new Error('Encryption failed - PHI cannot be stored unencrypted');
  }
}

/**
 * Async version of encryptPHI (uses KMS in production)
 */
export async function encryptPHIAsync(text: string | null | undefined): Promise<string | null> {
  if (!text) {
    return null;
  }
  
  try {
    const key = await getKey();
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    return [
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64')
    ].join(':');
  } catch (error) {
    logger.error('Failed to encrypt PHI', error as Error);
    throw new Error('Encryption failed - PHI cannot be stored unencrypted');
  }
}

/**
 * Decrypts PHI data encrypted with encryptPHI
 * @param encryptedData - The encrypted string
 * @returns Decrypted plaintext or null
 */
export function decryptPHI(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) {
    return null;
  }
  
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      // Data might be unencrypted (migration period)
      logger.warn('Attempting to decrypt non-encrypted data');
      return encryptedData;
    }
    
    const key = getKeySync();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Failed to decrypt PHI', error as Error, { 
      dataLength: encryptedData?.length 
    });
    throw new Error('Decryption failed - PHI data may be corrupted');
  }
}

/**
 * Async version of decryptPHI (uses KMS in production)
 */
export async function decryptPHIAsync(encryptedData: string | null | undefined): Promise<string | null> {
  if (!encryptedData) {
    return null;
  }
  
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      logger.warn('Attempting to decrypt non-encrypted data');
      return encryptedData;
    }
    
    const key = await getKey();
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Failed to decrypt PHI', error as Error, { 
      dataLength: encryptedData?.length 
    });
    throw new Error('Decryption failed - PHI data may be corrupted');
  }
}

// ============================================================================
// Batch & Object Operations
// ============================================================================

/**
 * Default PHI fields for patient encryption
 * SOC 2 Compliance: All PII/PHI fields must be encrypted at rest
 */
export const DEFAULT_PHI_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dob',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
] as const;

/**
 * Encrypts an entire patient object's PHI fields
 */
export function encryptPatientPHI<T extends Record<string, unknown>>(
  patient: T,
  fieldsToEncrypt: (keyof T)[] = DEFAULT_PHI_FIELDS as unknown as (keyof T)[]
): T {
  const encrypted = { ...patient };
  
  for (const field of fieldsToEncrypt) {
    if (patient[field]) {
      (encrypted[field] as unknown) = encryptPHI(String(patient[field]));
    }
  }
  
  return encrypted;
}

/**
 * Decrypts an entire patient object's PHI fields
 * Handles decryption failures gracefully per-field
 */
export function decryptPatientPHI<T extends Record<string, unknown>>(
  patient: T,
  fieldsToDecrypt: (keyof T)[] = DEFAULT_PHI_FIELDS as unknown as (keyof T)[]
): T {
  const decrypted = { ...patient };

  for (const field of fieldsToDecrypt) {
    if (patient[field]) {
      try {
        const value = String(patient[field]);
        // Check if the value looks encrypted (3 base64 parts separated by colons)
        // Each part must be valid base64. Min length reduced to 2 to handle short
        // encrypted values like state codes (e.g., "FL" -> short ciphertext)
        const parts = value.split(':');
        const looksEncrypted = parts.length === 3 &&
          parts.every(part => /^[A-Za-z0-9+/]+=*$/.test(part) && part.length >= 2);

        if (looksEncrypted) {
          const decryptedValue = decryptPHI(value);
          (decrypted[field] as unknown) = decryptedValue;
        }
        // If not encrypted, keep original value
      } catch (error) {
        // Decryption failed - show placeholder instead of encrypted blob
        logger.warn(`Failed to decrypt field ${String(field)} for patient`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Return null to indicate decryption failure (UI should handle this)
        (decrypted[field] as unknown) = null;
      }
    }
  }

  return decrypted;
}

/**
 * Checks if a string appears to be encrypted
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) {
    return false;
  }
  
  // Check for our encryption format: base64:base64:base64
  const parts = value.split(':');
  if (parts.length !== 3) {
    return false;
  }
  
  try {
    // Verify each part is valid base64
    Buffer.from(parts[0], 'base64');
    Buffer.from(parts[1], 'base64');
    Buffer.from(parts[2], 'base64');
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch encrypt multiple values efficiently
 */
export function encryptBatch(values: (string | null)[]): (string | null)[] {
  return values.map(value => encryptPHI(value));
}

/**
 * Batch decrypt multiple values efficiently
 */
export function decryptBatch(values: (string | null)[]): (string | null)[] {
  return values.map(value => decryptPHI(value));
}

// ============================================================================
// Key Rotation Support
// ============================================================================

/**
 * Re-encrypt data with a new key (for key rotation)
 */
export async function reencryptPHI(
  encryptedData: string,
  oldKey: Buffer,
  newKey: Buffer
): Promise<string> {
  // Decrypt with old key
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  
  const decipher = crypto.createDecipheriv(algorithm, oldKey, iv);
  decipher.setAuthTag(authTag);
  
  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
  
  // Encrypt with new key
  const newIv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv(algorithm, newKey, newIv);
  
  const newEncrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const newAuthTag = cipher.getAuthTag();
  
  return [
    newIv.toString('base64'),
    newAuthTag.toString('base64'),
    newEncrypted.toString('base64')
  ].join(':');
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize encryption service (call at app startup)
 */
export async function initializeEncryption(): Promise<void> {
  try {
    await getKey();
    logger.info('PHI encryption initialized', {
      kmsEnabled: isKMSEnabled(),
    });
  } catch (error) {
    logger.error('Failed to initialize PHI encryption', error as Error);
    throw error;
  }
}

/**
 * Clear encryption key from memory (for security events)
 */
export function clearEncryptionKey(): void {
  encryptionKey = null;
  keyInitPromise = null;
  logger.security('Encryption key cleared from memory');
}

// ============================================================================
// Export for testing
// ============================================================================

export const _testExports = {
  algorithm,
  ivLength,
  tagLength,
  getKeySync,
};
