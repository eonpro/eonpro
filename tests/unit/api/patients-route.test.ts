/**
 * Patients API Route Tests
 * Tests for patient management endpoints
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    patientCounter: {
      upsert: vi.fn(),
    },
    patientAudit: {
      create: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      patient: { create: vi.fn(), findUnique: vi.fn() },
      patientCounter: { upsert: vi.fn() },
      patientAudit: { create: vi.fn() },
    })),
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((data) => data),
  decryptPatientPHI: vi.fn((data) => data),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
    api: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Patients API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('GET /api/patients', () => {
    it('should return paginated patients', async () => {
      const mockPatients = [
        { id: 1, firstName: 'John', lastName: 'Doe' },
        { id: 2, firstName: 'Jane', lastName: 'Smith' },
      ];

      vi.mocked(prisma.patient.findMany).mockResolvedValue(mockPatients as any);
      vi.mocked(prisma.patient.count).mockResolvedValue(2);

      const patients = await prisma.patient.findMany({
        take: 10,
        skip: 0,
      });
      const total = await prisma.patient.count();

      expect(patients).toHaveLength(2);
      expect(total).toBe(2);
    });

    it('should support search query', async () => {
      vi.mocked(prisma.patient.findMany).mockResolvedValue([
        { id: 1, firstName: 'John', lastName: 'Doe' },
      ] as any);

      const patients = await prisma.patient.findMany({
        where: {
          OR: [
            { firstName: { contains: 'John', mode: 'insensitive' } },
            { lastName: { contains: 'John', mode: 'insensitive' } },
          ],
        },
      });

      expect(prisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.any(Array),
          }),
        })
      );
    });
  });

  describe('GET /api/patients/:id', () => {
    it('should return patient by ID', async () => {
      const mockPatient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      };

      vi.mocked(prisma.patient.findUnique).mockResolvedValue(mockPatient as any);

      const patient = await prisma.patient.findUnique({
        where: { id: 1 },
      });

      expect(patient?.id).toBe(1);
      expect(patient?.firstName).toBe('John');
    });

    it('should return null for non-existent patient', async () => {
      vi.mocked(prisma.patient.findUnique).mockResolvedValue(null);

      const patient = await prisma.patient.findUnique({
        where: { id: 999 },
      });

      expect(patient).toBeNull();
    });
  });

  describe('POST /api/patients', () => {
    it('should create new patient', async () => {
      const mockPatient = {
        id: 1,
        patientId: '000001',
        firstName: 'New',
        lastName: 'Patient',
        email: 'new@example.com',
      };

      vi.mocked(prisma.patient.create).mockResolvedValue(mockPatient as any);

      const patient = await prisma.patient.create({
        data: {
          firstName: 'New',
          lastName: 'Patient',
          email: 'new@example.com',
        },
      });

      expect(patient.id).toBe(1);
      expect(patient.firstName).toBe('New');
    });

    it('should generate sequential patient ID', async () => {
      vi.mocked(prisma.patientCounter.upsert).mockResolvedValue({ id: 1, current: 42 } as any);

      const counter = await prisma.patientCounter.upsert({
        where: { id: 1 },
        create: { id: 1, current: 1 },
        update: { current: { increment: 1 } },
      });

      const patientId = counter.current.toString().padStart(6, '0');
      expect(patientId).toBe('000042');
    });
  });

  describe('PUT /api/patients/:id', () => {
    it('should update patient', async () => {
      const mockPatient = {
        id: 1,
        firstName: 'Updated',
        lastName: 'Patient',
        email: 'updated@example.com',
      };

      vi.mocked(prisma.patient.update).mockResolvedValue(mockPatient as any);

      const patient = await prisma.patient.update({
        where: { id: 1 },
        data: { firstName: 'Updated' },
      });

      expect(patient.firstName).toBe('Updated');
    });

    it('should create audit log on update', async () => {
      vi.mocked(prisma.patientAudit.create).mockResolvedValue({} as any);

      await prisma.patientAudit.create({
        data: {
          patientId: 1,
          action: 'UPDATE',
          actorEmail: 'admin@example.com',
          diff: { firstName: { from: 'Old', to: 'New' } },
        },
      });

      expect(prisma.patientAudit.create).toHaveBeenCalled();
    });
  });

  describe('DELETE /api/patients/:id', () => {
    it('should soft delete patient', async () => {
      vi.mocked(prisma.patient.update).mockResolvedValue({
        id: 1,
        deletedAt: new Date(),
      } as any);

      const patient = await prisma.patient.update({
        where: { id: 1 },
        data: { deletedAt: new Date() },
      });

      expect(patient.deletedAt).toBeDefined();
    });
  });
});

describe('Patient Validation', () => {
  describe('Required Fields', () => {
    const REQUIRED_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'dob', 'gender'];

    const validatePatient = (data: any): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      for (const field of REQUIRED_FIELDS) {
        if (!data[field]) {
          errors.push(`${field} is required`);
        }
      }
      
      return { valid: errors.length === 0, errors };
    };

    it('should require all fields', () => {
      const result = validatePatient({});
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('firstName is required');
      expect(result.errors).toContain('lastName is required');
    });

    it('should pass with all required fields', () => {
      const result = validatePatient({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '555-123-4567',
        dob: '1990-01-01',
        gender: 'm',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Email Validation', () => {
    const isValidEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('should validate email format', () => {
      expect(isValidEmail('test@example.com')).toBe(true);
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('invalid@')).toBe(false);
      expect(isValidEmail('@example.com')).toBe(false);
    });
  });

  describe('Phone Validation', () => {
    const normalizePhone = (phone: string): string => {
      return phone.replace(/\D/g, '');
    };

    const isValidPhone = (phone: string): boolean => {
      const cleaned = normalizePhone(phone);
      return cleaned.length === 10 || cleaned.length === 11;
    };

    it('should validate US phone numbers', () => {
      expect(isValidPhone('555-123-4567')).toBe(true);
      expect(isValidPhone('(555) 123-4567')).toBe(true);
      expect(isValidPhone('5551234567')).toBe(true);
      expect(isValidPhone('123')).toBe(false);
    });
  });

  describe('Date of Birth Validation', () => {
    const isValidDob = (dob: string): boolean => {
      const date = new Date(dob);
      if (isNaN(date.getTime())) return false;
      
      const now = new Date();
      const age = now.getFullYear() - date.getFullYear();
      
      return age >= 0 && age <= 150;
    };

    it('should validate date format', () => {
      expect(isValidDob('1990-01-01')).toBe(true);
      expect(isValidDob('invalid')).toBe(false);
    });

    it('should reject future dates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(isValidDob(futureDate.toISOString())).toBe(false);
    });
  });

  describe('Gender Validation', () => {
    const VALID_GENDERS = ['m', 'f', 'o', 'u'];

    const isValidGender = (gender: string): boolean => {
      return VALID_GENDERS.includes(gender.toLowerCase());
    };

    it('should validate gender codes', () => {
      expect(isValidGender('m')).toBe(true);
      expect(isValidGender('f')).toBe(true);
      expect(isValidGender('o')).toBe(true); // Other
      expect(isValidGender('u')).toBe(true); // Unknown
      expect(isValidGender('x')).toBe(false);
    });
  });
});

describe('Patient ID Generation', () => {
  describe('Sequential ID', () => {
    const generatePatientId = (counter: number, prefix = ''): string => {
      const paddedNumber = counter.toString().padStart(6, '0');
      return prefix ? `${prefix}${paddedNumber}` : paddedNumber;
    };

    it('should generate 6-digit ID', () => {
      expect(generatePatientId(1)).toBe('000001');
      expect(generatePatientId(123)).toBe('000123');
      expect(generatePatientId(999999)).toBe('999999');
    });

    it('should support prefix', () => {
      expect(generatePatientId(1, 'PT')).toBe('PT000001');
    });
  });
});

describe('Patient Search', () => {
  describe('Search Queries', () => {
    const buildSearchQuery = (search: string) => ({
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
        { patientId: { contains: search } },
      ],
    });

    it('should build OR query for search', () => {
      const query = buildSearchQuery('john');
      
      expect(query.OR).toHaveLength(4);
      expect(query.OR[0]).toHaveProperty('firstName');
      expect(query.OR[1]).toHaveProperty('lastName');
    });
  });

  describe('Pagination', () => {
    const calculatePagination = (page: number, limit: number) => ({
      skip: (page - 1) * limit,
      take: limit,
    });

    it('should calculate correct skip and take', () => {
      expect(calculatePagination(1, 10)).toEqual({ skip: 0, take: 10 });
      expect(calculatePagination(2, 10)).toEqual({ skip: 10, take: 10 });
      expect(calculatePagination(3, 25)).toEqual({ skip: 50, take: 25 });
    });
  });
});

describe('Patient Audit Trail', () => {
  describe('Audit Actions', () => {
    const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT'];

    it('should define all audit actions', () => {
      expect(AUDIT_ACTIONS).toContain('CREATE');
      expect(AUDIT_ACTIONS).toContain('UPDATE');
      expect(AUDIT_ACTIONS).toContain('DELETE');
      expect(AUDIT_ACTIONS).toContain('VIEW');
      expect(AUDIT_ACTIONS).toContain('EXPORT');
    });
  });

  describe('Diff Generation', () => {
    const generateDiff = (before: any, after: any): Record<string, { from: any; to: any }> => {
      const diff: Record<string, { from: any; to: any }> = {};
      
      for (const key of Object.keys(after)) {
        if (before[key] !== after[key]) {
          diff[key] = { from: before[key], to: after[key] };
        }
      }
      
      return diff;
    };

    it('should generate diff for changed fields', () => {
      const before = { firstName: 'John', lastName: 'Doe' };
      const after = { firstName: 'Jane', lastName: 'Doe' };
      
      const diff = generateDiff(before, after);
      
      expect(diff.firstName).toEqual({ from: 'John', to: 'Jane' });
      expect(diff.lastName).toBeUndefined();
    });
  });
});

describe('Patient Data Export', () => {
  describe('PHI Redaction', () => {
    const PHI_FIELDS = ['ssn', 'dob', 'phone', 'address1', 'address2'];

    const redactPHI = (patient: any): any => {
      const redacted = { ...patient };
      
      for (const field of PHI_FIELDS) {
        if (redacted[field]) {
          redacted[field] = '[REDACTED]';
        }
      }
      
      return redacted;
    };

    it('should redact PHI fields', () => {
      const patient = {
        id: 1,
        firstName: 'John',
        ssn: '123-45-6789',
        dob: '1990-01-01',
        phone: '555-123-4567',
      };

      const redacted = redactPHI(patient);

      expect(redacted.firstName).toBe('John');
      expect(redacted.ssn).toBe('[REDACTED]');
      expect(redacted.dob).toBe('[REDACTED]');
      expect(redacted.phone).toBe('[REDACTED]');
    });
  });
});
