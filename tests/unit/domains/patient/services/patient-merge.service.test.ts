/**
 * Patient Merge Service Test Suite
 * =================================
 *
 * Tests for the patient merge service business logic.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock modules before importing service - all must be inline
vi.mock('@/lib/db', () => {
  return {
    prisma: {
      patient: {
        findFirst: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      order: { updateMany: vi.fn() },
      invoice: { updateMany: vi.fn() },
      payment: { updateMany: vi.fn() },
      paymentMethod: { updateMany: vi.fn() },
      subscription: { updateMany: vi.fn() },
      sOAPNote: { updateMany: vi.fn() },
      patientDocument: { updateMany: vi.fn() },
      intakeFormSubmission: { updateMany: vi.fn() },
      appointment: { updateMany: vi.fn() },
      superbill: { updateMany: vi.fn() },
      carePlan: { updateMany: vi.fn() },
      ticket: { updateMany: vi.fn() },
      patientWeightLog: { updateMany: vi.fn() },
      patientMedicationReminder: { updateMany: vi.fn() },
      patientWaterLog: { updateMany: vi.fn() },
      patientExerciseLog: { updateMany: vi.fn() },
      patientSleepLog: { updateMany: vi.fn() },
      patientNutritionLog: { updateMany: vi.fn() },
      aIConversation: { updateMany: vi.fn() },
      patientChatMessage: { updateMany: vi.fn() },
      smsLog: { updateMany: vi.fn() },
      affiliateReferral: { updateMany: vi.fn() },
      discountUsage: { updateMany: vi.fn() },
      patientShippingUpdate: { updateMany: vi.fn() },
      paymentReconciliation: { updateMany: vi.fn() },
      hIPAAAuditEntry: { updateMany: vi.fn() },
      phoneOtp: { updateMany: vi.fn() },
      referralTracking: {
        findFirst: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
      commission: { deleteMany: vi.fn() },
      user: {
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      patientAudit: {
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      $transaction: vi.fn(),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  decryptPatientPHI: vi.fn((patient: Record<string, unknown>) => patient),
  encryptPatientPHI: vi.fn((data: Record<string, unknown>) => data),
}));

// Helper to create fresh mock prisma for each test
const createMockPrisma = () => ({
  patient: {
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  order: { updateMany: vi.fn() },
  invoice: { updateMany: vi.fn() },
  payment: { updateMany: vi.fn() },
  paymentMethod: { updateMany: vi.fn() },
  subscription: { updateMany: vi.fn() },
  sOAPNote: { updateMany: vi.fn() },
  patientDocument: { updateMany: vi.fn() },
  intakeFormSubmission: { updateMany: vi.fn() },
  appointment: { updateMany: vi.fn() },
  superbill: { updateMany: vi.fn() },
  carePlan: { updateMany: vi.fn() },
  ticket: { updateMany: vi.fn() },
  patientWeightLog: { updateMany: vi.fn() },
  patientMedicationReminder: { updateMany: vi.fn() },
  patientWaterLog: { updateMany: vi.fn() },
  patientExerciseLog: { updateMany: vi.fn() },
  patientSleepLog: { updateMany: vi.fn() },
  patientNutritionLog: { updateMany: vi.fn() },
  aIConversation: { updateMany: vi.fn() },
  patientChatMessage: { updateMany: vi.fn() },
  smsLog: { updateMany: vi.fn() },
  affiliateReferral: { updateMany: vi.fn() },
  discountUsage: { updateMany: vi.fn() },
  patientShippingUpdate: { updateMany: vi.fn() },
  paymentReconciliation: { updateMany: vi.fn() },
  hIPAAAuditEntry: { updateMany: vi.fn() },
  phoneOtp: { updateMany: vi.fn() },
  referralTracking: {
    findFirst: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  commission: { deleteMany: vi.fn() },
  user: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  patientAudit: {
    create: vi.fn(),
    updateMany: vi.fn(),
  },
  $transaction: vi.fn(),
});

// Import after mocks
import {
  createPatientMergeService,
  type PatientMergeService,
} from '@/domains/patient/services/patient-merge.service';
import type { UserContext } from '@/domains/shared/types';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '@/domains/shared/errors';

describe('PatientMergeService', () => {
  let service: PatientMergeService;
  let mockDb: ReturnType<typeof createMockPrisma>;

  const mockSourcePatient = {
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
    lifefileId: 'LF123',
    notes: 'Source notes',
    tags: ['tag1'],
    stripeCustomerId: 'cus_source',
    source: 'webhook',
    sourceMetadata: { intakeField1: 'value1' },
    _count: {
      orders: 2,
      invoices: 1,
      payments: 1,
      paymentMethods: 0,
      subscriptions: 0,
      soapNotes: 1,
      documents: 3,
      intakeSubmissions: 1,
      appointments: 0,
      superbills: 0,
      carePlans: 0,
      tickets: 0,
      weightLogs: 5,
      medicationReminders: 0,
      waterLogs: 0,
      exerciseLogs: 0,
      sleepLogs: 0,
      nutritionLogs: 0,
      aiConversations: 0,
      chatMessages: 2,
      smsLogs: 0,
      referrals: 0,
      affiliateReferrals: 0,
      discountUsages: 0,
      shippingUpdates: 1,
      auditEntries: 3,
    },
  };

  const mockTargetPatient = {
    id: 2,
    createdAt: new Date('2024-02-20'),
    clinicId: 10,
    patientId: '000002',
    firstName: 'John',
    lastName: 'Doe',
    dob: '1990-01-01',
    gender: 'm',
    phone: '5559876543',
    email: 'johndoe@example.com',
    address1: '456 Oak Ave',
    address2: 'Apt 2B',
    city: 'Springfield',
    state: 'IL',
    zip: '62701',
    lifefileId: null,
    notes: 'Target notes',
    tags: ['tag2'],
    stripeCustomerId: 'cus_target',
    source: 'api',
    sourceMetadata: { intakeField2: 'value2' },
    _count: {
      orders: 0,
      invoices: 2,
      payments: 2,
      paymentMethods: 1,
      subscriptions: 1,
      soapNotes: 0,
      documents: 0,
      intakeSubmissions: 0,
      appointments: 1,
      superbills: 0,
      carePlans: 0,
      tickets: 1,
      weightLogs: 0,
      medicationReminders: 1,
      waterLogs: 0,
      exerciseLogs: 0,
      sleepLogs: 0,
      nutritionLogs: 0,
      aiConversations: 1,
      chatMessages: 0,
      smsLogs: 0,
      referrals: 1,
      affiliateReferrals: 0,
      discountUsages: 1,
      shippingUpdates: 0,
      auditEntries: 2,
    },
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

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh mock for each test
    mockDb = createMockPrisma();
    
    // Setup $transaction to execute callback with mockDb
    (mockDb.$transaction as Mock).mockImplementation(
      (callback: (tx: typeof mockDb) => Promise<unknown>) => callback(mockDb)
    );

    // Create service with mock
    service = createPatientMergeService(mockDb as unknown as Parameters<typeof createPatientMergeService>[0]);

    // Default mock implementations
    (mockDb.patient.findFirst as Mock).mockImplementation(({ where }: { where: { id?: number } }) => {
      if (where.id === 1) return Promise.resolve(mockSourcePatient);
      if (where.id === 2) return Promise.resolve(mockTargetPatient);
      return Promise.resolve(null);
    });

    (mockDb.referralTracking.findFirst as Mock).mockResolvedValue(null);
    (mockDb.user.findFirst as Mock).mockResolvedValue(null);
    (mockDb.patientAudit.create as Mock).mockResolvedValue({ id: 100 });
    (mockDb.patient.update as Mock).mockResolvedValue({ ...mockTargetPatient, ...mockSourcePatient });
    (mockDb.patient.delete as Mock).mockResolvedValue(mockSourcePatient);
  });

  describe('previewMerge', () => {
    it('should return preview for valid merge', async () => {
      const preview = await service.previewMerge(1, 2, adminUser);

      expect(preview.source.id).toBe(1);
      expect(preview.target.id).toBe(2);
      expect(preview.canMerge).toBe(true);
      expect(preview.totalRecordsToMove).toBeGreaterThan(0);
    });

    it('should throw BadRequestError when merging patient with itself', async () => {
      await expect(service.previewMerge(1, 1, adminUser)).rejects.toThrow(BadRequestError);
    });

    it('should throw NotFoundError for non-existent source patient', async () => {
      (mockDb.patient.findFirst as Mock).mockImplementation(({ where }: { where: { id?: number } }) => {
        if (where.id === 999) return Promise.resolve(null);
        if (where.id === 2) return Promise.resolve(mockTargetPatient);
        return Promise.resolve(null);
      });

      await expect(service.previewMerge(999, 2, adminUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for non-existent target patient', async () => {
      (mockDb.patient.findFirst as Mock).mockImplementation(({ where }: { where: { id?: number } }) => {
        if (where.id === 1) return Promise.resolve(mockSourcePatient);
        if (where.id === 999) return Promise.resolve(null);
        return Promise.resolve(null);
      });

      await expect(service.previewMerge(1, 999, adminUser)).rejects.toThrow(NotFoundError);
    });

    it('should throw BadRequestError when patients are from different clinics', async () => {
      const differentClinicPatient = { ...mockTargetPatient, clinicId: 20 };
      (mockDb.patient.findFirst as Mock).mockImplementation(({ where }: { where: { id?: number } }) => {
        if (where.id === 1) return Promise.resolve(mockSourcePatient);
        if (where.id === 2) return Promise.resolve(differentClinicPatient);
        return Promise.resolve(null);
      });

      await expect(service.previewMerge(1, 2, adminUser)).rejects.toThrow(BadRequestError);
    });

    it('should throw ForbiddenError for user without clinic', async () => {
      const userNoClinic: UserContext = {
        id: 5,
        email: 'orphan@example.com',
        role: 'provider',
      };

      await expect(service.previewMerge(1, 2, userNoClinic)).rejects.toThrow(ForbiddenError);
    });

    it('should allow super_admin to merge', async () => {
      const preview = await service.previewMerge(1, 2, superAdminUser);

      expect(preview.source.id).toBe(1);
      expect(preview.target.id).toBe(2);
    });

    it('should include conflict warning for different stripe customer IDs', async () => {
      const preview = await service.previewMerge(1, 2, adminUser);

      const stripeConflict = preview.conflicts.find(c => c.field === 'stripeCustomerId');
      expect(stripeConflict).toBeDefined();
      expect(stripeConflict?.type).toBe('warning');
    });

    it('should calculate correct total records to move', async () => {
      const preview = await service.previewMerge(1, 2, adminUser);

      // Sum of all source _counts
      const expectedTotal = Object.values(mockSourcePatient._count).reduce((a, b) => a + b, 0);
      expect(preview.totalRecordsToMove).toBe(expectedTotal);
    });
  });

  describe('executeMerge', () => {
    it('should execute merge successfully', async () => {
      const result = await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(result.deletedPatientId).toBe(1);
      expect(result.auditId).toBe(100);
    });

    it('should re-point all relations to target patient', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      // Check that relation updates were called
      expect(mockDb.order.updateMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        data: { patientId: 2 },
      });
      expect(mockDb.invoice.updateMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        data: { patientId: 2 },
      });
      expect(mockDb.sOAPNote.updateMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        data: { patientId: 2 },
      });
    });

    it('should create audit entry for merge', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patientAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: 2,
          action: 'MERGE',
          actorEmail: 'admin@clinic.com',
        }),
      });
    });

    it('should delete source patient after merge', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should handle source referral tracking - move to target', async () => {
      (mockDb.referralTracking.findFirst as Mock)
        .mockResolvedValueOnce({ id: 10, patientId: 1 }) // source has referral
        .mockResolvedValueOnce(null); // target has no referral

      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.referralTracking.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { patientId: 2 },
      });
    });

    it('should handle source referral tracking - delete if target has one', async () => {
      (mockDb.referralTracking.findFirst as Mock)
        .mockResolvedValueOnce({ id: 10, patientId: 1 }) // source has referral
        .mockResolvedValueOnce({ id: 20, patientId: 2 }); // target has referral

      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.commission.deleteMany).toHaveBeenCalledWith({
        where: { referralId: 10 },
      });
      expect(mockDb.referralTracking.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
    });

    it('should handle user account - move to target if target has none', async () => {
      (mockDb.user.findFirst as Mock)
        .mockResolvedValueOnce({ id: 100, patientId: 1 }) // source has user
        .mockResolvedValueOnce(null); // target has no user

      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { patientId: 2 },
      });
    });

    it('should handle user account - nullify source if target has one', async () => {
      (mockDb.user.findFirst as Mock)
        .mockResolvedValueOnce({ id: 100, patientId: 1 }) // source has user
        .mockResolvedValueOnce({ id: 200, patientId: 2 }); // target has user

      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.user.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { patientId: null },
      });
    });

    it('should apply field overrides when provided', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        fieldOverrides: {
          firstName: 'CustomName',
          email: 'custom@example.com',
        },
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'CustomName',
            email: 'custom@example.com',
          }),
        })
      );
    });

    it('should merge tags from both patients', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tags: expect.arrayContaining(['tag1', 'tag2']),
          }),
        })
      );
    });

    it('should use earliest createdAt date', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            createdAt: new Date('2024-01-15'), // source is earlier
          }),
        })
      );
    });

    it('should use source lifefileId if target has none', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifefileId: 'LF123', // from source
          }),
        })
      );
    });
  });

  describe('notes merge', () => {
    it('should concatenate notes from both patients', async () => {
      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: expect.stringContaining('Target notes'),
          }),
        })
      );
    });

    it('should handle null notes gracefully', async () => {
      const sourceNoNotes = { ...mockSourcePatient, notes: null };
      (mockDb.patient.findFirst as Mock).mockImplementation(({ where }: { where: { id?: number } }) => {
        if (where.id === 1) return Promise.resolve(sourceNoNotes);
        if (where.id === 2) return Promise.resolve(mockTargetPatient);
        return Promise.resolve(null);
      });

      await service.executeMerge({
        sourcePatientId: 1,
        targetPatientId: 2,
        performedBy: adminUser,
      });

      expect(mockDb.patient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: 'Target notes',
          }),
        })
      );
    });
  });
});
