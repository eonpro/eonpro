/**
 * Provider Repository Tests
 * =========================
 *
 * Unit tests for the provider repository.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { providerRepository } from '@/domains/provider/repositories/provider.repository';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    provider: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    providerAudit: {
      create: vi.fn(),
    },
    $transaction: vi.fn((fn) => fn({
      provider: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      providerAudit: {
        create: vi.fn(),
      },
    })),
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

import { prisma } from '@/lib/db';

describe('ProviderRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findById', () => {
    it('should return provider when found', async () => {
      const mockProvider = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        npi: '1234567890',
        clinicId: 1,
      };

      vi.mocked(prisma.provider.findUnique).mockResolvedValue(mockProvider as any);

      const result = await providerRepository.findById(1);

      expect(result).toEqual(mockProvider);
      expect(prisma.provider.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
        select: expect.any(Object),
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(prisma.provider.findUnique).mockResolvedValue(null);

      const result = await providerRepository.findById(999);

      expect(result).toBeNull();
    });
  });

  describe('findByNpi', () => {
    it('should return provider when NPI found', async () => {
      const mockProvider = {
        id: 1,
        npi: '1234567890',
      };

      vi.mocked(prisma.provider.findUnique).mockResolvedValue(mockProvider as any);

      const result = await providerRepository.findByNpi('1234567890');

      expect(result).toEqual(mockProvider);
      expect(prisma.provider.findUnique).toHaveBeenCalledWith({
        where: { npi: '1234567890' },
        select: expect.any(Object),
      });
    });
  });

  describe('findByEmail', () => {
    it('should search with lowercase email', async () => {
      vi.mocked(prisma.provider.findFirst).mockResolvedValue(null);

      await providerRepository.findByEmail('Test@Example.com');

      expect(prisma.provider.findFirst).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        select: expect.any(Object),
      });
    });
  });

  describe('list', () => {
    it('should build OR conditions correctly', async () => {
      vi.mocked(prisma.provider.findMany).mockResolvedValue([]);

      await providerRepository.list({
        clinicId: 1,
        userProviderId: 5,
        userEmail: 'test@example.com',
        includeShared: true,
      });

      expect(prisma.provider.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { id: 5 },
            { email: 'test@example.com' },
            { clinicId: 1 },
            { clinicId: null },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });

    it('should deduplicate results', async () => {
      const mockProviders = [
        { id: 1, firstName: 'John' },
        { id: 1, firstName: 'John' }, // Duplicate
        { id: 2, firstName: 'Jane' },
      ];

      vi.mocked(prisma.provider.findMany).mockResolvedValue(mockProviders as any);

      const result = await providerRepository.list({ clinicId: 1 });

      expect(result).toHaveLength(2);
      expect(result.map(p => p.id)).toEqual([1, 2]);
    });

    it('should exclude shared providers when includeShared is false', async () => {
      vi.mocked(prisma.provider.findMany).mockResolvedValue([]);

      await providerRepository.list({
        clinicId: 1,
        includeShared: false,
      });

      expect(prisma.provider.findMany).toHaveBeenCalledWith({
        where: {
          OR: [{ clinicId: 1 }],
        },
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });
  });

  describe('listAll', () => {
    it('should return all providers without filtering', async () => {
      const mockProviders = [
        { id: 1, firstName: 'John' },
        { id: 2, firstName: 'Jane' },
      ];

      vi.mocked(prisma.provider.findMany).mockResolvedValue(mockProviders as any);

      const result = await providerRepository.listAll();

      expect(result).toEqual(mockProviders);
      expect(prisma.provider.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
      });
    });
  });

  describe('create', () => {
    it('should create provider with audit log', async () => {
      const input = {
        npi: '1234567890',
        firstName: 'John',
        lastName: 'Doe',
        email: 'JOHN@EXAMPLE.COM',
        clinicId: 1,
      };

      const mockCreatedProvider = {
        id: 1,
        ...input,
        email: 'john@example.com',
        clinic: { id: 1, name: 'Test Clinic' },
      };

      vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
        const tx = {
          provider: {
            create: vi.fn().mockResolvedValue(mockCreatedProvider),
          },
          providerAudit: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const result = await providerRepository.create(input, 'admin@test.com');

      expect(result).toEqual(mockCreatedProvider);
    });
  });

  describe('npiExists', () => {
    it('should return true when NPI exists', async () => {
      vi.mocked(prisma.provider.findFirst).mockResolvedValue({ id: 1 } as any);

      const result = await providerRepository.npiExists('1234567890');

      expect(result).toBe(true);
    });

    it('should return false when NPI does not exist', async () => {
      vi.mocked(prisma.provider.findFirst).mockResolvedValue(null);

      const result = await providerRepository.npiExists('1234567890');

      expect(result).toBe(false);
    });

    it('should exclude specific ID when checking', async () => {
      vi.mocked(prisma.provider.findFirst).mockResolvedValue(null);

      await providerRepository.npiExists('1234567890', 5);

      expect(prisma.provider.findFirst).toHaveBeenCalledWith({
        where: {
          npi: '1234567890',
          NOT: { id: 5 },
        },
        select: { id: true },
      });
    });
  });
});
