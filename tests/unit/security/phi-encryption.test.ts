/**
 * PHI Encryption Tests
 * Tests for HIPAA-compliant encryption of Protected Health Information
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

// Mock KMS
vi.mock('@/lib/security/kms', () => ({
  getEncryptionKey: vi.fn(() => Buffer.from('a'.repeat(64), 'hex')),
  isKMSEnabled: vi.fn(() => false),
}));

describe('PHI Encryption Service', () => {
  // Generate a valid test key
  const testKey = 'a'.repeat(64); // 64 hex chars = 32 bytes
  
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = testKey;
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.ENCRYPTION_KEY;
  });

  describe('encryptPHI', () => {
    it('should encrypt plaintext PHI', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'john.doe@example.com';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted!.split(':').length).toBe(3); // iv:authTag:data format
    });

    it('should return null for null input', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      expect(encryptPHI(null)).toBeNull();
      expect(encryptPHI(undefined)).toBeNull();
    });

    it('should return null for empty string', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      // Empty string is falsy, so returns null
      expect(encryptPHI('')).toBeNull();
    });

    it('should produce different ciphertext each time (due to random IV)', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'sensitive@email.com';
      const encrypted1 = encryptPHI(plaintext);
      const encrypted2 = encryptPHI(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt unicode characters', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = '日本語テスト 🔒 émojis';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted!.split(':').length).toBe(3);
    });

    it('should encrypt long strings', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
    });
  });

  describe('decryptPHI', () => {
    it('should decrypt encrypted PHI', async () => {
      const { encryptPHI, decryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'patient@hospital.com';
      const encrypted = encryptPHI(plaintext);
      const decrypted = decryptPHI(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should return null for null input', async () => {
      const { decryptPHI } = await import('@/lib/security/phi-encryption');
      
      expect(decryptPHI(null)).toBeNull();
      expect(decryptPHI(undefined)).toBeNull();
    });

    it('should return original string if not encrypted', async () => {
      const { decryptPHI } = await import('@/lib/security/phi-encryption');
      
      const unencrypted = 'plaintext@email.com';
      const result = decryptPHI(unencrypted);
      
      // Returns original if format doesn't match
      expect(result).toBe(unencrypted);
    });

    it('should handle encrypted unicode', async () => {
      const { encryptPHI, decryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = '日本語 émojis 🔐';
      const encrypted = encryptPHI(plaintext);
      const decrypted = decryptPHI(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw on corrupted data', async () => {
      const { decryptPHI } = await import('@/lib/security/phi-encryption');
      
      // Valid format but corrupted content
      const corrupted = 'aGVsbG8=:d29ybGQ=:Y29ycnVwdGVk';
      
      expect(() => decryptPHI(corrupted)).toThrow();
    });
  });

  describe('encryptPHIAsync', () => {
    it('should encrypt PHI asynchronously', async () => {
      const { encryptPHIAsync } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'async@test.com';
      const encrypted = await encryptPHIAsync(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should return null for null input', async () => {
      const { encryptPHIAsync } = await import('@/lib/security/phi-encryption');
      
      expect(await encryptPHIAsync(null)).toBeNull();
      expect(await encryptPHIAsync(undefined)).toBeNull();
    });
  });

  describe('decryptPHIAsync', () => {
    it('should decrypt PHI asynchronously', async () => {
      const { encryptPHIAsync, decryptPHIAsync } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'async-decrypt@test.com';
      const encrypted = await encryptPHIAsync(plaintext);
      const decrypted = await decryptPHIAsync(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should return null for null input', async () => {
      const { decryptPHIAsync } = await import('@/lib/security/phi-encryption');
      
      expect(await decryptPHIAsync(null)).toBeNull();
    });
  });

  describe('encryptPatientPHI', () => {
    it('should encrypt specified patient fields', async () => {
      const { encryptPatientPHI, decryptPatientPHI } = await import('@/lib/security/phi-encryption');
      
      const patient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
      };
      
      const encrypted = encryptPatientPHI(patient, ['email', 'phone', 'dob']);
      
      expect(encrypted.firstName).toBe('John'); // Not encrypted
      expect(encrypted.email).not.toBe('john@example.com'); // Encrypted
      expect(encrypted.phone).not.toBe('5551234567'); // Encrypted
      expect(encrypted.dob).not.toBe('1990-01-15'); // Encrypted
    });

    it('should skip null/undefined fields', async () => {
      const { encryptPatientPHI } = await import('@/lib/security/phi-encryption');
      
      const patient = {
        id: 1,
        email: 'test@example.com',
        phone: null,
        dob: undefined,
      };
      
      const encrypted = encryptPatientPHI(patient, ['email', 'phone', 'dob']);
      
      expect(encrypted.email).not.toBe('test@example.com');
      expect(encrypted.phone).toBeNull();
      expect(encrypted.dob).toBeUndefined();
    });
  });

  describe('decryptPatientPHI', () => {
    it('should decrypt specified patient fields', async () => {
      const { encryptPatientPHI, decryptPatientPHI } = await import('@/lib/security/phi-encryption');
      
      const original = {
        id: 1,
        firstName: 'Jane',
        email: 'jane@hospital.com',
        phone: '5559876543',
      };
      
      const encrypted = encryptPatientPHI(original, ['email', 'phone']);
      const decrypted = decryptPatientPHI(encrypted, ['email', 'phone']);
      
      expect(decrypted.firstName).toBe('Jane');
      expect(decrypted.email).toBe('jane@hospital.com');
      expect(decrypted.phone).toBe('5559876543');
    });
  });

  describe('isEncrypted', () => {
    it('should detect encrypted values', async () => {
      const { encryptPHI, isEncrypted } = await import('@/lib/security/phi-encryption');
      
      const encrypted = encryptPHI('test@email.com');
      
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should detect non-encrypted values', async () => {
      const { isEncrypted } = await import('@/lib/security/phi-encryption');
      
      expect(isEncrypted('plaintext@email.com')).toBe(false);
      expect(isEncrypted('onlyonepart')).toBe(false);
      expect(isEncrypted('two:parts')).toBe(false);
      // Note: three colon-separated base64-looking strings may pass as encrypted
    });

    it('should handle null/undefined', async () => {
      const { isEncrypted } = await import('@/lib/security/phi-encryption');
      
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });

    it('should handle empty string', async () => {
      const { isEncrypted } = await import('@/lib/security/phi-encryption');
      
      expect(isEncrypted('')).toBe(false);
    });
  });

  describe('encryptBatch', () => {
    it('should encrypt multiple values', async () => {
      const { encryptBatch, decryptBatch } = await import('@/lib/security/phi-encryption');
      
      const values = ['email1@test.com', 'email2@test.com', null, 'email3@test.com'];
      const encrypted = encryptBatch(values);
      
      expect(encrypted).toHaveLength(4);
      expect(encrypted[0]).not.toBe('email1@test.com');
      expect(encrypted[2]).toBeNull();
    });
  });

  describe('decryptBatch', () => {
    it('should decrypt multiple values', async () => {
      const { encryptBatch, decryptBatch } = await import('@/lib/security/phi-encryption');
      
      const original = ['value1', 'value2', 'value3'];
      const encrypted = encryptBatch(original);
      const decrypted = decryptBatch(encrypted);
      
      expect(decrypted).toEqual(original);
    });

    it('should handle null values in batch', async () => {
      const { decryptBatch } = await import('@/lib/security/phi-encryption');
      
      const values = [null, null, null];
      const decrypted = decryptBatch(values);
      
      expect(decrypted).toEqual([null, null, null]);
    });
  });

  describe('reencryptPHI', () => {
    it('should re-encrypt with new key', async () => {
      const { reencryptPHI } = await import('@/lib/security/phi-encryption');
      
      // Create test data with old key
      const oldKey = Buffer.from('b'.repeat(64), 'hex');
      const newKey = Buffer.from('c'.repeat(64), 'hex');
      
      // Manually encrypt with old key
      const plaintext = 'sensitive@data.com';
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', oldKey, iv);
      const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      const encryptedString = [
        iv.toString('base64'),
        authTag.toString('base64'),
        encrypted.toString('base64'),
      ].join(':');
      
      // Re-encrypt with new key
      const reencrypted = await reencryptPHI(encryptedString, oldKey, newKey);
      
      expect(reencrypted).not.toBe(encryptedString);
      expect(reencrypted.split(':').length).toBe(3);
      
      // Verify can decrypt with new key
      const parts = reencrypted.split(':');
      const newIv = Buffer.from(parts[0], 'base64');
      const newAuthTag = Buffer.from(parts[1], 'base64');
      const newEncrypted = Buffer.from(parts[2], 'base64');
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', newKey, newIv);
      decipher.setAuthTag(newAuthTag);
      const decrypted = Buffer.concat([decipher.update(newEncrypted), decipher.final()]).toString('utf8');
      
      expect(decrypted).toBe(plaintext);
    });

    it('should throw for invalid format', async () => {
      const { reencryptPHI } = await import('@/lib/security/phi-encryption');
      
      const oldKey = Buffer.from('b'.repeat(64), 'hex');
      const newKey = Buffer.from('c'.repeat(64), 'hex');
      
      await expect(reencryptPHI('invalid', oldKey, newKey)).rejects.toThrow();
    });
  });

  describe('clearEncryptionKey', () => {
    it('should clear the encryption key from memory', async () => {
      const { clearEncryptionKey } = await import('@/lib/security/phi-encryption');
      const { logger } = await import('@/lib/logger');
      
      clearEncryptionKey();
      
      expect(logger.security).toHaveBeenCalledWith('Encryption key cleared from memory');
    });
  });

  describe('Key Validation', () => {
    it('should reject missing encryption key', async () => {
      delete process.env.ENCRYPTION_KEY;
      
      // Clear the module cache to force re-initialization
      vi.resetModules();
      
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      expect(() => _testExports.getKeySync()).toThrow('ENCRYPTION_KEY');
    });

    it('should reject short encryption key', async () => {
      process.env.ENCRYPTION_KEY = 'tooshort';
      
      vi.resetModules();
      
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      expect(() => _testExports.getKeySync()).toThrow('32 bytes');
    });

    it('should reject invalid hex encryption key', async () => {
      process.env.ENCRYPTION_KEY = 'not-valid-hex-characters-need-64';
      
      vi.resetModules();
      
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      // Will fail because it's not 64 hex chars
      expect(() => _testExports.getKeySync()).toThrow();
    });
  });

  describe('Encryption Algorithm', () => {
    it('should use AES-256-GCM', async () => {
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      expect(_testExports.algorithm).toBe('aes-256-gcm');
    });

    it('should use 16-byte IV', async () => {
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      expect(_testExports.ivLength).toBe(16);
    });

    it('should use 16-byte auth tag', async () => {
      const { _testExports } = await import('@/lib/security/phi-encryption');
      
      expect(_testExports.tagLength).toBe(16);
    });
  });
});

describe('PHI Encryption Security Properties', () => {
  const testKey = 'a'.repeat(64);
  
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = testKey;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  describe('Confidentiality', () => {
    it('should not leak plaintext in encrypted output', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'secret123@email.com';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toContain('secret123');
      expect(encrypted).not.toContain('@email.com');
    });
  });

  describe('Integrity', () => {
    it('should detect tampered ciphertext', async () => {
      const { encryptPHI, decryptPHI } = await import('@/lib/security/phi-encryption');
      
      const encrypted = encryptPHI('original@data.com')!;
      const parts = encrypted.split(':');
      
      // Tamper with the encrypted data
      const tamperedData = Buffer.from(parts[2], 'base64');
      tamperedData[0] = tamperedData[0] ^ 0xFF; // Flip bits
      parts[2] = tamperedData.toString('base64');
      const tampered = parts.join(':');
      
      expect(() => decryptPHI(tampered)).toThrow();
    });

    it('should detect tampered auth tag', async () => {
      const { encryptPHI, decryptPHI } = await import('@/lib/security/phi-encryption');
      
      const encrypted = encryptPHI('original@data.com')!;
      const parts = encrypted.split(':');
      
      // Tamper with the auth tag
      const tamperedTag = Buffer.from(parts[1], 'base64');
      tamperedTag[0] = tamperedTag[0] ^ 0xFF;
      parts[1] = tamperedTag.toString('base64');
      const tampered = parts.join(':');
      
      expect(() => decryptPHI(tampered)).toThrow();
    });
  });

  describe('Randomness', () => {
    it('should use cryptographically random IVs', async () => {
      const { encryptPHI } = await import('@/lib/security/phi-encryption');
      
      const plaintext = 'test@test.com';
      const ivs = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        const encrypted = encryptPHI(plaintext)!;
        const iv = encrypted.split(':')[0];
        ivs.add(iv);
      }
      
      // All IVs should be unique
      expect(ivs.size).toBe(100);
    });
  });
});
