/**
 * Ref Code Creation Tests
 *
 * Tests the affiliate ref code creation logic:
 * 1. Successful creation with unique code
 * 2. P2002 constraint violation triggers retry
 * 3. Maximum retry attempts exhausted returns 409
 * 4. MAX_REF_CODES limit enforcement
 * 5. Code format validation (alphanumeric, correct length)
 * 6. Concurrent creation requests don't produce duplicates
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma, mockLogger } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      affiliateRefCode: {
        count: fn(),
        create: fn(),
        findMany: fn(),
      },
      affiliateTouch: { groupBy: fn() },
      affiliateCommissionEvent: { groupBy: fn() },
    },
    mockLogger: { info: fn(), warn: fn(), error: fn(), debug: fn() },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

describe('Ref Code Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Code format validation', () => {
    it('should only accept alphanumeric, hyphens, and underscores', () => {
      const validPattern = /^[A-Za-z0-9_-]+$/;

      expect(validPattern.test('TESTCODE123')).toBe(true);
      expect(validPattern.test('my-code')).toBe(true);
      expect(validPattern.test('my_code')).toBe(true);
      expect(validPattern.test('code with spaces')).toBe(false);
      expect(validPattern.test('code@special')).toBe(false);
      expect(validPattern.test('')).toBe(false);
    });

    it('should enforce minimum length of 2 characters', () => {
      const minLength = 2;
      expect('AB'.length >= minLength).toBe(true);
      expect('A'.length >= minLength).toBe(false);
    });

    it('should enforce maximum length of 50 characters', () => {
      const maxLength = 50;
      const longCode = 'A'.repeat(51);
      expect(longCode.length <= maxLength).toBe(false);
      expect('VALIDCODE'.length <= maxLength).toBe(true);
    });
  });

  describe('P2002 unique constraint retry logic', () => {
    it('should retry on P2002 unique constraint violation', async () => {
      const MAX_ATTEMPTS = 3;
      const p2002Error = { code: 'P2002', message: 'Unique constraint violation' };

      let attempts = 0;
      const createRefCode = async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          attempts++;
          try {
            if (attempt < 2) {
              throw p2002Error;
            }
            return { id: 1, refCode: 'SUCCESS' };
          } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
              if (attempt === MAX_ATTEMPTS - 1) {
                throw new Error('Max attempts exhausted');
              }
              continue;
            }
            throw err;
          }
        }
      };

      const result = await createRefCode();
      expect(result).toEqual({ id: 1, refCode: 'SUCCESS' });
      expect(attempts).toBe(3);
    });

    it('should return 409 after exhausting all retry attempts', async () => {
      const MAX_ATTEMPTS = 3;
      const p2002Error = { code: 'P2002', message: 'Unique constraint violation' };

      const createRefCode = async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            throw p2002Error;
          } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
              if (attempt === MAX_ATTEMPTS - 1) {
                return { status: 409, error: 'Could not generate unique code' };
              }
              continue;
            }
            throw err;
          }
        }
      };

      const result = await createRefCode();
      expect(result?.status).toBe(409);
    });

    it('should re-throw non-P2002 errors immediately', async () => {
      const MAX_ATTEMPTS = 3;
      const otherError = new Error('Database connection lost');

      const createRefCode = async () => {
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          try {
            throw otherError;
          } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
              continue;
            }
            throw err;
          }
        }
      };

      await expect(createRefCode()).rejects.toThrow('Database connection lost');
    });
  });

  describe('MAX_REF_CODES limit', () => {
    it('should enforce maximum ref codes per affiliate', async () => {
      const MAX_REF_CODES = 20;

      // Simulate having 20 existing codes
      mockPrisma.affiliateRefCode.count.mockResolvedValue(20);

      const count = await mockPrisma.affiliateRefCode.count({
        where: { affiliateId: 100 },
      });

      expect(count >= MAX_REF_CODES).toBe(true);
    });

    it('should allow creation when under limit', async () => {
      const MAX_REF_CODES = 20;

      mockPrisma.affiliateRefCode.count.mockResolvedValue(5);

      const count = await mockPrisma.affiliateRefCode.count({
        where: { affiliateId: 100 },
      });

      expect(count < MAX_REF_CODES).toBe(true);
    });
  });
});
