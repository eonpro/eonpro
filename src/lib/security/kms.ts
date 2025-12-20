/**
 * AWS KMS Integration for HIPAA-Compliant Key Management
 * 
 * This module provides secure encryption key management using AWS KMS.
 * Keys are never stored in environment variables in production - they're
 * retrieved from KMS at runtime.
 * 
 * @module security/kms
 * @security CRITICAL - This module handles master encryption keys
 */

import { KMSClient, DecryptCommand, GenerateDataKeyCommand, EncryptCommand } from '@aws-sdk/client-kms';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

interface KMSConfig {
  region: string;
  keyId: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface DataKey {
  plaintext: Buffer;
  ciphertext: Buffer;
}

interface CachedKey {
  key: Buffer;
  expiresAt: number;
}

// ============================================================================
// Configuration
// ============================================================================

const KMS_CONFIG: KMSConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  keyId: process.env.AWS_KMS_KEY_ID || '',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
};

// Key cache TTL (5 minutes) - short for security, but reduces KMS calls
const KEY_CACHE_TTL_MS = 5 * 60 * 1000;

// ============================================================================
// KMS Client Singleton
// ============================================================================

let kmsClient: KMSClient | null = null;

function getKMSClient(): KMSClient {
  if (kmsClient) {
    return kmsClient;
  }

  const config: Record<string, unknown> = {
    region: KMS_CONFIG.region,
  };

  // Use explicit credentials if provided, otherwise rely on IAM role
  if (KMS_CONFIG.accessKeyId && KMS_CONFIG.secretAccessKey) {
    config.credentials = {
      accessKeyId: KMS_CONFIG.accessKeyId,
      secretAccessKey: KMS_CONFIG.secretAccessKey,
    };
  }

  kmsClient = new KMSClient(config);
  return kmsClient;
}

// ============================================================================
// Key Cache (In-Memory with TTL)
// ============================================================================

const keyCache = new Map<string, CachedKey>();

function getCachedKey(keyId: string): Buffer | null {
  const cached = keyCache.get(keyId);
  
  if (!cached) {
    return null;
  }
  
  if (Date.now() > cached.expiresAt) {
    keyCache.delete(keyId);
    return null;
  }
  
  return cached.key;
}

function setCachedKey(keyId: string, key: Buffer): void {
  keyCache.set(keyId, {
    key,
    expiresAt: Date.now() + KEY_CACHE_TTL_MS,
  });
}

// ============================================================================
// Core KMS Operations
// ============================================================================

/**
 * Check if KMS is configured and should be used
 */
export function isKMSEnabled(): boolean {
  return Boolean(KMS_CONFIG.keyId && process.env.NODE_ENV === 'production');
}

/**
 * Generate a new data encryption key using KMS
 * Returns both plaintext (for encryption) and ciphertext (for storage)
 */
export async function generateDataKey(): Promise<DataKey> {
  if (!KMS_CONFIG.keyId) {
    throw new Error('AWS_KMS_KEY_ID is not configured');
  }

  const client = getKMSClient();
  
  try {
    const command = new GenerateDataKeyCommand({
      KeyId: KMS_CONFIG.keyId,
      KeySpec: 'AES_256',
    });
    
    const response = await client.send(command);
    
    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('KMS did not return key material');
    }
    
    logger.info('Generated new data encryption key from KMS');
    
    return {
      plaintext: Buffer.from(response.Plaintext),
      ciphertext: Buffer.from(response.CiphertextBlob),
    };
  } catch (error) {
    logger.error('Failed to generate data key from KMS', error as Error);
    throw new Error('KMS key generation failed');
  }
}

/**
 * Decrypt a data encryption key using KMS
 */
export async function decryptDataKey(encryptedKey: Buffer): Promise<Buffer> {
  if (!KMS_CONFIG.keyId) {
    throw new Error('AWS_KMS_KEY_ID is not configured');
  }

  // Check cache first
  const cacheKey = encryptedKey.toString('base64');
  const cached = getCachedKey(cacheKey);
  if (cached) {
    return cached;
  }

  const client = getKMSClient();
  
  try {
    const command = new DecryptCommand({
      CiphertextBlob: encryptedKey,
      KeyId: KMS_CONFIG.keyId,
    });
    
    const response = await client.send(command);
    
    if (!response.Plaintext) {
      throw new Error('KMS did not return decrypted key');
    }
    
    const decryptedKey = Buffer.from(response.Plaintext);
    
    // Cache the decrypted key
    setCachedKey(cacheKey, decryptedKey);
    
    return decryptedKey;
  } catch (error) {
    logger.error('Failed to decrypt data key from KMS', error as Error);
    throw new Error('KMS key decryption failed');
  }
}

/**
 * Encrypt data directly using KMS (for small amounts of data)
 * Note: For large data, use envelope encryption with generateDataKey
 */
