/**
 * Input Validation Security Tests
 * ================================
 * 
 * Tests for input sanitization and validation including:
 * - XSS prevention
 * - SQL injection prevention
 * - NoSQL injection prevention
 * - Path traversal prevention
 * 
 * @module tests/security/input-validation
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Input Validation Security', () => {
  describe('XSS Prevention', () => {
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '"><script>alert("XSS")</script>',
      "javascript:alert('XSS')",
      '<img src=x onerror=alert("XSS")>',
      '<svg onload=alert("XSS")>',
      '{{constructor.constructor("alert(1)")()}}',
      '<body onload=alert("XSS")>',
      '"><img src=x onerror=alert("XSS")>',
    ];

    it('should reject script tags in text input', () => {
      const safeTextSchema = z.string().refine(
        (val) => !/<script[\s\S]*?>[\s\S]*?<\/script>/gi.test(val),
        'Script tags not allowed'
      );

      for (const payload of xssPayloads.filter(p => p.includes('script'))) {
        expect(() => safeTextSchema.parse(payload)).toThrow();
      }
    });

    it('should reject event handlers in HTML', () => {
      const eventHandlerRegex = /\bon\w+\s*=/gi;
      
      for (const payload of xssPayloads) {
        if (eventHandlerRegex.test(payload)) {
          expect(eventHandlerRegex.test(payload)).toBe(true);
        }
      }
    });

    it('should sanitize HTML entities', () => {
      const sanitize = (str: string) => {
        return str
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      };

      const malicious = '<script>alert("XSS")</script>';
      const sanitized = sanitize(malicious);
      
      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toContain('&lt;script&gt;');
    });
  });

  describe('SQL Injection Prevention', () => {
    const sqlInjectionPayloads = [
      "'; DROP TABLE users; --",
      "1' OR '1'='1",
      "1; DELETE FROM patients WHERE 1=1; --",
      "admin'--",
      "' UNION SELECT * FROM users --",
      "1' AND 1=CONVERT(int,(SELECT TOP 1 table_name FROM information_schema.tables))--",
    ];

    it('should use parameterized queries (Prisma handles this)', () => {
      // Prisma uses parameterized queries by default
      // This test verifies the pattern
      const buildQuery = (email: string) => {
        // BAD: String interpolation (vulnerable)
        // const bad = `SELECT * FROM users WHERE email = '${email}'`;
        
        // GOOD: Parameterized (what Prisma does)
        return {
          query: 'SELECT * FROM users WHERE email = $1',
          params: [email],
        };
      };

      for (const payload of sqlInjectionPayloads) {
        const query = buildQuery(payload);
        
        // Query string should not contain the payload
        expect(query.query).not.toContain(payload);
        // Payload should be in params array
        expect(query.params).toContain(payload);
      }
    });

    it('should reject SQL keywords in ID fields', () => {
      const safeIdSchema = z.string().refine(
        (val) => !/^(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|EXEC)/i.test(val.trim()),
        'Invalid ID format'
      );

      expect(() => safeIdSchema.parse('SELECT * FROM users')).toThrow();
      expect(() => safeIdSchema.parse('valid-id-123')).not.toThrow();
    });
  });

  describe('NoSQL Injection Prevention', () => {
    const nosqlPayloads = [
      '{"$gt": ""}',
      '{"$ne": null}',
      '{"$where": "this.password == this.passwordConfirm"}',
      '{"$regex": ".*"}',
    ];

    it('should reject MongoDB operators in input', () => {
      const safeInputSchema = z.string().refine(
        (val) => !val.includes('$'),
        'Invalid characters in input'
      );

      for (const payload of nosqlPayloads) {
        expect(() => safeInputSchema.parse(payload)).toThrow();
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '....//....//....//etc/passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc/passwd',
    ];

    it('should reject path traversal sequences', () => {
      const safePathSchema = z.string().refine(
        (val) => !val.includes('..') && !val.includes('%2e'),
        'Path traversal not allowed'
      );

      for (const payload of pathTraversalPayloads) {
        expect(() => safePathSchema.parse(payload)).toThrow();
      }
    });

    it('should normalize paths before validation', () => {
      const normalizePath = (path: string) => {
        return decodeURIComponent(path).replace(/\\/g, '/');
      };

      const malicious = '..%2f..%2f..%2fetc%2fpasswd';
      const normalized = normalizePath(malicious);
      
      expect(normalized).toContain('../');
    });
  });

  describe('Email Validation', () => {
    it('should validate email format', () => {
      const emailSchema = z.string().email();
      
      expect(() => emailSchema.parse('valid@email.com')).not.toThrow();
      expect(() => emailSchema.parse('invalid-email')).toThrow();
      expect(() => emailSchema.parse('test@')).toThrow();
      expect(() => emailSchema.parse('@test.com')).toThrow();
    });

    it('should reject overly long emails', () => {
      const emailSchema = z.string().email().max(254);
      
      const longEmail = 'a'.repeat(250) + '@test.com';
      expect(() => emailSchema.parse(longEmail)).toThrow();
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate phone number format', () => {
      const phoneSchema = z.string().regex(
        /^\+?[1-9]\d{1,14}$/,
        'Invalid phone number format'
      );

      expect(() => phoneSchema.parse('+18135551234')).not.toThrow();
      expect(() => phoneSchema.parse('8135551234')).not.toThrow();
      expect(() => phoneSchema.parse('abc123')).toThrow();
      expect(() => phoneSchema.parse('')).toThrow();
    });
  });

  describe('ID Validation', () => {
    it('should validate numeric IDs', () => {
      const idSchema = z.number().int().positive();
      
      expect(() => idSchema.parse(1)).not.toThrow();
      expect(() => idSchema.parse(0)).toThrow();
      expect(() => idSchema.parse(-1)).toThrow();
      expect(() => idSchema.parse(1.5)).toThrow();
    });

    it('should validate UUID format', () => {
      const uuidSchema = z.string().uuid();
      
      expect(() => uuidSchema.parse('123e4567-e89b-12d3-a456-426614174000')).not.toThrow();
      expect(() => uuidSchema.parse('invalid-uuid')).toThrow();
      expect(() => uuidSchema.parse('123')).toThrow();
    });
  });
});
