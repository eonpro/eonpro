/**
 * Source-file targeting tests for lib/encryption.ts
 * These tests directly import and execute the actual module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('lib/encryption.ts - Direct Source Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Set a consistent encryption key for testing (exactly 32 bytes for AES-256)
    process.env.CARD_ENCRYPTION_KEY = '01234567890123456789012345678901';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('encryptCardData / decryptCardData', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const { encryptCardData, decryptCardData } = await import('@/lib/encryption');
      
      const original = '4111111111111111';
      const encrypted = encryptCardData(original);
      
      expect(encrypted).not.toBe(original);
      expect(encrypted).toContain(':'); // IV separator
      
      const decrypted = decryptCardData(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const { encryptCardData } = await import('@/lib/encryption');
      
      const original = '4111111111111111';
      const encrypted1 = encryptCardData(original);
      const encrypted2 = encryptCardData(original);
      
      // Due to random IV, each encryption should be different
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle empty strings', async () => {
      const { encryptCardData, decryptCardData } = await import('@/lib/encryption');
      
      const encrypted = encryptCardData('');
      const decrypted = decryptCardData(encrypted);
      
      expect(decrypted).toBe('');
    });

    it('should handle special characters', async () => {
      const { encryptCardData, decryptCardData } = await import('@/lib/encryption');
      
      const original = 'Special !@#$%^&*() chars 日本語';
      const encrypted = encryptCardData(original);
      const decrypted = decryptCardData(encrypted);
      
      expect(decrypted).toBe(original);
    });
  });

  describe('encryptData / decryptData aliases', () => {
    it('should work as aliases for card encryption', async () => {
      const { encryptData, decryptData } = await import('@/lib/encryption');
      
      const original = 'sensitive-data';
      const encrypted = encryptData(original);
      const decrypted = decryptData(encrypted);
      
      expect(decrypted).toBe(original);
    });
  });

  describe('encrypt / decrypt aliases', () => {
    it('should work as generic aliases', async () => {
      const { encrypt, decrypt } = await import('@/lib/encryption');
      
      const original = 'api-key-12345';
      const encrypted = encrypt(original);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });
  });

  describe('getCardBrand', () => {
    it('should detect Visa cards', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('4111111111111111')).toBe('Visa');
      expect(getCardBrand('4242424242424242')).toBe('Visa');
    });

    it('should detect Mastercard', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('5111111111111118')).toBe('Mastercard');
      expect(getCardBrand('5500000000000004')).toBe('Mastercard');
    });

    it('should detect American Express', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('371449635398431')).toBe('American Express');
      expect(getCardBrand('340000000000009')).toBe('American Express');
    });

    it('should detect Discover', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('6011111111111117')).toBe('Discover');
      expect(getCardBrand('6500000000000002')).toBe('Discover');
    });

    it('should detect JCB', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('3530111333300000')).toBe('JCB');
    });

    it('should detect Diners Club', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('30569309025904')).toBe('Diners Club');
      expect(getCardBrand('38520000023237')).toBe('Diners Club');
    });

    it('should return Unknown for unrecognized cards', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('9999999999999999')).toBe('Unknown');
    });

    it('should handle cards with spaces', async () => {
      const { getCardBrand } = await import('@/lib/encryption');
      
      expect(getCardBrand('4111 1111 1111 1111')).toBe('Visa');
    });
  });

  describe('maskCardNumber', () => {
    it('should mask card number showing last 4 digits', async () => {
      const { maskCardNumber } = await import('@/lib/encryption');
      
      expect(maskCardNumber('4111111111111111')).toBe('****1111');
      expect(maskCardNumber('5500000000000004')).toBe('****0004');
    });

    it('should handle cards with spaces', async () => {
      const { maskCardNumber } = await import('@/lib/encryption');
      
      expect(maskCardNumber('4111 1111 1111 1111')).toBe('****1111');
    });
  });

  describe('formatCardNumber', () => {
    it('should format card number with spaces', async () => {
      const { formatCardNumber } = await import('@/lib/encryption');
      
      expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
    });

    it('should handle partial card numbers', async () => {
      const { formatCardNumber } = await import('@/lib/encryption');
      
      expect(formatCardNumber('411111')).toBe('4111 11');
      expect(formatCardNumber('41111111')).toBe('4111 1111');
    });

    it('should strip non-digits', async () => {
      const { formatCardNumber } = await import('@/lib/encryption');
      
      expect(formatCardNumber('4111-1111-1111-1111')).toBe('4111 1111 1111 1111');
    });
  });

  describe('validateCardNumber', () => {
    it('should validate correct Visa card', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('4111111111111111')).toBe(true);
    });

    it('should validate correct Mastercard', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('5500000000000004')).toBe(true);
    });

    it('should reject invalid card numbers (Luhn check)', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('4111111111111112')).toBe(false);
      expect(validateCardNumber('1234567890123456')).toBe(false);
    });

    it('should reject too short numbers', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('411111111111')).toBe(false);
    });

    it('should reject too long numbers', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('41111111111111111111')).toBe(false);
    });

    it('should handle cards with spaces', async () => {
      const { validateCardNumber } = await import('@/lib/encryption');
      
      expect(validateCardNumber('4111 1111 1111 1111')).toBe(true);
    });
  });

  describe('validateExpiryDate', () => {
    it('should accept future dates', async () => {
      const { validateExpiryDate } = await import('@/lib/encryption');
      
      const futureYear = new Date().getFullYear() + 1;
      expect(validateExpiryDate('12', futureYear.toString())).toBe(true);
    });

    it('should reject past dates', async () => {
      const { validateExpiryDate } = await import('@/lib/encryption');
      
      const pastYear = new Date().getFullYear() - 1;
      expect(validateExpiryDate('12', pastYear.toString())).toBe(false);
    });

    it('should reject invalid months', async () => {
      const { validateExpiryDate } = await import('@/lib/encryption');
      
      const futureYear = new Date().getFullYear() + 1;
      expect(validateExpiryDate('0', futureYear.toString())).toBe(false);
      expect(validateExpiryDate('13', futureYear.toString())).toBe(false);
    });

    it('should accept current month if not expired', async () => {
      const { validateExpiryDate } = await import('@/lib/encryption');
      
      const now = new Date();
      const currentMonth = (now.getMonth() + 1).toString();
      const currentYear = now.getFullYear().toString();
      
      expect(validateExpiryDate(currentMonth, currentYear)).toBe(true);
    });
  });

  describe('validateCVV', () => {
    it('should accept 3-digit CVV for regular cards', async () => {
      const { validateCVV } = await import('@/lib/encryption');
      
      expect(validateCVV('123')).toBe(true);
      expect(validateCVV('123', 'Visa')).toBe(true);
      expect(validateCVV('123', 'Mastercard')).toBe(true);
    });

    it('should accept 4-digit CVV for Amex', async () => {
      const { validateCVV } = await import('@/lib/encryption');
      
      expect(validateCVV('1234', 'American Express')).toBe(true);
    });

    it('should reject 3-digit CVV for Amex', async () => {
      const { validateCVV } = await import('@/lib/encryption');
      
      expect(validateCVV('123', 'American Express')).toBe(false);
    });

    it('should reject 4-digit CVV for regular cards', async () => {
      const { validateCVV } = await import('@/lib/encryption');
      
      expect(validateCVV('1234', 'Visa')).toBe(false);
    });
  });

  describe('getLast4', () => {
    it('should return last 4 digits', async () => {
      const { getLast4 } = await import('@/lib/encryption');
      
      expect(getLast4('4111111111111111')).toBe('1111');
      expect(getLast4('5500000000000004')).toBe('0004');
    });

    it('should handle cards with spaces', async () => {
      const { getLast4 } = await import('@/lib/encryption');
      
      expect(getLast4('4111 1111 1111 1111')).toBe('1111');
    });
  });

  describe('detectCardBrand', () => {
    it('should be an alias for getCardBrand', async () => {
      const { detectCardBrand, getCardBrand } = await import('@/lib/encryption');
      
      expect(detectCardBrand('4111111111111111')).toBe(getCardBrand('4111111111111111'));
    });
  });

  describe('generateCardFingerprint', () => {
    it('should generate consistent hash for same card', async () => {
      const { generateCardFingerprint } = await import('@/lib/encryption');
      
      const fingerprint1 = generateCardFingerprint('4111111111111111');
      const fingerprint2 = generateCardFingerprint('4111111111111111');
      
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('should generate different hashes for different cards', async () => {
      const { generateCardFingerprint } = await import('@/lib/encryption');
      
      const fingerprint1 = generateCardFingerprint('4111111111111111');
      const fingerprint2 = generateCardFingerprint('5500000000000004');
      
      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should return hex string', async () => {
      const { generateCardFingerprint } = await import('@/lib/encryption');
      
      const fingerprint = generateCardFingerprint('4111111111111111');
      
      expect(fingerprint).toMatch(/^[a-f0-9]+$/);
      expect(fingerprint.length).toBe(64); // SHA-256 hex length
    });

    it('should handle cards with spaces', async () => {
      const { generateCardFingerprint } = await import('@/lib/encryption');
      
      const fp1 = generateCardFingerprint('4111111111111111');
      const fp2 = generateCardFingerprint('4111 1111 1111 1111');
      
      expect(fp1).toBe(fp2);
    });
  });
});