export async function encryptWithKMS(plaintext: Buffer): Promise<Buffer> {
  if (!KMS_CONFIG.keyId) {
    throw new Error('AWS_KMS_KEY_ID is not configured');
  }

  const client = getKMSClient();
  
  try {
    const command = new EncryptCommand({
      KeyId: KMS_CONFIG.keyId,
      Plaintext: plaintext,
    });
    
    const response = await client.send(command);
    
    if (!response.CiphertextBlob) {
      throw new Error('KMS did not return ciphertext');
    }
    
    return Buffer.from(response.CiphertextBlob);
  } catch (error) {
    logger.error('Failed to encrypt with KMS', error as Error);
    throw new Error('KMS encryption failed');
  }
}

/**
 * Decrypt data directly using KMS
 */
export async function decryptWithKMS(ciphertext: Buffer): Promise<Buffer> {
  if (!KMS_CONFIG.keyId) {
    throw new Error('AWS_KMS_KEY_ID is not configured');
  }

  const client = getKMSClient();
  
  try {
    const command = new DecryptCommand({
      CiphertextBlob: ciphertext,
      KeyId: KMS_CONFIG.keyId,
    });
    
    const response = await client.send(command);
    
    if (!response.Plaintext) {
      throw new Error('KMS did not return plaintext');
    }
    
    return Buffer.from(response.Plaintext);
  } catch (error) {
    logger.error('Failed to decrypt with KMS', error as Error);
    throw new Error('KMS decryption failed');
  }
}

// ============================================================================
// Encryption Key Provider
// ============================================================================

let encryptionKeyPromise: Promise<Buffer> | null = null;

/**
 * Get the encryption key for PHI encryption
 * In production: Fetches from KMS
 * In development: Uses ENCRYPTION_KEY environment variable
 */
export async function getEncryptionKey(): Promise<Buffer> {
  // In development/test, use environment variable
  if (!isKMSEnabled()) {
    const keyHex = process.env.ENCRYPTION_KEY;
    
    if (!keyHex || keyHex.length !== 64) {
      throw new Error(
        'ENCRYPTION_KEY must be 64 hex characters (32 bytes). ' +
        'Generate with: openssl rand -hex 32'
      );
    }
    
    return Buffer.from(keyHex, 'hex');
  }
  
  // In production, fetch from KMS (with caching)
  if (!encryptionKeyPromise) {
    encryptionKeyPromise = fetchEncryptionKeyFromKMS();
  }
  
  return encryptionKeyPromise;
}

async function fetchEncryptionKeyFromKMS(): Promise<Buffer> {
  // Check if we have an encrypted key in environment (envelope encryption)
  const encryptedKeyBase64 = process.env.ENCRYPTED_PHI_KEY;
  
  if (encryptedKeyBase64) {
    // Decrypt the data key using KMS
    const encryptedKey = Buffer.from(encryptedKeyBase64, 'base64');
    return decryptDataKey(encryptedKey);
  }
  
  // Otherwise, generate a new data key (first run setup)
  logger.warn('No ENCRYPTED_PHI_KEY found, generating new data key');
  const dataKey = await generateDataKey();
  
  // Log the encrypted key for storage (should be saved to secrets manager)
  logger.info('Generated new PHI encryption key', {
    encryptedKey: dataKey.ciphertext.toString('base64'),
    note: 'Save this as ENCRYPTED_PHI_KEY in your secrets',
  });
  
  return dataKey.plaintext;
}

/**
 * Rotate the encryption key
 * This generates a new data key - existing data must be re-encrypted
 */
export async function rotateEncryptionKey(): Promise<{
  newEncryptedKey: string;
  newPlaintextKey: Buffer;
}> {
  if (!isKMSEnabled()) {
    throw new Error('Key rotation requires KMS to be enabled');
  }
  
  const dataKey = await generateDataKey();
  
  logger.security('Encryption key rotated', {
    newEncryptedKey: dataKey.ciphertext.toString('base64').substring(0, 20) + '...',
  });
  
  return {
    newEncryptedKey: dataKey.ciphertext.toString('base64'),
    newPlaintextKey: dataKey.plaintext,
  };
}

// ============================================================================
// Initialization & Health Check
// ============================================================================

/**
 * Verify KMS connectivity and key access
 */
export async function verifyKMSAccess(): Promise<boolean> {
  if (!isKMSEnabled()) {
    return true; // KMS not required in development
  }
  
  try {
    // Try to generate a data key as a connectivity test
    const testKey = await generateDataKey();
    
    // Verify we can decrypt it
    const decrypted = await decryptDataKey(testKey.ciphertext);
    
    // Verify the decrypted key matches
    if (!testKey.plaintext.equals(decrypted)) {
      throw new Error('Key decryption verification failed');
    }
    
    logger.info('KMS access verified successfully');
    return true;
  } catch (error) {
    logger.error('KMS access verification failed', error as Error);
    return false;
  }
}

/**
 * Clear cached keys (call on security events)
 */
export function clearKeyCache(): void {
  keyCache.clear();
  encryptionKeyPromise = null;
  logger.security('Encryption key cache cleared');
}
