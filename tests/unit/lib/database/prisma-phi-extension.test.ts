import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PHI_FIELD_MAP,
  createPhiMiddleware,
  modelHasAutoPhiEncryption,
} from '@/lib/database/prisma-phi-extension';

vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPHI: vi.fn((val: string) => `encrypted:${val}`),
  decryptPHI: vi.fn((val: string) =>
    val.startsWith('encrypted:') ? val.replace('encrypted:', '') : val
  ),
  isEncrypted: vi.fn((val: string) => val.startsWith('encrypted:')),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('prisma-phi-extension', () => {
  describe('modelHasAutoPhiEncryption', () => {
    it('returns true for patient', () => {
      expect(modelHasAutoPhiEncryption('patient')).toBe(true);
      expect(modelHasAutoPhiEncryption('Patient')).toBe(true);
    });

    it('returns false for order', () => {
      expect(modelHasAutoPhiEncryption('order')).toBe(false);
      expect(modelHasAutoPhiEncryption('Order')).toBe(false);
    });
  });

  describe('PHI_FIELD_MAP', () => {
    it('has patient fields', () => {
      expect(PHI_FIELD_MAP.patient).toEqual([
        'firstName',
        'lastName',
        'email',
        'phone',
        'dob',
        'address1',
        'address2',
        'city',
        'state',
        'zip',
      ]);
    });
  });

  describe('createPhiMiddleware', () => {
    let middleware: ReturnType<typeof createPhiMiddleware>;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      middleware = createPhiMiddleware();
      next = vi.fn();
    });

    it('encrypts firstName and lastName on create action for Patient model', async () => {
      const params = {
        model: 'Patient',
        action: 'create',
        args: {
          data: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        },
      };

      next.mockResolvedValue({ id: 1, ...params.args.data });

      await middleware(params as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'Patient',
          action: 'create',
          args: {
            data: {
              firstName: 'encrypted:John',
              lastName: 'encrypted:Doe',
              email: 'encrypted:john@example.com',
            },
          },
        })
      );
    });

    it('decrypts fields on findUnique result', async () => {
      const params = {
        model: 'Patient',
        action: 'findUnique',
        args: { where: { id: 1 } },
      };
      const dbResult = {
        id: 1,
        firstName: 'encrypted:John',
        lastName: 'encrypted:Doe',
        email: 'encrypted:john@example.com',
      };
      next.mockResolvedValue(dbResult);

      const result = await middleware(params as any, next);

      expect(result).toEqual({
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      });
    });

    it('decrypts array on findMany result', async () => {
      const params = {
        model: 'Patient',
        action: 'findMany',
        args: {},
      };
      const dbResult = [
        {
          id: 1,
          firstName: 'encrypted:John',
          lastName: 'encrypted:Doe',
        },
        {
          id: 2,
          firstName: 'encrypted:Jane',
          lastName: 'encrypted:Smith',
        },
      ];
      next.mockResolvedValue(dbResult);

      const result = await middleware(params as any, next);

      expect(result).toEqual([
        { id: 1, firstName: 'John', lastName: 'Doe' },
        { id: 2, firstName: 'Jane', lastName: 'Smith' },
      ]);
    });

    it('passes through non-PHI models (Order) without transforming', async () => {
      const params = {
        model: 'Order',
        action: 'create',
        args: {
          data: {
            status: 'PENDING',
            totalCents: 100,
          },
        },
      };
      const dbResult = { id: 1, status: 'PENDING', totalCents: 100 };
      next.mockResolvedValue(dbResult);

      const result = await middleware(params as any, next);

      expect(next).toHaveBeenCalledWith(params);
      expect(result).toEqual(dbResult);
    });

    it('handles null/undefined data gracefully', async () => {
      const params = {
        model: 'Patient',
        action: 'findUnique',
        args: { where: { id: 999 } },
      };
      next.mockResolvedValue(null);

      const result = await middleware(params as any, next);

      expect(result).toBeNull();
    });

    it('returns [Encrypted] on decryption failure', async () => {
      const { decryptPHI } = await import('@/lib/security/phi-encryption');
      vi.mocked(decryptPHI).mockImplementation((val: string) => {
        if (val === 'encrypted:John') throw new Error('Decryption failed');
        return val.startsWith('encrypted:') ? val.replace('encrypted:', '') : val;
      });

      const params = {
        model: 'Patient',
        action: 'findUnique',
        args: { where: { id: 1 } },
      };
      next.mockResolvedValue({
        id: 1,
        firstName: 'encrypted:John',
        lastName: 'encrypted:Doe',
      });

      const result = await middleware(params as any, next);

      expect(result).toEqual({
        id: 1,
        firstName: '[Encrypted]',
        lastName: 'Doe',
      });
    });

    it('encrypts data on update action', async () => {
      const params = {
        model: 'Patient',
        action: 'update',
        args: {
          where: { id: 1 },
          data: { firstName: 'Jane', lastName: 'Updated' },
        },
      };
      next.mockResolvedValue({ id: 1, firstName: 'Jane', lastName: 'Updated' });

      await middleware(params as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            where: { id: 1 },
            data: {
              firstName: 'encrypted:Jane',
              lastName: 'encrypted:Updated',
            },
          },
        })
      );
    });

    it('encrypts create and update on upsert action', async () => {
      const params = {
        model: 'Patient',
        action: 'upsert',
        args: {
          where: { id: 1 },
          create: { firstName: 'John', lastName: 'Doe' },
          update: { firstName: 'Johnny', lastName: 'Doe' },
        },
      };
      next.mockResolvedValue({ id: 1, firstName: 'Johnny', lastName: 'Doe' });

      await middleware(params as any, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          args: expect.objectContaining({
            create: { firstName: 'encrypted:John', lastName: 'encrypted:Doe' },
            update: { firstName: 'encrypted:Johnny', lastName: 'encrypted:Doe' },
          }),
        })
      );
    });
  });
});
