/**
 * Patient Repository Test Suite
 * =============================
 *
 * Tests for the patient repository data access layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock PHI encryption - must be before imports
vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((data: Record<string, unknown>) => data),
  decryptPatientPHI: vi.fn((data: Record<string, unknown>) => data),
  decryptPHI: vi.fn((value: string) => value),
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock db - must be before imports
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    clinic: {
      findUnique: vi.fn(),
    },
    patientCounter: {
      upsert: vi.fn(),
    },
    patientAudit: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    // Health Tracking Logs
    patientMedicationReminder: {
      deleteMany: vi.fn(),
    },
    patientWeightLog: {
      deleteMany: vi.fn(),
    },
    patientWaterLog: {
      deleteMany: vi.fn(),
    },
    patientExerciseLog: {
      deleteMany: vi.fn(),
    },
    patientSleepLog: {
      deleteMany: vi.fn(),
    },
    patientNutritionLog: {
      deleteMany: vi.fn(),
    },
    // Chat & Conversations
    patientChatMessage: {
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    aIConversation: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    aIMessage: {
      deleteMany: vi.fn(),
    },
    // Care Plans
    carePlan: {
      deleteMany: vi.fn(),
    },
    // Intake forms
    intakeFormSubmission: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    intakeFormResponse: {
      deleteMany: vi.fn(),
    },
    // SOAP Notes
    sOAPNote: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    sOAPNoteRevision: {
      deleteMany: vi.fn(),
    },
    // Documents and appointments
    patientDocument: {
      deleteMany: vi.fn(),
    },
    appointment: {
      deleteMany: vi.fn(),
    },
    // Payments and Invoices
    payment: {
      deleteMany: vi.fn(),
    },
    invoice: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    commission: {
      deleteMany: vi.fn(),
    },
    // Subscriptions and payment methods
    subscription: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    subscriptionAction: {
      deleteMany: vi.fn(),
    },
    paymentMethod: {
      deleteMany: vi.fn(),
    },
    // Tickets (must be deleted before Orders due to FK constraint)
    ticket: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    ticketSLA: {
      deleteMany: vi.fn(),
    },
    ticketEscalation: {
      deleteMany: vi.fn(),
    },
    ticketWorkLog: {
      deleteMany: vi.fn(),
    },
    ticketStatusHistory: {
      deleteMany: vi.fn(),
    },
    ticketComment: {
      deleteMany: vi.fn(),
    },
    ticketAssignment: {
      deleteMany: vi.fn(),
    },
    // Orders
    order: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    orderEvent: {
      deleteMany: vi.fn(),
    },
    rx: {
      deleteMany: vi.fn(),
    },
    // Referrals and discounts
    referralTracking: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    discountUsage: {
      deleteMany: vi.fn(),
    },
    affiliateReferral: {
      deleteMany: vi.fn(),
    },
    // Superbills
    superbill: {
      deleteMany: vi.fn(),
    },
    // Payment reconciliation
    paymentReconciliation: {
      updateMany: vi.fn(),
    },
    // SMS logs
    smsLog: {
      deleteMany: vi.fn(),
    },
    // HIPAA audit entries
    hIPAAAuditEntry: {
      updateMany: vi.fn(),
    },
    // Phone OTP
    phoneOtp: {
      deleteMany: vi.fn(),
    },
    // User association
    user: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import { createPatientRepository, type PatientRepository } from '@/domains/patient/repositories';
import { NotFoundError } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';

// Get typed mock
const mockPrisma = vi.mocked(prisma);

// Setup transaction mock to pass the same mock prisma to callback
mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));

describe('PatientRepository', () => {
  let repo: PatientRepository;

  const mockPatient = {
    id: 1,
    createdAt: new Date('2024-01-15'),
    clinicId: 10,
    patientId: '000001',
    firstName: 'John',
    lastName: 'Doe',
    dob: '1990-01-01',
    gender: 'male',
    phone: '555-1234',
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
    source: 'api',
    sourceMetadata: null,
  };

  const mockAuditContext = {
    actorEmail: 'admin@clinic.com',
    actorRole: 'admin',
    actorId: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup transaction mock after clearAllMocks
    mockPrisma.$transaction.mockImplementation((fn: (tx: typeof mockPrisma) => Promise<unknown>) => fn(mockPrisma));
    repo = createPatientRepository(mockPrisma as unknown as import('@prisma/client').PrismaClient);
  });

  describe('findById', () => {
    it('should return patient when found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);

      const result = await repo.findById(1);

      expect(result).toEqual(mockPatient);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should filter by clinicId when provided', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);

      await repo.findById(1, 10);

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 1, clinicId: 10 },
      });
    });

    it('should throw NotFoundError when patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(repo.findById(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('findByIdOrNull', () => {
    it('should return patient when found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);

      const result = await repo.findByIdOrNull(1);

      expect(result).toEqual(mockPatient);
    });

    it('should return null when not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      const result = await repo.findByIdOrNull(999);

      expect(result).toBeNull();
    });
  });

  describe('findByPatientId', () => {
    it('should find patient by patientId and clinicId', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);

      const result = await repo.findByPatientId('000001', 10);

      expect(result).toEqual(mockPatient);
      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { patientId: '000001', clinicId: 10 },
      });
    });
  });

  describe('findMany', () => {
    it('should return paginated results', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([mockPatient]);
      mockPrisma.patient.count.mockResolvedValue(1);

      const result = await repo.findMany({ clinicId: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should apply default pagination', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      await repo.findMany({});

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100,
          skip: 0,
          orderBy: { createdAt: 'desc' },
        })
      );
    });

    it('should cap limit at 500', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      await repo.findMany({}, { limit: 1000 });

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 500,
        })
      );
    });

    it('should filter by date range', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      const after = new Date('2024-01-01');
      const before = new Date('2024-12-31');

      await repo.findMany({ createdAfter: after, createdBefore: before });

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gte: after, lte: before },
          }),
        })
      );
    });

    it('should filter by source', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      await repo.findMany({ source: 'webhook' });

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            source: 'webhook',
          }),
        })
      );
    });

    it('should apply search filter', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([]);
      mockPrisma.patient.count.mockResolvedValue(0);

      await repo.findMany({ search: 'john' });

      expect(mockPrisma.patient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { searchIndex: { contains: 'john', mode: 'insensitive' } },
                ]),
              }),
            ]),
          }),
        })
      );
    });

    it('should calculate hasMore correctly', async () => {
      mockPrisma.patient.findMany.mockResolvedValue([mockPatient, mockPatient]);
      mockPrisma.patient.count.mockResolvedValue(10);

      const result = await repo.findMany({}, { limit: 2 });

      expect(result.hasMore).toBe(true);
    });
  });

  describe('findManyWithClinic', () => {
    it('should include clinic name in results', async () => {
      const patientWithClinic = {
        ...mockPatient,
        clinic: { name: 'Test Clinic' },
      };
      mockPrisma.patient.findMany.mockResolvedValue([patientWithClinic]);
      mockPrisma.patient.count.mockResolvedValue(1);

      const result = await repo.findManyWithClinic({});

      expect(result.data[0].clinicName).toBe('Test Clinic');
    });
  });

  describe('findWithCounts', () => {
    it('should return patient with related counts', async () => {
      const patientWithCounts = {
        ...mockPatient,
        _count: {
          orders: 5,
          documents: 3,
          soapNotes: 2,
          appointments: 1,
        },
      };
      mockPrisma.patient.findFirst.mockResolvedValue(patientWithCounts);

      const result = await repo.findWithCounts(1);

      expect(result?._count.orders).toBe(5);
      expect(result?._count.documents).toBe(3);
    });
  });

  describe('create', () => {
    it('should create patient with generated patientId', async () => {
      mockPrisma.patientCounter.upsert.mockResolvedValue({ current: 42 });
      mockPrisma.patient.create.mockResolvedValue({
        ...mockPatient,
        id: 100,
        patientId: '000042',
      });

      const input = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'male',
        phone: '555-1234',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        clinicId: 10,
      };

      const result = await repo.create(input, mockAuditContext);

      expect(result.patientId).toBe('000042');
      expect(mockPrisma.patientAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE',
          actorEmail: 'admin@clinic.com',
        }),
      });
    });

    it('should use source and sourceMetadata from input', async () => {
      mockPrisma.patientCounter.upsert.mockResolvedValue({ current: 1 });
      mockPrisma.patient.create.mockResolvedValue(mockPatient);

      const input = {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-01',
        gender: 'male',
        phone: '555-1234',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        clinicId: 10,
        source: 'webhook' as const,
        sourceMetadata: { webhookUrl: 'https://example.com/webhook' },
      };

      await repo.create(input, mockAuditContext);

      expect(mockPrisma.patient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: 'webhook',
          sourceMetadata: { webhookUrl: 'https://example.com/webhook' },
        }),
      });
    });
  });

  describe('update', () => {
    it('should update patient and create audit log', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patient.update.mockResolvedValue({
        ...mockPatient,
        firstName: 'Jane',
      });

      const result = await repo.update(
        1,
        { firstName: 'Jane' },
        mockAuditContext
      );

      expect(result.firstName).toBe('Jane');
      expect(mockPrisma.patientAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE',
          diff: { firstName: { before: '[REDACTED]', after: '[REDACTED]' } },
        }),
      });
    });

    it('should throw NotFoundError if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(
        repo.update(999, { firstName: 'Jane' }, mockAuditContext)
      ).rejects.toThrow(NotFoundError);
    });

    it('should filter by clinicId when provided', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patient.update.mockResolvedValue(mockPatient);

      await repo.update(1, { firstName: 'Jane' }, mockAuditContext, 10);

      expect(mockPrisma.patient.findFirst).toHaveBeenCalledWith({
        where: { id: 1, clinicId: 10 },
      });
    });

    it('should not create audit log if no changes', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patient.update.mockResolvedValue(mockPatient);

      await repo.update(1, { firstName: 'John' }, mockAuditContext);

      expect(mockPrisma.patientAudit.create).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    // Helper to setup common delete mocks
    const setupDeleteMocks = () => {
      const patientWithCounts = {
        ...mockPatient,
        _count: { orders: 0, documents: 0, soapNotes: 0, appointments: 0 },
      };
      mockPrisma.patient.findFirst.mockResolvedValue(patientWithCounts);
      mockPrisma.aIConversation.findMany.mockResolvedValue([]);
      mockPrisma.intakeFormSubmission.findMany.mockResolvedValue([]);
      mockPrisma.sOAPNote.findMany.mockResolvedValue([]);
      mockPrisma.subscription.findMany.mockResolvedValue([]);
      mockPrisma.ticket.findMany.mockResolvedValue([]);
      mockPrisma.order.findMany.mockResolvedValue([]);
      (mockPrisma.invoice as any).findMany.mockResolvedValue([]);
      (mockPrisma.referralTracking as any).findMany.mockResolvedValue([]);
      return patientWithCounts;
    };

    it('should delete patient and all related records', async () => {
      setupDeleteMocks();

      await repo.delete(1, mockAuditContext);

      // Verify audit log created
      expect(mockPrisma.patientAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'DELETE',
        }),
      });

      // Verify patient deleted
      expect(mockPrisma.patient.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw NotFoundError if patient not found', async () => {
      mockPrisma.patient.findFirst.mockResolvedValue(null);

      await expect(repo.delete(999, mockAuditContext)).rejects.toThrow(NotFoundError);
    });

    it('should delete related intake submissions and responses', async () => {
      setupDeleteMocks();
      mockPrisma.intakeFormSubmission.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
      ]);

      await repo.delete(1, mockAuditContext);

      expect(mockPrisma.intakeFormResponse.deleteMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.intakeFormSubmission.deleteMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
      });
    });

    it('should delete tickets before orders (FK constraint)', async () => {
      setupDeleteMocks();
      mockPrisma.ticket.findMany.mockResolvedValue([{ id: 10 }, { id: 11 }]);
      mockPrisma.order.findMany.mockResolvedValue([{ id: 20 }]);

      await repo.delete(1, mockAuditContext);

      // Verify tickets deleted
      expect(mockPrisma.ticket.deleteMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
      });
      // Verify orders deleted
      expect(mockPrisma.order.deleteMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
      });
    });
  });

  describe('exists', () => {
    it('should return true if patient exists', async () => {
      mockPrisma.patient.count.mockResolvedValue(1);

      const result = await repo.exists(1);

      expect(result).toBe(true);
    });

    it('should return false if patient does not exist', async () => {
      mockPrisma.patient.count.mockResolvedValue(0);

      const result = await repo.exists(999);

      expect(result).toBe(false);
    });

    it('should filter by clinicId when provided', async () => {
      mockPrisma.patient.count.mockResolvedValue(1);

      await repo.exists(1, 10);

      expect(mockPrisma.patient.count).toHaveBeenCalledWith({
        where: { id: 1, clinicId: 10 },
      });
    });
  });

  describe('count', () => {
    it('should return count of patients matching filter', async () => {
      mockPrisma.patient.count.mockResolvedValue(42);

      const result = await repo.count({ clinicId: 10 });

      expect(result).toBe(42);
      expect(mockPrisma.patient.count).toHaveBeenCalledWith({
        where: { clinicId: 10 },
      });
    });
  });

  describe('PHI Decryption Handling', () => {
    it('should gracefully handle decryption failures', async () => {
      const phiMock = await import('@/lib/security/phi-encryption');

      // Make per-field decryption throw
      vi.mocked(phiMock.decryptPHI).mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);

      // Should not throw -- repository catches decryption errors
      const result = await repo.findByIdOrNull(1);

      expect(result).toBeDefined();
      expect(result?.id).toBe(1);

      // Restore default mock so other tests aren't affected
      vi.mocked(phiMock.decryptPHI).mockImplementation((value: string) => value);
    });

    it('should encrypt PHI fields on create', async () => {
      const phiMock = await import('@/lib/security/phi-encryption');

      (mockPrisma.clinic as any).findUnique.mockResolvedValue({ patientIdPrefix: 'P' });
      mockPrisma.patientCounter.upsert.mockResolvedValue({ id: 1, current: 1 });
      mockPrisma.patient.create.mockResolvedValue(mockPatient);
      mockPrisma.patientAudit.create.mockResolvedValue({ id: 1 });

      const input = {
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'f',
        address1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        clinicId: 10,
      };

      await repo.create(input, mockAuditContext);

      expect(phiMock.encryptPatientPHI).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'jane@example.com',
          phone: '5551234567',
          dob: '1990-01-15',
        }),
        ['firstName', 'lastName', 'email', 'phone', 'dob', 'address1', 'address2', 'city', 'state', 'zip']
      );
    });

    it('should encrypt PHI fields on update', async () => {
      const phiMock = await import('@/lib/security/phi-encryption');

      mockPrisma.patient.findFirst.mockResolvedValue(mockPatient);
      mockPrisma.patient.update.mockResolvedValue({
        ...mockPatient,
        email: 'new@example.com',
      });
      mockPrisma.patientAudit.create.mockResolvedValue({ id: 1 });

      await repo.update(1, { email: 'new@example.com' }, mockAuditContext);

      expect(phiMock.encryptPatientPHI).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'new@example.com' }),
        ['firstName', 'lastName', 'email', 'phone', 'dob', 'address1', 'address2', 'city', 'state', 'zip']
      );
    });
  });
});
