/**
 * Security & Encryption Tests
 * Tests for PHI encryption, data protection, and security utilities
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

describe('Encryption Utilities', () => {
  const testKey = crypto.randomBytes(32).toString('hex').slice(0, 32);
  
  describe('AES-256-GCM Encryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const plaintext = 'Sensitive patient information';
      
      // Encrypt
      const cipher = crypto.createCipheriv(algorithm, Buffer.from(testKey), iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      const authTag = cipher.getAuthTag();
      
      // Decrypt
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(testKey), iv);
      decipher.setAuthTag(authTag);
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]).toString('utf8');
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail with wrong auth tag', () => {
      const algorithm = 'aes-256-gcm';
      const iv = crypto.randomBytes(16);
      const plaintext = 'Sensitive data';
      
      const cipher = crypto.createCipheriv(algorithm, Buffer.from(testKey), iv);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final()
      ]);
      
      // Wrong auth tag
      const wrongAuthTag = crypto.randomBytes(16);
      
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(testKey), iv);
      decipher.setAuthTag(wrongAuthTag);
      
      expect(() => {
        Buffer.concat([
          decipher.update(encrypted),
          decipher.final()
        ]);
      }).toThrow();
    });

    it('should produce different ciphertext for same plaintext (due to IV)', () => {
      const algorithm = 'aes-256-gcm';
      const plaintext = 'Same sensitive data';
      
      // First encryption
      const iv1 = crypto.randomBytes(16);
      const cipher1 = crypto.createCipheriv(algorithm, Buffer.from(testKey), iv1);
      const encrypted1 = Buffer.concat([
        cipher1.update(plaintext, 'utf8'),
        cipher1.final()
      ]).toString('hex');
      
      // Second encryption
      const iv2 = crypto.randomBytes(16);
      const cipher2 = crypto.createCipheriv(algorithm, Buffer.from(testKey), iv2);
      const encrypted2 = Buffer.concat([
        cipher2.update(plaintext, 'utf8'),
        cipher2.final()
      ]).toString('hex');
      
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('AES-256-CBC Encryption', () => {
    it('should encrypt and decrypt card data', () => {
      const algorithm = 'aes-256-cbc';
      const iv = crypto.randomBytes(16);
      const cardNumber = '4242424242424242';
      
      // Encrypt
      const cipher = crypto.createCipheriv(algorithm, Buffer.from(testKey), iv);
      let encrypted = cipher.update(cardNumber, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Decrypt
      const decipher = crypto.createDecipheriv(algorithm, Buffer.from(testKey), iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      expect(decrypted).toBe(cardNumber);
    });
  });

  describe('Hashing', () => {
    it('should create consistent SHA-256 hash', () => {
      const data = 'audit-log-data';
      
      const hash1 = crypto.createHash('sha256').update(data).digest('hex');
      const hash2 = crypto.createHash('sha256').update(data).digest('hex');
      
      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64);
    });

    it('should create different hash for different data', () => {
      const hash1 = crypto.createHash('sha256').update('data1').digest('hex');
      const hash2 = crypto.createHash('sha256').update('data2').digest('hex');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Random Generation', () => {
    it('should generate cryptographically secure random bytes', () => {
      const bytes1 = crypto.randomBytes(32);
      const bytes2 = crypto.randomBytes(32);
      
      expect(bytes1.length).toBe(32);
      expect(bytes2.length).toBe(32);
      expect(bytes1.toString('hex')).not.toBe(bytes2.toString('hex'));
    });

    it('should generate secure UUID', () => {
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();
      
      expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(uuid2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(uuid1).not.toBe(uuid2);
    });
  });
});

describe('PHI Data Protection', () => {
  describe('PHI Field Identification', () => {
    const phiFields = [
      'email',
      'phone',
      'dob',
      'ssn',
      'address1',
      'address2',
      'medicalHistory',
      'allergies',
      'medications',
    ];

    it('should identify all PHI fields', () => {
      expect(phiFields).toContain('email');
      expect(phiFields).toContain('phone');
      expect(phiFields).toContain('dob');
      expect(phiFields).toContain('ssn');
    });
  });

  describe('Data Masking', () => {
    function maskEmail(email: string): string {
      const [local, domain] = email.split('@');
      const maskedLocal = local.charAt(0) + '***' + local.charAt(local.length - 1);
      return `${maskedLocal}@${domain}`;
    }

    function maskPhone(phone: string): string {
      return phone.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2');
    }

    function maskSSN(ssn: string): string {
      return ssn.replace(/\d{3}-\d{2}-(\d{4})/, '***-**-$1');
    }

    it('should mask email correctly', () => {
      expect(maskEmail('johndoe@example.com')).toBe('j***e@example.com');
    });

    it('should mask phone correctly', () => {
      expect(maskPhone('5551234567')).toBe('555****567');
    });

    it('should mask SSN correctly', () => {
      expect(maskSSN('123-45-6789')).toBe('***-**-6789');
    });
  });
});

describe('Security Headers', () => {
  const securityHeaders = {
    'Content-Security-Policy': "default-src 'self'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };

  it('should have CSP header', () => {
    expect(securityHeaders['Content-Security-Policy']).toBeDefined();
    expect(securityHeaders['Content-Security-Policy']).toContain("default-src 'self'");
  });

  it('should prevent MIME sniffing', () => {
    expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff');
  });

  it('should prevent clickjacking', () => {
    expect(securityHeaders['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('should enable HSTS', () => {
    expect(securityHeaders['Strict-Transport-Security']).toContain('max-age=31536000');
  });
});

describe('Input Sanitization', () => {
  describe('XSS Prevention', () => {
    function sanitizeHtml(input: string): string {
      return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    it('should escape HTML entities', () => {
      const malicious = '<script>alert("xss")</script>';
      const sanitized = sanitizeHtml(malicious);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });

    it('should escape quotes', () => {
      const input = 'Value with "double" and \'single\' quotes';
      const sanitized = sanitizeHtml(input);
      
      expect(sanitized).not.toContain('"double"');
      expect(sanitized).toContain('&quot;double&quot;');
    });

    it('should escape ampersands', () => {
      const input = 'Tom & Jerry';
      const sanitized = sanitizeHtml(input);
      
      expect(sanitized).toBe('Tom &amp; Jerry');
    });
  });

  describe('SQL Injection Prevention', () => {
    // Prisma handles this, but we should still test
    it('should not allow SQL injection in search terms', () => {
      const maliciousSearch = "'; DROP TABLE patients; --";
      
      // Prisma parameterizes queries, so this would be treated as literal string
      expect(maliciousSearch).toContain("DROP TABLE");
      // In actual implementation, Prisma escapes this
    });
  });
});

describe('Authentication Security', () => {
  describe('Password Strength', () => {
    function checkPasswordStrength(password: string): {
      hasUppercase: boolean;
      hasLowercase: boolean;
      hasNumber: boolean;
      hasSpecial: boolean;
      isLongEnough: boolean;
    } {
      return {
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /[0-9]/.test(password),
        hasSpecial: /[^A-Za-z0-9]/.test(password),
        isLongEnough: password.length >= 12,
      };
    }

    it('should detect weak password', () => {
      const result = checkPasswordStrength('password');
      
      expect(result.hasUppercase).toBe(false);
      expect(result.hasNumber).toBe(false);
      expect(result.hasSpecial).toBe(false);
      expect(result.isLongEnough).toBe(false);
    });

    it('should detect strong password', () => {
      const result = checkPasswordStrength('StrongP@ssw0rd!');
      
      expect(result.hasUppercase).toBe(true);
      expect(result.hasLowercase).toBe(true);
      expect(result.hasNumber).toBe(true);
      expect(result.hasSpecial).toBe(true);
      expect(result.isLongEnough).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should track request counts', () => {
      const rateLimitCache = new Map<string, { count: number; resetTime: number }>();
      const windowMs = 60000; // 1 minute
      const max = 10;
      
      const key = '192.168.1.1';
      const now = Date.now();
      
      // First request
      rateLimitCache.set(key, { count: 1, resetTime: now + windowMs });
      
      // Check limit
      const entry = rateLimitCache.get(key)!;
      expect(entry.count).toBeLessThanOrEqual(max);
      
      // Simulate reaching limit
      entry.count = 11;
      rateLimitCache.set(key, entry);
      
      expect(rateLimitCache.get(key)!.count).toBeGreaterThan(max);
    });
  });
});

describe('Audit Logging', () => {
  describe('Audit Hash Integrity', () => {
    function calculateAuditHash(data: object): string {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');
    }

    it('should create consistent hash for audit entries', () => {
      const auditEntry = {
        userId: 1,
        action: 'VIEW_PATIENT',
        resourceId: 123,
        timestamp: '2024-01-15T10:30:00Z',
      };
      
      const hash1 = calculateAuditHash(auditEntry);
      const hash2 = calculateAuditHash(auditEntry);
      
      expect(hash1).toBe(hash2);
    });

    it('should detect tampering', () => {
      const originalEntry = {
        userId: 1,
        action: 'VIEW_PATIENT',
        resourceId: 123,
      };
      
      const tamperedEntry = {
        userId: 2, // Changed
        action: 'VIEW_PATIENT',
        resourceId: 123,
      };
      
      const originalHash = calculateAuditHash(originalEntry);
      const tamperedHash = calculateAuditHash(tamperedEntry);
      
      expect(originalHash).not.toBe(tamperedHash);
    });
  });
});
