import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
  providerFindUnique: vi.fn(),
  patientFindFirst: vi.fn(),
  patientFindUnique: vi.fn(),
  patientCreate: vi.fn(),
  orderCreate: vi.fn(),
  orderFindFirst: vi.fn(),
  rxCreateMany: vi.fn(),
  providerUpdate: vi.fn(),
  userFindUnique: vi.fn(),
  providerClinicFindFirst: vi.fn(),
  userFindFirst: vi.fn(),
  withRetry: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mocks.mockTransaction(...args),
    provider: { findUnique: mocks.providerFindUnique, update: mocks.providerUpdate },
    patient: {
      findFirst: mocks.patientFindFirst,
      findUnique: mocks.patientFindUnique,
      create: mocks.patientCreate,
    },
    order: { create: mocks.orderCreate, findFirst: mocks.orderFindFirst, update: vi.fn(), count: vi.fn() },
    rx: { createMany: mocks.rxCreateMany },
    clinic: { findUnique: vi.fn() },
  },
  basePrisma: {
    $transaction: (...args: unknown[]) => mocks.mockTransaction(...args),
    provider: { findUnique: mocks.providerFindUnique },
    patient: { findFirst: mocks.patientFindFirst, findUnique: mocks.patientFindUnique },
    order: { create: mocks.orderCreate, findFirst: mocks.orderFindFirst },
    providerClinic: { findFirst: mocks.providerClinicFindFirst },
    user: { findUnique: mocks.userFindUnique, findFirst: mocks.userFindFirst },
  },
  withRetry: (...args: unknown[]) => mocks.withRetry(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/medications', () => ({
  MEDS: {
    test_med: {
      id: 'med-1',
      name: 'Test Medication',
      strength: '10mg',
      form: 'tablet',
      formLabel: 'Tablet',
    },
  },
}));

vi.mock('@/lib/shipping', () => ({
  SHIPPING_METHODS: [{ id: '1', label: 'Standard' }],
}));

vi.mock('@/lib/pdf', () => ({
  generatePrescriptionPDF: vi.fn().mockResolvedValue('base64pdf'),
}));

vi.mock('@/services/refill', () => ({
  markPrescribed: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/services/provider', () => ({
  providerCompensationService: { recordPrescription: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/services/billing', () => ({
  platformFeeService: { recordPrescriptionFee: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/lib/lifefile', () => ({
  default: { createFullOrder: vi.fn().mockResolvedValue({ data: { orderId: 'lf-123' }, status: 'sent' }) },
  getEnvCredentials: vi.fn().mockReturnValue({
    practiceName: 'Test Practice',
    practiceAddress: '123 Main St',
    practicePhone: '555-1234',
    practiceFax: '555-5678',
    practiceId: 'practice-1',
  }),
}));

vi.mock('@/lib/clinic-lifefile', () => ({
  getClinicLifefileClient: vi.fn().mockResolvedValue({
    createFullOrder: vi.fn().mockResolvedValue({ data: { orderId: 'lf-123' }, status: 'sent' }),
  }),
  getClinicLifefileCredentials: vi.fn().mockResolvedValue({
    practiceName: 'Test Practice',
    practiceAddress: '123 Main St',
    practicePhone: '555-1234',
    practiceFax: '555-5678',
    practiceId: 'practice-1',
  }),
}));

vi.mock('@/lib/utils/search', () => ({
  buildPatientSearchIndex: vi.fn().mockReturnValue('search-index'),
}));

import {
  createPrescriptionService,
  prescriptionService,
} from '@/domains/prescription/services/prescription.service';

describe('PrescriptionService', () => {
  const mockProvider = {
    id: 1,
    firstName: 'John',
    lastName: 'Doe',
    npi: '1234567890',
    dea: 'AD1234567',
    licenseNumber: 'lic-123',
    licenseState: 'CA',
    email: 'provider@clinic.com',
    phone: '555-0000',
    clinicId: 1,
    signatureDataUrl: null,
    clinic: { id: 1 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerFindUnique.mockResolvedValue(mockProvider);
    mocks.userFindUnique.mockResolvedValue({ id: 1, providerId: 1, email: 'provider@clinic.com' });
    mocks.providerClinicFindFirst.mockResolvedValue({ id: 1 });
    mocks.patientFindFirst.mockResolvedValue(null);
    mocks.patientFindUnique.mockResolvedValue(null);
    mocks.patientCreate.mockResolvedValue({
      id: 100,
      firstName: 'Jane',
      lastName: 'Smith',
      clinicId: 1,
    });
    mocks.orderCreate.mockResolvedValue({
      id: 200,
      messageId: 'eonpro-1',
      patientId: 100,
      providerId: 1,
      clinicId: 1,
    });
    mocks.rxCreateMany.mockResolvedValue({ count: 1 });
    mocks.mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        order: {
          findFirst: mocks.orderFindFirst,
          create: mocks.orderCreate,
        },
        patient: {
          findUnique: mocks.patientFindUnique,
          findFirst: mocks.patientFindFirst,
          create: mocks.patientCreate,
        },
        rx: { createMany: mocks.rxCreateMany },
      })
    );
    mocks.orderFindFirst.mockResolvedValue(null);
    mocks.withRetry.mockImplementation((fn: () => Promise<unknown>) => fn());
  });

  it('can be created without throwing', () => {
    expect(() => createPrescriptionService()).not.toThrow();
  });

  it('returns an object with createPrescription method', () => {
    const service = createPrescriptionService();
    expect(service).toBeDefined();
    expect(typeof service.createPrescription).toBe('function');
  });

  it('exports createPrescriptionService and prescriptionService', () => {
    expect(createPrescriptionService).toBeDefined();
    expect(prescriptionService).toBeDefined();
  });
});
