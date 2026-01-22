/**
 * Provider Service Tests
 * ======================
 *
 * Unit tests for the provider service.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { providerService } from '@/domains/provider/services/provider.service';
import { providerRepository } from '@/domains/provider/repositories';
import {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
} from '@/domains/shared/errors';
import type { UserContext } from '@/domains/patient';

// Mock repository
vi.mock('@/domains/provider/repositories', () => ({
  providerRepository: {
    findById: vi.fn(),
    findByIdWithClinic: vi.fn(),
    findByNpi: vi.fn(),
    findByEmail: vi.fn(),
    list: vi.fn(),
    listAll: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    setPassword: vi.fn(),
    updateLastLogin: vi.fn(),
    npiExists: vi.fn(),
    createAuditEntry: vi.fn(),
  },
}));

// Mock NPI lookup
vi.mock('@/lib/npi', () => ({
  lookupNpi: vi.fn(),
}));

// Mock bcrypt - use vi.doMock at module top level
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockImplementation(() => Promise.resolve('hashed_password')),
    compare: vi.fn(),
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { lookupNpi } from '@/lib/npi';

describe('ProviderService', () => {
  const mockUserContext: UserContext = {
    id: 1,
    email: 'admin@clinic.com',
    role: 'admin',
    clinicId: 1,
    patientId: null,
    providerId: null,
  };

  const mockSuperAdmin: UserContext = {
    id: 2,
    email: 'super@admin.com',
    role: 'super_admin',
    clinicId: null,
    patientId: null,
    providerId: null,
  };

  const mockProvider = {
    id: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    firstName: 'John',
    lastName: 'Doe',
    npi: '1234567890',
    clinicId: 1,
    email: 'john@example.com',
    phone: '555-1234',
    titleLine: 'MD',
    licenseState: 'CA',
    licenseNumber: 'A12345',
    dea: 'AD1234567',
    signatureDataUrl: null,
    npiVerifiedAt: new Date(),
    npiRawResponse: {},
    lastLogin: null,
    passwordHash: null,
    passwordResetExpires: null,
    passwordResetToken: null,
    clinic: { id: 1, name: 'Test Clinic', subdomain: 'test' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should return provider when found', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);

      const result = await providerService.getById(1);

      expect(result).toEqual(mockProvider);
    });

    it('should throw NotFoundError when not found', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(null);

      await expect(providerService.getById(999)).rejects.toThrow(NotFoundError);
    });

    it('should allow access to own linked provider', async () => {
      const providerUser: UserContext = {
        ...mockUserContext,
        role: 'provider',
        providerId: 1,
      };

      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);

      const result = await providerService.getById(1, providerUser);

      expect(result).toEqual(mockProvider);
    });

    it('should allow access to clinic provider', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);

      const result = await providerService.getById(1, mockUserContext);

      expect(result).toEqual(mockProvider);
    });

    it('should allow access to shared provider', async () => {
      const sharedProvider = { ...mockProvider, clinicId: null };
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(sharedProvider);

      const result = await providerService.getById(1, mockUserContext);

      expect(result).toEqual(sharedProvider);
    });

    it('should deny access to provider from different clinic', async () => {
      const otherClinicProvider = { ...mockProvider, clinicId: 999 };
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(otherClinicProvider);

      await expect(providerService.getById(1, mockUserContext)).rejects.toThrow(
        ForbiddenError
      );
    });

    it('should allow super_admin access to any provider', async () => {
      const otherClinicProvider = { ...mockProvider, clinicId: 999 };
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(otherClinicProvider);

      const result = await providerService.getById(1, mockSuperAdmin);

      expect(result).toEqual(otherClinicProvider);
    });
  });

  describe('listProviders', () => {
    it('should list all providers for super_admin', async () => {
      const providers = [mockProvider];
      vi.mocked(providerRepository.listAll).mockResolvedValue(providers);

      const result = await providerService.listProviders(mockSuperAdmin);

      expect(result.providers).toEqual(providers);
      expect(result.count).toBe(1);
      expect(providerRepository.listAll).toHaveBeenCalled();
      expect(providerRepository.list).not.toHaveBeenCalled();
    });

    it('should list filtered providers for non-super-admin', async () => {
      const providers = [mockProvider];
      vi.mocked(providerRepository.list).mockResolvedValue(providers);

      const result = await providerService.listProviders(mockUserContext);

      expect(result.providers).toEqual(providers);
      expect(providerRepository.list).toHaveBeenCalledWith({
        clinicId: 1,
        userProviderId: undefined,
        userEmail: 'admin@clinic.com',
        includeShared: true,
      });
    });
  });

  describe('createProvider', () => {
    const validInput = {
      npi: '1234567893', // Valid NPI with checksum
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
    };

    it('should create provider with valid input', async () => {
      vi.mocked(providerRepository.npiExists).mockResolvedValue(false);
      vi.mocked(lookupNpi).mockResolvedValue({
        valid: true,
        basic: { firstName: 'Jane', lastName: 'Smith', credential: 'MD' },
      });
      vi.mocked(providerRepository.create).mockResolvedValue({
        ...mockProvider,
        ...validInput,
        titleLine: 'MD Smith',
      });

      const result = await providerService.createProvider(validInput, mockUserContext);

      expect(result.firstName).toBe('Jane');
      expect(providerRepository.create).toHaveBeenCalled();
    });

    it('should throw ValidationError for invalid input', async () => {
      const invalidInput = {
        npi: '123', // Too short
        firstName: '',
        lastName: '',
      };

      await expect(
        providerService.createProvider(invalidInput, mockUserContext)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ConflictError for duplicate NPI', async () => {
      vi.mocked(providerRepository.npiExists).mockResolvedValue(true);

      await expect(
        providerService.createProvider(validInput, mockUserContext)
      ).rejects.toThrow(ConflictError);
    });

    it('should assign user clinic for non-super-admin', async () => {
      vi.mocked(providerRepository.npiExists).mockResolvedValue(false);
      vi.mocked(lookupNpi).mockResolvedValue({ valid: true });
      vi.mocked(providerRepository.create).mockResolvedValue(mockProvider);

      await providerService.createProvider(
        { ...validInput, clinicId: 999 }, // Trying to set different clinic
        mockUserContext
      );

      expect(providerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: 1 }), // Should use user's clinic
        mockUserContext.email
      );
    });

    it('should allow super_admin to specify any clinic', async () => {
      vi.mocked(providerRepository.npiExists).mockResolvedValue(false);
      vi.mocked(lookupNpi).mockResolvedValue({ valid: true });
      vi.mocked(providerRepository.create).mockResolvedValue(mockProvider);

      await providerService.createProvider(
        { ...validInput, clinicId: 999 },
        mockSuperAdmin
      );

      expect(providerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: 999 }),
        mockSuperAdmin.email
      );
    });

    it('should continue if NPI verification fails', async () => {
      vi.mocked(providerRepository.npiExists).mockResolvedValue(false);
      vi.mocked(lookupNpi).mockRejectedValue(new Error('NPI service down'));
      vi.mocked(providerRepository.create).mockResolvedValue(mockProvider);

      const result = await providerService.createProvider(validInput, mockUserContext);

      expect(result).toBeDefined();
      expect(providerRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ npiVerifiedAt: undefined }),
        mockUserContext.email
      );
    });
  });

  describe('updateProvider', () => {
    it('should update provider with valid input', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);
      vi.mocked(providerRepository.update).mockResolvedValue({
        ...mockProvider,
        firstName: 'Updated',
      });

      const result = await providerService.updateProvider(
        1,
        { firstName: 'Updated' },
        mockUserContext
      );

      expect(result.firstName).toBe('Updated');
    });

    it('should throw NotFoundError if provider not found', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(null);

      await expect(
        providerService.updateProvider(999, { firstName: 'Test' }, mockUserContext)
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw ConflictError when changing to existing NPI', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);
      vi.mocked(providerRepository.npiExists).mockResolvedValue(true);

      await expect(
        providerService.updateProvider(
          1,
          { npi: '1234567893' }, // Valid NPI checksum, different from mock
          mockUserContext
        )
      ).rejects.toThrow(ConflictError);
    });

    it('should prevent non-super-admin from changing clinic', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);

      await expect(
        providerService.updateProvider(
          1,
          { clinicId: 999 },
          mockUserContext
        )
      ).rejects.toThrow(ForbiddenError);
    });

    it('should allow super_admin to change clinic', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);
      vi.mocked(providerRepository.update).mockResolvedValue({
        ...mockProvider,
        clinicId: 999,
      });

      const result = await providerService.updateProvider(
        1,
        { clinicId: 999 },
        mockSuperAdmin
      );

      expect(result.clinicId).toBe(999);
    });
  });

  describe('deleteProvider', () => {
    it('should delete provider when user is admin', async () => {
      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);
      vi.mocked(providerRepository.delete).mockResolvedValue(undefined);

      await providerService.deleteProvider(1, mockUserContext);

      expect(providerRepository.delete).toHaveBeenCalledWith(1, mockUserContext.email);
    });

    it('should throw ForbiddenError for non-admin user', async () => {
      const providerUser: UserContext = {
        ...mockUserContext,
        role: 'provider',
      };

      vi.mocked(providerRepository.findByIdWithClinic).mockResolvedValue(mockProvider);

      await expect(
        providerService.deleteProvider(1, providerUser)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('verifyNpi', () => {
    it('should return NPI verification result', async () => {
      const mockResult = {
        valid: true,
        basic: { firstName: 'John', lastName: 'Doe' },
      };
      vi.mocked(lookupNpi).mockResolvedValue(mockResult);

      const result = await providerService.verifyNpi('1234567890');

      expect(result).toEqual(mockResult);
    });

    it('should throw ValidationError for invalid NPI format', async () => {
      await expect(providerService.verifyNpi('123')).rejects.toThrow(ValidationError);
    });
  });

  describe('setPassword', () => {
    it('should set password with valid input', async () => {
      vi.mocked(providerRepository.findById).mockResolvedValue(mockProvider as any);
      vi.mocked(providerRepository.setPassword).mockResolvedValue(undefined);

      const result = await providerService.setPassword(
        1,
        { password: 'newpassword123', confirmPassword: 'newpassword123' },
        'admin@test.com'
      );

      expect(result.success).toBe(true);
      expect(result.providerId).toBe(1);
      // Verify setPassword was called with correct provider ID and actor
      expect(providerRepository.setPassword).toHaveBeenCalled();
      const calls = vi.mocked(providerRepository.setPassword).mock.calls;
      expect(calls[0][0]).toBe(1); // Provider ID
      expect(calls[0][2]).toBe('admin@test.com'); // Actor email
    });

    it('should throw ValidationError if passwords do not match', async () => {
      await expect(
        providerService.setPassword(
          1,
          { password: 'password1', confirmPassword: 'password2' },
          'admin@test.com'
        )
      ).rejects.toThrow(ValidationError);
    });

    it('should throw NotFoundError if provider not found', async () => {
      vi.mocked(providerRepository.findById).mockResolvedValue(null);

      await expect(
        providerService.setPassword(
          999,
          { password: 'password123', confirmPassword: 'password123' },
          'admin@test.com'
        )
      ).rejects.toThrow(NotFoundError);
    });
  });
});
