/**
 * Patient Management Tests
 * Tests for patient CRUD operations and validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    patientCounter: {
      upsert: vi.fn(),
    },
    patientAudit: {
      create: vi.fn(),
    },
  },
}));

// Mock encryption
vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((data) => data),
  decryptPatientPHI: vi.fn((data) => data),
  encryptPHI: vi.fn((data) => data),
  decryptPHI: vi.fn((data) => data),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Patient Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Patient Create Schema', () => {
    it('should validate patient with all required fields', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.firstName).toBe('John');
        expect(result.data.email).toBe('john.doe@example.com');
      }
    });

    it('should normalize email to lowercase', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN.DOE@EXAMPLE.COM',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('john.doe@example.com');
      }
    });

    it('should accept valid phone number format', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567', // Pre-normalized format
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.phone).toBe('5551234567');
      }
    });

    it('should reject invalid email', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'not-an-email',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid zip code', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '1234', // Invalid - needs 5 digits
      });
      
      expect(result.success).toBe(false);
    });

    it('should normalize state to uppercase', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'fl',
        zip: '33101',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.state).toBe('FL');
      }
    });

    it('should accept optional address2', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        address2: 'Apt 4B',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.address2).toBe('Apt 4B');
      }
    });

    it('should accept tags array', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
        tags: ['weight-loss', 'vip'],
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toHaveLength(2);
      }
    });

    it('should reject invalid gender', async () => {
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientCreateSchema.safeParse({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Unknown', // Not in enum
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('Patient Update Schema', () => {
    it('should allow partial updates', async () => {
      const { patientUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientUpdateSchema.safeParse({
        firstName: 'Jane',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.firstName).toBe('Jane');
      }
    });

    it('should validate fields that are provided', async () => {
      const { patientUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = patientUpdateSchema.safeParse({
        email: 'not-an-email',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('Patient Search Schema', () => {
    it('should validate search with pagination', async () => {
      const { patientSearchSchema } = await import('@/lib/validation/schemas');
      
      const result = patientSearchSchema.safeParse({
        page: 1,
        limit: 20,
        q: 'John',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.q).toBe('John');
      }
    });

    it('should use defaults for missing pagination', async () => {
      const { patientSearchSchema } = await import('@/lib/validation/schemas');
      
      const result = patientSearchSchema.safeParse({});
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.order).toBe('desc');
      }
    });

    it('should reject limit over 100', async () => {
      const { patientSearchSchema } = await import('@/lib/validation/schemas');
      
      const result = patientSearchSchema.safeParse({
        limit: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should coerce string page to number', async () => {
      const { patientSearchSchema } = await import('@/lib/validation/schemas');
      
      const result = patientSearchSchema.safeParse({
        page: '3',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(3);
      }
    });
  });
});

describe('Patient Data Validation', () => {
  describe('DOB Format', () => {
    it('should accept YYYY-MM-DD format', async () => {
      const { dobSchema } = await import('@/lib/validation/schemas');
      
      const result = dobSchema.safeParse('1990-01-15');
      
      expect(result.success).toBe(true);
    });

    it('should accept MM/DD/YYYY format', async () => {
      const { dobSchema } = await import('@/lib/validation/schemas');
      
      const result = dobSchema.safeParse('01/15/1990');
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', async () => {
      const { dobSchema } = await import('@/lib/validation/schemas');
      
      const result = dobSchema.safeParse('January 15, 1990');
      
      expect(result.success).toBe(false);
    });
  });

  describe('ID Validation', () => {
    it('should validate positive integer ID', async () => {
      const { idSchema } = await import('@/lib/validation/schemas');
      
      const result = idSchema.safeParse(123);
      
      expect(result.success).toBe(true);
    });

    it('should coerce string to number', async () => {
      const { idSchema } = await import('@/lib/validation/schemas');
      
      const result = idSchema.safeParse('456');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(456);
      }
    });

    it('should reject negative ID', async () => {
      const { idSchema } = await import('@/lib/validation/schemas');
      
      const result = idSchema.safeParse(-1);
      
      expect(result.success).toBe(false);
    });

    it('should reject zero ID', async () => {
      const { idSchema } = await import('@/lib/validation/schemas');
      
      const result = idSchema.safeParse(0);
      
      expect(result.success).toBe(false);
    });
  });
});
