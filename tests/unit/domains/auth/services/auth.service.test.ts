import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuthService } from '@/domains/auth/services/auth.service';

const mockUserFindFirst = vi.hoisted(() => vi.fn());
const mockUserClinicFindMany = vi.hoisted(() => vi.fn());
const mockUserClinicFindFirst = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  basePrisma: {
    user: { findUnique: vi.fn(), findFirst: mockUserFindFirst },
    userClinic: {
      findMany: mockUserClinicFindMany,
      findFirst: mockUserClinicFindFirst,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AuthService', () => {
  const service = createAuthService();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyCredentials', () => {
    it('returns error when user not found', async () => {
      mockUserFindFirst.mockResolvedValue(null);

      const result = await service.verifyCredentials({
        email: 'nonexistent@example.com',
        password: 'any',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email or password');
      expect(result.errorCode).toBe('INVALID_CREDENTIALS');
      expect(result.user).toBeUndefined();
    });

    it('returns ACCOUNT_LOCKED when user has lockedUntil in the future', async () => {
      mockUserFindFirst.mockResolvedValue({
        id: 1,
        email: 'locked@example.com',
        role: 'admin',
        firstName: 'Locked',
        lastName: 'User',
        clinicId: 1,
        providerId: null,
        patientId: null,
        affiliateId: null,
        permissions: [],
        lockedUntil: new Date(Date.now() + 60000),
        userClinics: [
          {
            clinic: { id: 1, name: 'Test Clinic', subdomain: 'test' },
            role: 'admin',
          },
        ],
      });

      const result = await service.verifyCredentials({
        email: 'locked@example.com',
        password: 'any',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Account is locked. Please contact your administrator.');
      expect(result.errorCode).toBe('ACCOUNT_LOCKED');
    });
  });

  describe('resolveUserClinics', () => {
    it('returns clinic options for a user', async () => {
      mockUserClinicFindMany.mockResolvedValue([
        {
          clinic: { id: 1, name: 'Clinic A', subdomain: 'clinic-a' },
          role: 'admin',
        },
        {
          clinic: { id: 2, name: 'Clinic B', subdomain: 'clinic-b' },
          role: 'staff',
        },
      ]);

      const result = await service.resolveUserClinics(1);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        name: 'Clinic A',
        subdomain: 'clinic-a',
        role: 'admin',
      });
      expect(result[1]).toEqual({
        id: 2,
        name: 'Clinic B',
        subdomain: 'clinic-b',
        role: 'staff',
      });
      expect(mockUserClinicFindMany).toHaveBeenCalledWith({
        where: { userId: 1, isActive: true },
        include: {
          clinic: { select: { id: true, name: true, subdomain: true } },
        },
      });
    });
  });

  describe('validateClinicAccess', () => {
    it('returns true for a clinic the user belongs to', async () => {
      mockUserClinicFindFirst.mockResolvedValue({ id: 1 });

      const result = await service.validateClinicAccess(1, 5);

      expect(result).toBe(true);
      expect(mockUserClinicFindFirst).toHaveBeenCalledWith({
        where: { userId: 1, clinicId: 5, isActive: true },
        select: { id: true },
      });
    });

    it('returns false for a clinic the user does not belong to', async () => {
      mockUserClinicFindFirst.mockResolvedValue(null);

      const result = await service.validateClinicAccess(1, 99);

      expect(result).toBe(false);
    });
  });
});
