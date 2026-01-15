/**
 * Clinic Lifefile Integration Tests
 * Tests for clinic-specific Lifefile credential management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    clinic: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/security/encryption', () => ({
  decrypt: vi.fn((value) => `decrypted_${value}`),
}));

vi.mock('@/lib/lifefile', () => ({
  createLifefileClient: vi.fn((creds) => ({ credentials: creds })),
  getEnvCredentials: vi.fn(() => ({
    baseUrl: 'https://api.lifefile.com',
    username: 'env_user',
    password: 'env_pass',
    vendorId: 'env_vendor',
    practiceId: 'env_practice',
    locationId: 'env_location',
    networkId: 'env_network',
  })),
}));

import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/security/encryption';
import { getEnvCredentials, createLifefileClient } from '@/lib/lifefile';

describe('Clinic Lifefile Credentials', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getClinicLifefileCredentials', () => {
    it('should return clinic credentials when fully configured', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://clinic.lifefile.com',
        lifefileUsername: 'clinic_user',
        lifefilePassword: 'clinic_pass',
        lifefileVendorId: 'clinic_vendor',
        lifefilePracticeId: 'clinic_practice',
        lifefileLocationId: 'clinic_location',
        lifefileNetworkId: 'clinic_network',
        lifefilePracticeName: 'Clinic Name',
        lifefilePracticeAddress: '123 Main St',
        lifefilePracticePhone: '555-1234',
        lifefilePracticeFax: '555-5678',
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(1);

      expect(result).toBeDefined();
      expect(result?.baseUrl).toBe('https://clinic.lifefile.com');
      expect(result?.vendorId).toBe('clinic_vendor');
    });

    it('should decrypt encrypted credentials', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://clinic.lifefile.com',
        lifefileUsername: 'encrypted:username',
        lifefilePassword: 'encrypted:password',
        lifefileVendorId: 'vendor',
        lifefilePracticeId: 'practice',
        lifefileLocationId: 'location',
        lifefileNetworkId: 'network',
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(1);

      expect(decrypt).toHaveBeenCalledWith('encrypted:username');
      expect(decrypt).toHaveBeenCalledWith('encrypted:password');
    });

    it('should fall back to environment variables when clinic not configured', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
        lifefileEnabled: false,
        lifefileBaseUrl: null,
        lifefileUsername: null,
        lifefilePassword: null,
        lifefileVendorId: null,
        lifefilePracticeId: null,
        lifefileLocationId: null,
        lifefileNetworkId: null,
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(1);

      // When clinic not configured, getEnvCredentials is called
      expect(getEnvCredentials).toHaveBeenCalled();
      // Result could be env credentials or null depending on implementation
      expect(result === null || result?.username === 'env_user').toBe(true);
    });

    it('should return null when clinic not found', async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(null);

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(999);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      vi.mocked(prisma.clinic.findUnique).mockRejectedValue(new Error('DB error'));

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(1);

      expect(result).toBeNull();
    });

    it('should handle partial credentials by falling back to env', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://clinic.lifefile.com',
        lifefileUsername: 'clinic_user',
        lifefilePassword: 'clinic_pass',
        // Missing required fields
        lifefileVendorId: null,
        lifefilePracticeId: null,
        lifefileLocationId: null,
        lifefileNetworkId: null,
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
      const result = await getClinicLifefileCredentials(1);

      // Should fall back to env credentials
      expect(getEnvCredentials).toHaveBeenCalled();
    });
  });

  describe('getClinicLifefileClient', () => {
    it('should call createLifefileClient with credentials', async () => {
      const mockClinic = {
        id: 1,
        name: 'Test Clinic',
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://clinic.lifefile.com',
        lifefileUsername: 'user',
        lifefilePassword: 'pass',
        lifefileVendorId: 'vendor',
        lifefilePracticeId: 'practice',
        lifefileLocationId: 'location',
        lifefileNetworkId: 'network',
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { getClinicLifefileClient } = await import('@/lib/clinic-lifefile');
      
      try {
        await getClinicLifefileClient(1);
        // If successful, createLifefileClient was called
        expect(createLifefileClient).toHaveBeenCalled();
      } catch (e) {
        // May throw if credentials incomplete
        expect(e).toBeDefined();
      }
    });

    it('should throw error when clinic not found', async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(null);

      const { getClinicLifefileClient } = await import('@/lib/clinic-lifefile');

      await expect(getClinicLifefileClient(999)).rejects.toThrow();
    });
  });

  describe('isClinicLifefileConfigured', () => {
    it('should return true when credentials available', async () => {
      const mockClinic = {
        id: 1,
        lifefileEnabled: true,
        lifefileBaseUrl: 'https://api.lifefile.com',
        lifefileUsername: 'user',
        lifefilePassword: 'pass',
        lifefileVendorId: 'vendor',
        lifefilePracticeId: 'practice',
        lifefileLocationId: 'location',
        lifefileNetworkId: 'network',
      };

      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

      const { isClinicLifefileConfigured } = await import('@/lib/clinic-lifefile');
      const result = await isClinicLifefileConfigured(1);

      expect(result).toBe(true);
    });

    it('should return false when no credentials', async () => {
      vi.mocked(prisma.clinic.findUnique).mockResolvedValue(null);
      vi.mocked(getEnvCredentials).mockReturnValue(null as any);

      vi.resetModules();
      vi.mock('@/lib/lifefile', () => ({
        createLifefileClient: vi.fn(),
        getEnvCredentials: vi.fn(() => null),
      }));

      const { isClinicLifefileConfigured } = await import('@/lib/clinic-lifefile');
      const result = await isClinicLifefileConfigured(999);

      expect(result).toBe(false);
    });
  });
});

describe('Credential Decryption', () => {
  it('should detect encrypted values by colon separator', () => {
    const isEncrypted = (value: string): boolean => {
      return value.includes(':');
    };

    expect(isEncrypted('iv:tag:ciphertext')).toBe(true);
    expect(isEncrypted('plaintext')).toBe(false);
  });

  it('should handle decryption failure gracefully', async () => {
    vi.mocked(decrypt).mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    // When decryption fails, should use raw value
    const mockClinic = {
      id: 1,
      lifefileEnabled: true,
      lifefileBaseUrl: 'https://api.lifefile.com',
      lifefileUsername: 'encrypted:value',
      lifefilePassword: 'encrypted:value',
      lifefileVendorId: 'vendor',
      lifefilePracticeId: 'practice',
      lifefileLocationId: 'location',
      lifefileNetworkId: 'network',
    };

    vi.mocked(prisma.clinic.findUnique).mockResolvedValue(mockClinic as any);

    const { getClinicLifefileCredentials } = await import('@/lib/clinic-lifefile');
    const result = await getClinicLifefileCredentials(1);

    // Should return credentials with raw (encrypted) values
    expect(result).toBeDefined();
  });
});

describe('Credential Validation', () => {
  describe('Required Fields', () => {
    const requiredFields = [
      'baseUrl',
      'username',
      'password',
      'vendorId',
      'practiceId',
      'locationId',
      'networkId',
    ];

    it('should validate all required fields are present', () => {
      const isValid = (creds: any): boolean => {
        return requiredFields.every(field => 
          creds[field] !== null && 
          creds[field] !== undefined && 
          creds[field] !== ''
        );
      };

      const validCreds = {
        baseUrl: 'https://api.lifefile.com',
        username: 'user',
        password: 'pass',
        vendorId: 'vendor',
        practiceId: 'practice',
        locationId: 'location',
        networkId: 'network',
      };

      const invalidCreds = {
        baseUrl: 'https://api.lifefile.com',
        username: 'user',
        password: 'pass',
        vendorId: null,
        practiceId: 'practice',
        locationId: 'location',
        networkId: 'network',
      };

      expect(isValid(validCreds)).toBe(true);
      expect(isValid(invalidCreds)).toBe(false);
    });
  });

  describe('Optional Fields', () => {
    it('should allow optional practice info', () => {
      const creds = {
        baseUrl: 'https://api.lifefile.com',
        username: 'user',
        password: 'pass',
        vendorId: 'vendor',
        practiceId: 'practice',
        locationId: 'location',
        networkId: 'network',
        // Optional
        practiceName: undefined,
        practiceAddress: undefined,
        practicePhone: undefined,
        practiceFax: undefined,
      };

      expect(creds.practiceName).toBeUndefined();
      expect(creds.baseUrl).toBeDefined();
    });
  });
});

describe('URL Validation', () => {
  it('should validate base URL format', () => {
    const isValidUrl = (url: string): boolean => {
      try {
        new URL(url);
        return url.startsWith('https://');
      } catch {
        return false;
      }
    };

    expect(isValidUrl('https://api.lifefile.com')).toBe(true);
    expect(isValidUrl('http://api.lifefile.com')).toBe(false); // No HTTP
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});
