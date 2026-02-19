/**
 * Performance regression tests for critical paths.
 *
 * These tests mock Prisma and count the number of database queries each
 * function makes, asserting that N+1 patterns and unbounded scans don't
 * regress. They do NOT test execution time — they test query efficiency.
 *
 * If a test fails, it means someone added a database query inside a loop
 * or removed the searchIndex fast path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track all prisma calls
let queryLog: Array<{ model: string; action: string; args: unknown }> = [];

function createTrackedModel(modelName: string) {
  const handler: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const action of [
    'findUnique',
    'findFirst',
    'findMany',
    'create',
    'update',
    'updateMany',
    'delete',
    'count',
    'upsert',
  ]) {
    handler[action] = vi.fn(async (args?: unknown) => {
      queryLog.push({ model: modelName, action, args });
      return action === 'findMany' ? [] : null;
    });
  }
  return handler;
}

const mockPrisma = {
  patient: createTrackedModel('patient'),
  invoice: createTrackedModel('invoice'),
  payment: createTrackedModel('payment'),
  clinic: createTrackedModel('clinic'),
  idempotencyRecord: createTrackedModel('idempotencyRecord'),
  sOAPNote: createTrackedModel('sOAPNote'),
  order: createTrackedModel('order'),
  subscription: createTrackedModel('subscription'),
  $transaction: vi.fn(async (fn: (tx: typeof mockPrisma) => unknown) => fn(mockPrisma)),
  $queryRaw: vi.fn(async () => []),
  $executeRaw: vi.fn(async () => 0),
};

vi.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  basePrisma: mockPrisma,
  setClinicContext: vi.fn(),
  getClinicContext: vi.fn(() => ({ clinicId: 1 })),
  runWithClinicContext: vi.fn(async (_id: number, fn: () => unknown) => fn()),
  Prisma: { sql: vi.fn(), join: vi.fn() },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPHI: vi.fn((val: string) => val),
  encryptPHI: vi.fn((val: string) => val),
  encryptPatientPHI: vi.fn((data: unknown) => data),
  safeDecrypt: vi.fn((val: string) => val),
  safeDecryptField: vi.fn((val: string) => val),
  decryptPatientRecord: vi.fn((record: unknown) => record),
  PATIENT_PHI_FIELDS: ['firstName', 'lastName', 'email', 'phone'],
}));

vi.mock('@/lib/utils/search', () => ({
  buildPatientSearchIndex: vi.fn(() => 'test search index'),
}));

vi.mock('@/lib/patients', () => ({
  generatePatientId: vi.fn(() => 'PAT-TEST-001'),
}));

vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({})),
  };
});

describe('Critical path query efficiency', () => {
  beforeEach(() => {
    queryLog = [];
    // Re-apply tracking implementations (clearAllMocks strips them)
    for (const model of Object.values(mockPrisma)) {
      if (typeof model !== 'object' || model === null) continue;
      for (const [action, fn] of Object.entries(model as Record<string, ReturnType<typeof vi.fn>>)) {
        if (typeof fn?.mockImplementation !== 'function') continue;
        const modelName = Object.entries(mockPrisma).find(([, v]) => v === model)?.[0] || 'unknown';
        fn.mockImplementation(async (args?: unknown) => {
          queryLog.push({ model: modelName, action, args });
          return action === 'findMany' ? [] : null;
        });
      }
    }
  });

  describe('paymentMatchingService', () => {
    it('findPatientByEmail makes <= 3 queries (searchIndex fast path + fallback)', async () => {
      const { findPatientByEmail } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      // Mock: no patient found anywhere (worst case — all strategies tried)
      mockPrisma.patient.findFirst.mockResolvedValue(null);
      mockPrisma.patient.findMany.mockResolvedValue([]);

      await findPatientByEmail('test@example.com', 1);

      const patientQueries = queryLog.filter((q) => q.model === 'patient');
      expect(patientQueries.length).toBeLessThanOrEqual(3);
    });

    it('findPatientByPhone makes <= 3 queries', async () => {
      const { findPatientByPhone } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      mockPrisma.patient.findFirst.mockResolvedValue(null);
      mockPrisma.patient.findMany.mockResolvedValue([]);

      await findPatientByPhone('5551234567', 1);

      const patientQueries = queryLog.filter((q) => q.model === 'patient');
      expect(patientQueries.length).toBeLessThanOrEqual(3);
    });

    it('findPatientByName makes <= 3 queries', async () => {
      const { findPatientByName } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      mockPrisma.patient.findFirst.mockResolvedValue(null);
      mockPrisma.patient.findMany.mockResolvedValue([]);

      await findPatientByName('John', 'Doe', 1);

      const patientQueries = queryLog.filter((q) => q.model === 'patient');
      expect(patientQueries.length).toBeLessThanOrEqual(3);
    });

    it('findPatientByEmail returns on first searchIndex hit (2 queries)', async () => {
      const { findPatientByEmail } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      const mockPatient = {
        id: 1,
        email: 'test@example.com',
        clinicId: 1,
        searchIndex: 'test@example.com john doe',
      };

      // First call (plaintext) returns null, second call (searchIndex) returns match
      mockPrisma.patient.findFirst.mockImplementation(async (args?: unknown) => {
        queryLog.push({ model: 'patient', action: 'findFirst', args });
        // Return null on first call (plaintext), return patient on second (searchIndex)
        const callCount = queryLog.filter(
          (q) => q.model === 'patient' && q.action === 'findFirst',
        ).length;
        return callCount <= 1 ? null : mockPatient;
      });

      const result = await findPatientByEmail('test@example.com', 1);

      expect(result).toBeTruthy();
      const patientQueries = queryLog.filter((q) => q.model === 'patient');
      // plaintext miss + searchIndex hit = 2 queries, no fallback scan triggered
      expect(patientQueries.length).toBe(2);
    });
  });

  describe('findMany take limits', () => {
    it('paymentMatchingService fallback queries use take <= 500', async () => {
      const { findPatientByEmail } = await import(
        '@/services/stripe/paymentMatchingService'
      );

      mockPrisma.patient.findFirst.mockResolvedValue(null);
      mockPrisma.patient.findMany.mockResolvedValue([]);

      await findPatientByEmail('test@example.com', 1);

      const findManyArgs = queryLog
        .filter((q) => q.model === 'patient' && q.action === 'findMany')
        .map((q) => q.args as { take?: number });

      for (const args of findManyArgs) {
        expect(args?.take).toBeDefined();
        expect(args?.take).toBeLessThanOrEqual(500);
      }
    });
  });
});
