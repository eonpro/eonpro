/**
 * Patient Service Test Suite
 * ==========================
 *
 * Tests for the patient service business logic layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the repository module before importing service
vi.mock('@/domains/patient/repositories', () => ({
  patientRepository: {},
  createPatientRepository: vi.fn(),
}));

// Mock shared errors - keep actual implementations
vi.mock('@/domains/shared/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/shared/errors')>();
  return actual;
});

import {
  createPatientService,
  type PatientService,
  type UserContext,
} from '@/domains/patient/services';
import type { PatientRepository } from '@/domains/patient/repositories';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  BadRequestError,
} from '@/domains/shared/errors';

describe('PatientService', () => {
  let service: PatientService;
  let mockRepo: jest.Mocked<PatientRepository>;

  const mockPatient = {
    id: 1,
    createdAt: new Date('2024-01-15'),
    clinicId: 10,
    patientId: '000001',
    firstName: 'John',
    lastName: 'Doe',
    dob: '1990-01-01',
    gender: 'm',
    phone: '5551234567',
    email: 'john@example.com',
    address1: '123 Main St',
    address2: null,
    city: 'Anytown',
    state: 'CA',
    zip: '12345',
    lifefileId: null,
    notes: null,
    tags: ['vip'],
    stripeCustomerId: null,
    source: 'api' as const,
    sourceMetadata: null,
  };

  const adminUser: UserContext = {
    id: 1,
    email: 'admin@clinic.com',
    role: 'admin',
    clinicId: 10,
  };

  const superAdminUser: UserContext = {
    id: 2,
    email: 'super@platform.com',
    role: 'super_admin',
  };

  const providerUser: UserContext = {
    id: 3,
    email: 'provider@clinic.com',
    role: 'provider',
    clinicId: 10,
  };

  const patientUser: UserContext = {
    id: 4,
    email: 'patient@example.com',
    role: 'patient',
    clinicId: 10,
    patientId: 1,
  };

  beforeEach(() => {
    mockRepo = {
      findById: vi.fn(),
      findByIdOrNull: vi.fn(),
      findByPatientId: vi.fn(),
      findByEmail: vi.fn(),
      findByStripeCustomerId: vi.fn(),
      findMany: vi.fn(),
      findManyWithClinic: vi.fn(),
      findWithCounts: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      count: vi.fn(),
    } as unknown as jest.Mocked<PatientRepository>;

    service = createPatientService(mockRepo as unknown as PatientRepository);
  });

  describe('getPatient', () => {
    it('should return patient for admin user', async () => {
      mockRepo.findById.mockResolvedValue(mockPatient);

      const result = await service.getPatient(1, adminUser);

      expect(result).toEqual(mockPatient);
      expect(mockRepo.findById).toHaveBeenCalledWith(1, 10);
    });

    it('should not filter by clinic for super_admin', async () => {
      mockRepo.findById.mockResolvedValue(mockPatient);

      await service.getPatient(1, superAdminUser);

      expect(mockRepo.findById).toHaveBeenCalledWith(1, undefined);
    });

    it('should allow patient to access own record', async () => {
      mockRepo.findById.mockResolvedValue(mockPatient);

      const result = await service.getPatient(1, patientUser);

      expect(result).toEqual(mockPatient);
    });

    it('should deny patient access to other patient records', async () => {
      const otherPatient = { ...mockPatient, id: 999 };
      mockRepo.findById.mockResolvedValue(otherPatient);

      await expect(service.getPatient(999, patientUser)).rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError if user has no clinic', async () => {
      const userNoClinic: UserContext = {
        id: 5,
        email: 'orphan@example.com',
        role: 'provider',
      };

      await expect(service.getPatient(1, userNoClinic)).rejects.toThrow(ForbiddenError);
    });

    it('should propagate NotFoundError from repository', async () => {
      mockRepo.findById.mockRejectedValue(new NotFoundError('Patient', 999));

      await expect(service.getPatient(999, adminUser)).rejects.toThrow(NotFoundError);
    });
  });

  describe('listPatients', () => {
    it('should filter by clinic for non-super-admin', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [mockPatient],
        total: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      await service.listPatients(adminUser);

      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: 10 }),
        expect.any(Object)
      );
    });

    it('should use findManyWithClinic for super_admin', async () => {
      mockRepo.findManyWithClinic.mockResolvedValue({
        data: [{ ...mockPatient, clinicName: 'Test Clinic' }],
        total: 1,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      await service.listPatients(superAdminUser);

      expect(mockRepo.findManyWithClinic).toHaveBeenCalled();
      expect(mockRepo.findMany).not.toHaveBeenCalled();
    });

    it('should parse recent time filter in hours', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [],
        total: 0,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      await service.listPatients(adminUser, { recent: '24h' });

      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAfter: expect.any(Date),
        }),
        expect.any(Object)
      );
    });

    it('should parse recent time filter in days', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [],
        total: 0,
        limit: 100,
        offset: 0,
        hasMore: false,
      });

      await service.listPatients(adminUser, { recent: '7d' });

      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          createdAfter: expect.any(Date),
        }),
        expect.any(Object)
      );
    });

    it('should pass through search and pagination options', async () => {
      mockRepo.findMany.mockResolvedValue({
        data: [],
        total: 0,
        limit: 50,
        offset: 10,
        hasMore: false,
      });

      await service.listPatients(adminUser, {
        search: 'john',
        limit: 50,
        offset: 10,
        orderBy: 'firstName',
        orderDir: 'asc',
      });

      expect(mockRepo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'john' }),
        expect.objectContaining({
          limit: 50,
          offset: 10,
          orderBy: 'firstName',
          orderDir: 'asc',
        })
      );
    });
  });

  describe('createPatient', () => {
    const validInput = {
      firstName: 'Jane',
      lastName: 'Smith',
      dob: '1985-06-15',
      gender: 'female',
      phone: '555-987-6543',
      email: 'jane@example.com',
      address1: '456 Oak Ave',
      city: 'Springfield',
      state: 'Illinois',
      zip: '62701',
    };

    it('should create patient with valid input', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue({ ...mockPatient, ...validInput, gender: 'f' });

      const result = await service.createPatient(validInput, adminUser);

      expect(result.firstName).toBe('Jane');
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          firstName: 'Jane',
          lastName: 'Smith',
          gender: 'f', // normalized
          state: 'IL', // normalized
          clinicId: 10,
        }),
        expect.objectContaining({
          actorEmail: 'admin@clinic.com',
          actorRole: 'admin',
        })
      );
    });

    it('should normalize gender input', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockPatient);

      await service.createPatient({ ...validInput, gender: 'Male' }, adminUser);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ gender: 'm' }),
        expect.any(Object)
      );
    });

    it('should normalize state input', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockPatient);

      await service.createPatient({ ...validInput, state: 'California' }, adminUser);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ state: 'CA' }),
        expect.any(Object)
      );
    });

    it('should normalize phone number', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockPatient);

      await service.createPatient({ ...validInput, phone: '(555) 123-4567' }, adminUser);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '5551234567' }),
        expect.any(Object)
      );
    });

    it('should throw ValidationError for invalid input', async () => {
      const invalidInput = { firstName: '' };

      await expect(service.createPatient(invalidInput, adminUser)).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError for duplicate email', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockPatient);

      await expect(service.createPatient(validInput, adminUser)).rejects.toThrow(ConflictError);
    });

    it('should require clinicId from super_admin', async () => {
      await expect(service.createPatient(validInput, superAdminUser)).rejects.toThrow(BadRequestError);
    });

    it('should allow super_admin with clinicId', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockPatient);

      await service.createPatient({ ...validInput, clinicId: 5 }, superAdminUser);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: 5 }),
        expect.any(Object)
      );
    });

    it('should throw ForbiddenError if user has no clinic', async () => {
      const userNoClinic: UserContext = {
        id: 5,
        email: 'orphan@example.com',
        role: 'provider',
      };

      await expect(service.createPatient(validInput, userNoClinic)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('updatePatient', () => {
    it('should update patient with valid input', async () => {
      mockRepo.findByIdOrNull.mockResolvedValue(mockPatient);
      mockRepo.update.mockResolvedValue({ ...mockPatient, firstName: 'Johnny' });

      const result = await service.updatePatient(1, { firstName: 'Johnny' }, adminUser);

      expect(result.firstName).toBe('Johnny');
    });

    it('should throw BadRequestError for empty update', async () => {
      await expect(service.updatePatient(1, {}, adminUser)).rejects.toThrow(BadRequestError);
    });

    it('should check email uniqueness when changing email', async () => {
      mockRepo.findByIdOrNull.mockResolvedValue(mockPatient);
      mockRepo.findByEmail.mockResolvedValue({ ...mockPatient, id: 999 }); // Different patient
      mockRepo.update.mockResolvedValue(mockPatient);

      await expect(
        service.updatePatient(1, { email: 'taken@example.com' }, adminUser)
      ).rejects.toThrow(ConflictError);
    });

    it('should allow updating to same email', async () => {
      mockRepo.findByIdOrNull.mockResolvedValue(mockPatient);
      mockRepo.findByEmail.mockResolvedValue(mockPatient); // Same patient
      mockRepo.update.mockResolvedValue(mockPatient);

      await expect(
        service.updatePatient(1, { email: 'john@example.com' }, adminUser)
      ).resolves.not.toThrow();
    });

    it('should deny patient updating other patient', async () => {
      mockRepo.findByIdOrNull.mockResolvedValue({ ...mockPatient, id: 999 });

      await expect(
        service.updatePatient(999, { firstName: 'Hacker' }, patientUser)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should allow patient to update own record', async () => {
      mockRepo.findByIdOrNull.mockResolvedValue(mockPatient);
      mockRepo.update.mockResolvedValue({ ...mockPatient, firstName: 'Johnny' });

      const result = await service.updatePatient(1, { firstName: 'Johnny' }, patientUser);

      expect(result.firstName).toBe('Johnny');
    });
  });

  describe('deletePatient', () => {
    it('should delete patient as admin', async () => {
      mockRepo.findWithCounts.mockResolvedValue({
        ...mockPatient,
        _count: { orders: 0, documents: 0, soapNotes: 0, appointments: 0 },
      });

      await service.deletePatient(1, adminUser);

      expect(mockRepo.delete).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ actorEmail: 'admin@clinic.com' }),
        10
      );
    });

    it('should delete patient as super_admin', async () => {
      mockRepo.findWithCounts.mockResolvedValue({
        ...mockPatient,
        _count: { orders: 0, documents: 0, soapNotes: 0, appointments: 0 },
      });

      await service.deletePatient(1, superAdminUser);

      expect(mockRepo.delete).toHaveBeenCalledWith(
        1,
        expect.any(Object),
        undefined
      );
    });

    it('should allow deletion for provider role', async () => {
      mockRepo.findWithCounts.mockResolvedValue({
        ...mockPatient,
        _count: { orders: 0, documents: 0, soapNotes: 0, appointments: 0 },
      });

      await service.deletePatient(1, providerUser);

      expect(mockRepo.delete).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ actorEmail: 'provider@clinic.com' }),
        10
      );
    });

    it('should deny deletion for patient role', async () => {
      await expect(service.deletePatient(1, patientUser)).rejects.toThrow(ForbiddenError);
    });

    it('should throw NotFoundError for non-existent patient', async () => {
      mockRepo.findWithCounts.mockResolvedValue(null);

      await expect(service.deletePatient(999, adminUser)).rejects.toThrow(NotFoundError);
    });
  });

  describe('isEmailRegistered', () => {
    it('should return true if email exists for different patient', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockPatient);

      const result = await service.isEmailRegistered('john@example.com', 10, 999);

      expect(result).toBe(true);
    });

    it('should return false if email exists for same patient', async () => {
      mockRepo.findByEmail.mockResolvedValue(mockPatient);

      const result = await service.isEmailRegistered('john@example.com', 10, 1);

      expect(result).toBe(false);
    });

    it('should return false if email does not exist', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);

      const result = await service.isEmailRegistered('new@example.com', 10);

      expect(result).toBe(false);
    });
  });

  describe('validation', () => {
    it('should reject invalid email format', async () => {
      const invalidInput = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'm',
        phone: '5551234567',
        email: 'not-an-email',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      };

      await expect(service.createPatient(invalidInput, adminUser)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid state', async () => {
      const invalidInput = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'm',
        phone: '5551234567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'XX',
        zip: '12345',
      };

      await expect(service.createPatient(invalidInput, adminUser)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid gender', async () => {
      const invalidInput = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'invalid',
        phone: '5551234567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
      };

      await expect(service.createPatient(invalidInput, adminUser)).rejects.toThrow(ValidationError);
    });

    it('should reject invalid ZIP format', async () => {
      const invalidInput = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'm',
        phone: '5551234567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: 'invalid',
      };

      await expect(service.createPatient(invalidInput, adminUser)).rejects.toThrow(ValidationError);
    });

    it('should accept 9-digit ZIP code', async () => {
      mockRepo.findByEmail.mockResolvedValue(null);
      mockRepo.create.mockResolvedValue(mockPatient);

      const input = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'm',
        phone: '5551234567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345-6789',
      };

      await service.createPatient(input, adminUser);

      expect(mockRepo.create).toHaveBeenCalled();
    });
  });
});
