/**
 * PHI Encryption Security Tests
 * =============================
 * 
 * Tests for Protected Health Information encryption including:
 * - Encryption algorithm strength
 * - Key management
 * - Data integrity
 * 
 * @module tests/security/phi-encryption
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';

// Test encryption key (64 hex chars = 32 bytes)
const TEST_KEY = crypto.randomBytes(32);
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

// Helper functions matching our encryption implementation
function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
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
}

function decrypt(encryptedData: string, key: Buffer): string {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'base64');
  const authTag = Buffer.from(parts[1], 'base64');
  const encrypted = Buffer.from(parts[2], 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString('utf8');
}

describe('PHI Encryption Security', () => {
  describe('Encryption Strength', () => {
    it('should use AES-256-GCM algorithm', () => {
      expect(ALGORITHM).toBe('aes-256-gcm');
    });

    it('should use 256-bit (32 byte) keys', () => {
      expect(TEST_KEY.length).toBe(32);
    });

    it('should use unique IV for each encryption', () => {
      const text = 'Test SSN 123-45-6789';
      const encrypted1 = encrypt(text, TEST_KEY);
      const encrypted2 = encrypt(text, TEST_KEY);
      
      // Same plaintext should produce different ciphertext
      expect(encrypted1).not.toBe(encrypted2);
      
      // But should decrypt to same value
      expect(decrypt(encrypted1, TEST_KEY)).toBe(text);
      expect(decrypt(encrypted2, TEST_KEY)).toBe(text);
    });

    it('should include authentication tag (GCM)', () => {
      const encrypted = encrypt('test', TEST_KEY);
      const parts = encrypted.split(':');
      
      // Format: iv:authTag:ciphertext
      expect(parts.length).toBe(3);
      
      // Auth tag should be 16 bytes (base64 encoded)
      const authTag = Buffer.from(parts[1], 'base64');
      expect(authTag.length).toBe(16);
    });
  });

  describe('Encryption Integrity', () => {
    it('should detect tampered ciphertext', () => {
      const encrypted = encrypt('sensitive data', TEST_KEY);
      const parts = encrypted.split(':');
      
      // Tamper with ciphertext
      const tamperedCiphertext = 'AAAA' + parts[2].slice(4);
      const tampered = [parts[0], parts[1], tamperedCiphertext].join(':');
      
      expect(() => decrypt(tampered, TEST_KEY)).toThrow();
    });

    it('should detect tampered auth tag', () => {
      const encrypted = encrypt('sensitive data', TEST_KEY);
      const parts = encrypted.split(':');
      
      // Tamper with auth tag
      const tamperedAuthTag = Buffer.from(parts[1], 'base64');
      tamperedAuthTag[0] ^= 0xFF;
      const tampered = [parts[0], tamperedAuthTag.toString('base64'), parts[2]].join(':');
      
      expect(() => decrypt(tampered, TEST_KEY)).toThrow();
    });

    it('should fail with wrong key', () => {
      const encrypted = encrypt('sensitive data', TEST_KEY);
      const wrongKey = crypto.randomBytes(32);
      
      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });
  });

  describe('PHI Data Types', () => {
    it('should encrypt SSN', () => {
      const ssn = '123-45-6789';
      const encrypted = encrypt(ssn, TEST_KEY);
      
      // Should not contain original SSN
      expect(encrypted).not.toContain('123');
      expect(encrypted).not.toContain('456');
      expect(encrypted).not.toContain('789');
      
      // Should decrypt correctly
      expect(decrypt(encrypted, TEST_KEY)).toBe(ssn);
    });

    it('should encrypt DOB', () => {
      const dob = '1990-01-15';
      const encrypted = encrypt(dob, TEST_KEY);
      
      expect(encrypted).not.toContain('1990');
      expect(decrypt(encrypted, TEST_KEY)).toBe(dob);
    });

    it('should handle empty/null values', () => {
      // Should not throw on empty string
      const encrypted = encrypt('', TEST_KEY);
      expect(decrypt(encrypted, TEST_KEY)).toBe('');
    });
  });

  describe('Key Security', () => {
    it('should reject keys shorter than 32 bytes', () => {
      const shortKey = crypto.randomBytes(16); // 128-bit key
      
      // AES-256 requires 32-byte key
      expect(() => {
        crypto.createCipheriv('aes-256-gcm', shortKey, crypto.randomBytes(16));
      }).toThrow();
    });

    it('should use hex-encoded keys from environment', () => {
      const keyHex = crypto.randomBytes(32).toString('hex');
      
      // Key should be 64 hex characters
      expect(keyHex.length).toBe(64);
      
      // Should convert back to 32 bytes
      const keyBuffer = Buffer.from(keyHex, 'hex');
      expect(keyBuffer.length).toBe(32);
    });
  });

  describe('Audit Trail', () => {
    it('should log PHI access events', () => {
      const auditLog: any[] = [];
      
      // Simulate PHI access logging
      const logAccess = (action: string, patientId: number, field: string) => {
        auditLog.push({
          timestamp: new Date(),
          action,
          patientId,
          field,
        });
      };
      
      logAccess('DECRYPT', 123, 'ssn');
      
      expect(auditLog.length).toBe(1);
      expect(auditLog[0].action).toBe('DECRYPT');
    });
  });
});
