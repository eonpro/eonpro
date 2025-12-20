/**
 * Encryption Unit Tests
 * Tests for PHI encryption functionality
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptPHI,
  decryptPHI,
  encryptPatientPHI,
  decryptPatientPHI,
  isEncrypted,
  encryptBatch,
  decryptBatch,
} from '@/lib/security/phi-encryption';

describe('PHI Encryption', () => {
  beforeAll(() => {
    // Ensure encryption key is set
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    }
  });

  describe('encryptPHI', () => {
    it('should encrypt plaintext', () => {
      const plaintext = 'John Doe';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted!.split(':').length).toBe(3); // iv:tag:ciphertext
    });

    it('should return null for null input', () => {
      expect(encryptPHI(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(encryptPHI(undefined)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(encryptPHI('')).toBeNull();
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'Same data';
      const encrypted1 = encryptPHI(plaintext);
      const encrypted2 = encryptPHI(plaintext);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should handle special characters', () => {
      const plaintext = 'Special chars: @#$%^&*(){}[]|\\';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle unicode characters', () => {
      const plaintext = 'Unicode: 日本語 русский العربية';
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptPHI(plaintext);
      
      expect(encrypted).not.toBeNull();
      expect(encrypted!.length).toBeGreaterThan(plaintext.length);
    });
  });

  describe('decryptPHI', () => {
    it('should decrypt encrypted text', () => {
      const original = 'Sensitive data';
      const encrypted = encryptPHI(original);
      const decrypted = decryptPHI(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should return null for null input', () => {
      expect(decryptPHI(null)).toBeNull();
    });

    it('should return null for undefined input', () => {
      expect(decryptPHI(undefined)).toBeNull();
    });

    it('should handle non-encrypted data gracefully', () => {
      const unencrypted = 'Plain text without encryption';
      // Should return the original if it doesn't look encrypted
      const result = decryptPHI(unencrypted);
      expect(result).toBe(unencrypted);
    });

    it('should decrypt unicode characters correctly', () => {
      const original = 'Unicode: 日本語 русский العربية';
      const encrypted = encryptPHI(original);
      const decrypted = decryptPHI(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should decrypt special characters correctly', () => {
      const original = 'Special: @#$%^&*(){}[]|\\<>?,./~`';
      const encrypted = encryptPHI(original);
      const decrypted = decryptPHI(encrypted);
      
      expect(decrypted).toBe(original);
    });
  });

  describe('isEncrypted', () => {
    it('should return true for encrypted data', () => {
      const encrypted = encryptPHI('test data');
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('should return false for plain text', () => {
      expect(isEncrypted('plain text')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isEncrypted(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isEncrypted(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('should return false for invalid format', () => {
      expect(isEncrypted('not:valid')).toBe(false);
      expect(isEncrypted('one:two:three:four')).toBe(false);
    });
  });

  describe('encryptPatientPHI', () => {
    it('should encrypt specified fields', () => {
      const patient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        ssn: '123-45-6789',
        dob: '1990-01-01',
        phone: '555-1234',
        email: 'john@example.com',
      };
      
      const encrypted = encryptPatientPHI(patient, ['ssn', 'dob', 'phone', 'email']);
      
      expect(encrypted.id).toBe(1);
      expect(encrypted.firstName).toBe('John');
      expect(encrypted.lastName).toBe('Doe');
      expect(encrypted.ssn).not.toBe(patient.ssn);
      expect(encrypted.dob).not.toBe(patient.dob);
      expect(encrypted.phone).not.toBe(patient.phone);
      expect(encrypted.email).not.toBe(patient.email);
      expect(isEncrypted(encrypted.ssn)).toBe(true);
    });

    it('should not modify non-specified fields', () => {
      const patient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        ssn: '123-45-6789',
      };
      
      const encrypted = encryptPatientPHI(patient, ['ssn']);
      
      expect(encrypted.firstName).toBe('John');
      expect(encrypted.lastName).toBe('Doe');
    });

    it('should handle missing fields gracefully', () => {
      const patient = {
        id: 1,
        firstName: 'John',
      };
      
      const encrypted = encryptPatientPHI(patient, ['ssn', 'dob']);
      
      expect(encrypted.id).toBe(1);
      expect(encrypted.firstName).toBe('John');
    });
  });

  describe('decryptPatientPHI', () => {
    it('should decrypt specified fields', () => {
      const original = {
        id: 1,
        firstName: 'John',
        ssn: '123-45-6789',
        dob: '1990-01-01',
      };
      
      const encrypted = encryptPatientPHI(original, ['ssn', 'dob']);
      const decrypted = decryptPatientPHI(encrypted, ['ssn', 'dob']);
      
      expect(decrypted.ssn).toBe(original.ssn);
      expect(decrypted.dob).toBe(original.dob);
    });
  });

  describe('Batch Operations', () => {
    describe('encryptBatch', () => {
      it('should encrypt multiple values', () => {
        const values = ['value1', 'value2', 'value3'];
        const encrypted = encryptBatch(values);
        
        expect(encrypted.length).toBe(3);
        encrypted.forEach((enc, i) => {
          expect(enc).not.toBe(values[i]);
          expect(isEncrypted(enc)).toBe(true);
        });
      });

      it('should handle null values in batch', () => {
        const values = ['value1', null, 'value3'];
        const encrypted = encryptBatch(values);
        
        expect(encrypted.length).toBe(3);
        expect(encrypted[0]).not.toBeNull();
        expect(encrypted[1]).toBeNull();
        expect(encrypted[2]).not.toBeNull();
      });
    });

    describe('decryptBatch', () => {
      it('should decrypt multiple values', () => {
        const original = ['value1', 'value2', 'value3'];
        const encrypted = encryptBatch(original);
        const decrypted = decryptBatch(encrypted);
        
        expect(decrypted).toEqual(original);
      });
    });
  });

  describe('Security Properties', () => {
    it('should use AES-256-GCM (authenticated encryption)', () => {
      const plaintext = 'test';
      const encrypted = encryptPHI(plaintext);
      
      // Format should be iv:authTag:ciphertext
      const parts = encrypted!.split(':');
      expect(parts.length).toBe(3);
      
      // IV should be 16 bytes (base64 encoded ~24 chars)
      const iv = Buffer.from(parts[0], 'base64');
      expect(iv.length).toBe(16);
      
      // Auth tag should be 16 bytes (base64 encoded ~24 chars)
      const authTag = Buffer.from(parts[1], 'base64');
      expect(authTag.length).toBe(16);
    });

    it('should detect tampering (authentication)', () => {
      const encrypted = encryptPHI('sensitive data');
      const parts = encrypted!.split(':');
      
      // Tamper with the ciphertext
      const tamperedCiphertext = 'AAA' + parts[2].substring(3);
      const tampered = `${parts[0]}:${parts[1]}:${tamperedCiphertext}`;
      
      // Should throw or return error on tampered data
      expect(() => {
        const result = decryptPHI(tampered);
        if (result === tampered) {
          throw new Error('Should not accept tampered data');
        }
      }).toThrow();
    });
  });
});
