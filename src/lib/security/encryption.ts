/**
 * General encryption utilities
 * Re-exports PHI encryption for API credentials and other sensitive data
 */

import { encryptPHI, decryptPHI, isEncrypted } from './phi-encryption';

/**
 * Encrypt sensitive data (API keys, passwords, etc.)
 */
export function encrypt(text: string | null | undefined): string | null {
  return encryptPHI(text);
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encryptedData: string | null | undefined): string | null {
  return decryptPHI(encryptedData);
}

/**
 * Check if a value is encrypted
 */
export { isEncrypted };

