/**
 * Lead Transition Service Tests
 * =============================
 *
 * Tests for the LEAD → ACTIVE patient transition and shouldShowLeadPortal logic.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransaction, mockPatientFindFirst, mockPublish } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  mockPatientFindFirst: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@prisma/client', () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: 'Serializable' },
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: mockTransaction,
    patient: {
      findFirst: mockPatientFindFirst,
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

vi.mock('@/domains/shared/errors/AppError', () => {
  class NotFoundError extends Error {
    code = 'NOT_FOUND';
    statusCode = 404;
    constructor(msg: string) { super(msg); this.name = 'NotFoundError'; }
  }
  class ForbiddenError extends Error {
    code = 'FORBIDDEN';
    statusCode = 403;
    constructor(msg: string) { super(msg); this.name = 'ForbiddenError'; }
  }
  return { NotFoundError, ForbiddenError };
});

vi.mock('@/lib/events/domain-event-bus', () => ({
  domainEvents: {
    publish: mockPublish,
  },
  DOMAIN_EVENTS: {
    INTAKE_COMPLETED: 'INTAKE_COMPLETED',
  },
}));

import {
  transitionLeadToActive,
  shouldShowLeadPortal,
} from '@/domains/intake/services/lead-transition.service';

describe('Lead Transition Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPublish.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // transitionLeadToActive
  // -------------------------------------------------------------------------

  describe('transitionLeadToActive', () => {
    it('transitions a LEAD patient to ACTIVE', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue({
              id: 1,
              clinicId: 10,
              profileStatus: 'LEAD',
            }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      const result = await transitionLeadToActive(1, 10);

      expect(result).toEqual({
        success: true,
        previousStatus: 'LEAD',
        newStatus: 'ACTIVE',
        patientId: 1,
      });
    });

    it('publishes INTAKE_COMPLETED event after transition', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue({
              id: 2,
              clinicId: 5,
              profileStatus: 'LEAD',
            }),
            update: vi.fn().mockResolvedValue({}),
          },
        };
        return fn(tx);
      });

      await transitionLeadToActive(2, 5);

      expect(mockPublish).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTAKE_COMPLETED',
          payload: expect.objectContaining({ patientId: 2, clinicId: 5 }),
        }),
      );
    });

    it('returns success without update when patient is already ACTIVE', async () => {
      const mockUpdate = vi.fn();
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue({
              id: 3,
              clinicId: 10,
              profileStatus: 'ACTIVE',
            }),
            update: mockUpdate,
          },
        };
        return fn(tx);
      });

      const result = await transitionLeadToActive(3, 10);

      expect(result.success).toBe(true);
      expect(result.previousStatus).toBe('ACTIVE');
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockPublish).not.toHaveBeenCalled();
    });

    it('throws NotFoundError when patient does not exist', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue(null),
          },
        };
        return fn(tx);
      });

      await expect(transitionLeadToActive(999, 10)).rejects.toThrow('not found');
    });

    it('throws ForbiddenError on clinic mismatch', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue({
              id: 1,
              clinicId: 10,
              profileStatus: 'LEAD',
            }),
          },
        };
        return fn(tx);
      });

      await expect(transitionLeadToActive(1, 99)).rejects.toThrow('Clinic ID mismatch');
    });

    it('uses Serializable isolation level', async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            findUnique: vi.fn().mockResolvedValue({
              id: 1,
              clinicId: 10,
              profileStatus: 'LEAD',
            }),
            update: vi.fn(),
          },
        };
        return fn(tx);
      });

      await transitionLeadToActive(1, 10);

      expect(mockTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // shouldShowLeadPortal
  // -------------------------------------------------------------------------

  describe('shouldShowLeadPortal', () => {
    it('returns true for LEAD patient with zero completed submissions', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'LEAD',
        _count: { intakeSubmissions: 0 },
      });

      const result = await shouldShowLeadPortal(1);
      expect(result).toBe(true);
    });

    it('returns true for PENDING_COMPLETION patient with zero submissions', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'PENDING_COMPLETION',
        _count: { intakeSubmissions: 0 },
      });

      const result = await shouldShowLeadPortal(1);
      expect(result).toBe(true);
    });

    it('returns false for ACTIVE patient with zero submissions', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'ACTIVE',
        _count: { intakeSubmissions: 0 },
      });

      const result = await shouldShowLeadPortal(1);
      expect(result).toBe(false);
    });

    it('returns false for LEAD patient with completed submissions', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'LEAD',
        _count: { intakeSubmissions: 1 },
      });

      const result = await shouldShowLeadPortal(1);
      expect(result).toBe(false);
    });

    it('returns false when patient is not found', async () => {
      mockPatientFindFirst.mockResolvedValue(null);

      const result = await shouldShowLeadPortal(999);
      expect(result).toBe(false);
    });

    it('passes clinicId filter when provided', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'LEAD',
        _count: { intakeSubmissions: 0 },
      });

      await shouldShowLeadPortal(1, 10);

      expect(mockPatientFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1, clinicId: 10 },
        }),
      );
    });

    it('omits clinicId filter when not provided', async () => {
      mockPatientFindFirst.mockResolvedValue({
        profileStatus: 'LEAD',
        _count: { intakeSubmissions: 0 },
      });

      await shouldShowLeadPortal(1);

      expect(mockPatientFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
        }),
      );
    });
  });
});
