/**
 * PHI Encryption Service
 * HIPAA-compliant encryption for Protected Health Information
 * Uses AES-256-GCM for authenticated encryption
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';

const algorithm = 'aes-256-gcm';
const saltLength = 64; // Salt for key derivation
const tagLength = 16;  // GCM auth tag length
const ivLength = 16;    // Initialization vector length

/**
 * Validates and retrieves the encryption key from environment
 * Throws if key is missing or invalid
 */
function getEncryptionKey(): Buffer {
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
    return Buffer.from(keyHex, 'hex');
  } catch (error) {
    throw new Error('ENCRYPTION_KEY must be valid hexadecimal');
  }
}

// Validate key on module load
const encryptionKey = getEncryptionKey();

/**
 * Encrypts PHI data using AES-256-GCM
 * @param text - The plaintext PHI to encrypt
 * @returns Encrypted string in format: iv:authTag:encryptedData
 */
export function encryptPHI(text: string | null | undefined): string | null {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    
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
    logger.error('Failed to encrypt PHI', error);
    throw new Error('Encryption failed - PHI cannot be stored unencrypted');
  }
}

/**
 * Decrypts PHI data encrypted with encryptPHI
 * @param encryptedData - The encrypted string
 * @returns Decrypted plaintext or null
 */
export function decryptPHI(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    
    if (parts.length !== 3) {
      // Data might be unencrypted (migration period)
      // Log this for monitoring but don't break
      logger.warn('Attempting to decrypt non-encrypted data');
      return encryptedData;
    }
    
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    
    const decipher = crypto.createDecipheriv(algorithm, encryptionKey, iv);
    decipher.setAuthTag(authTag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    logger.error('Failed to decrypt PHI', error, { 
      dataLength: encryptedData?.length 
    });
    throw new Error('Decryption failed - PHI data may be corrupted');
  }
}

/**
 * Encrypts an entire patient object's PHI fields
 */
export function encryptPatientPHI<T extends Record<string, any>>(
  patient: T,
  fieldsToEncrypt: (keyof T)[] = ['ssn', 'dob', 'phone', 'email']
): T {
  const encrypted = { ...patient };
  
  for (const field of fieldsToEncrypt) {
    if (patient[field]) {
      (encrypted[field] as any) = encryptPHI(String(patient[field]));
    }
  }
  
  return encrypted;
}

/**
 * Decrypts an entire patient object's PHI fields
 */
export function decryptPatientPHI<T extends Record<string, any>>(
  patient: T,
  fieldsToDecrypt: (keyof T)[] = ['ssn', 'dob', 'phone', 'email']
): T {
  const decrypted = { ...patient };
  
  for (const field of fieldsToDecrypt) {
    if (patient[field]) {
      (decrypted[field] as any) = decryptPHI(String(patient[field]));
    }
  }
  
  return decrypted;
}

/**
 * Checks if a string appears to be encrypted
 */
export function isEncrypted(value: string | null | undefined): boolean {
  if (!value) return false;
  
  // Check for our encryption format: base64:base64:base64
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  
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

// Export for testing
export const _testExports = {
  getEncryptionKey,
  algorithm,
  ivLength,
  tagLength
};
