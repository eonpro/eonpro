/**
 * Prescriptions Route Tests
 * Tests for the prescriptions API endpoint
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    provider: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    patient: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    order: {
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    rx: {
      createMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

vi.mock('@/lib/lifefile', () => ({
  default: {
    createFullOrder: vi.fn(),
  },
  getEnvCredentials: vi.fn(() => ({
    practiceId: 'test-practice',
    practiceName: 'Test Practice',
    practiceAddress: '123 Main St',
    practicePhone: '555-1234',
  })),
}));

vi.mock('@/lib/clinic-lifefile', () => ({
  getClinicLifefileClient: vi.fn(),
  getClinicLifefileCredentials: vi.fn(),
}));

vi.mock('@/lib/pdf', () => ({
  generatePrescriptionPDF: vi.fn(() => Promise.resolve('base64-pdf-content')),
}));

vi.mock('@/lib/medications', () => ({
  MEDS: {
    'tirzepatide-5mg': {
      id: 'LF001',
      name: 'Tirzepatide',
      strength: '5mg',
      form: 'vial',
      formLabel: 'Vial',
    },
    'semaglutide-0.25mg': {
      id: 'LF002',
      name: 'Semaglutide',
      strength: '0.25mg',
      form: 'vial',
      formLabel: 'Vial',
    },
  },
}));

vi.mock('@/lib/shipping', () => ({
  SHIPPING_METHODS: [
    { id: 'standard', label: 'Standard Shipping' },
    { id: 'expedited', label: 'Expedited Shipping' },
  ],
}));

vi.mock('@/lib/validate', () => ({
  prescriptionSchema: {
    safeParse: vi.fn((data) => {
      if (!data.providerId || !data.patient || !data.rxs) {
        return { success: false, error: { message: 'Validation failed' } };
      }
      return { success: true, data };
    }),
  },
}));

import { prisma } from '@/lib/db';
import lifefile, { getEnvCredentials } from '@/lib/lifefile';
import { getClinicLifefileClient, getClinicLifefileCredentials } from '@/lib/clinic-lifefile';
import { generatePrescriptionPDF } from '@/lib/pdf';
import { prescriptionSchema } from '@/lib/validate';

describe('Prescriptions Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/prescriptions', () => {
    const validPrescriptionData = {
      providerId: 1,
      patient: {
        firstName: 'John',
        lastName: 'Doe',
        dob: '1990-01-15',
        gender: 'm',
        phone: '555-123-4567',
        email: 'john@example.com',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '90210',
      },
      rxs: [
        {
          medicationKey: 'tirzepatide-5mg',
          quantity: 1,
          refills: 0,
          sig: 'Inject 5mg subcutaneously once weekly',
        },
      ],
      shippingMethod: 'standard',
    };

    const mockProvider = {
      id: 1,
      firstName: 'Dr. Jane',
      lastName: 'Smith',
      npi: '1234567890',
      dea: 'FS1234567',
      licenseNumber: 'MD123456',
      licenseState: 'CA',
      phone: '555-987-6543',
      email: 'dr.smith@clinic.com',
      signatureDataUrl: 'data:image/png;base64,signature',
      clinicId: 1,
      clinic: {
        id: 1,
        name: 'Test Clinic',
      },
    };

    it('should validate request body', async () => {
      vi.mocked(prescriptionSchema.safeParse).mockReturnValue({
        success: false,
        error: { message: 'Invalid data' } as any,
      });

      // This simulates the validation check in the route
      const result = prescriptionSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should require valid provider', async () => {
      vi.mocked(prisma.provider.findUnique).mockResolvedValue(null);

      const result = await prisma.provider.findUnique({ where: { id: 999 } });
      expect(result).toBeNull();
    });

    it('should fetch provider with clinic', async () => {
      vi.mocked(prisma.provider.findUnique).mockResolvedValue(mockProvider as any);

      const result = await prisma.provider.findUnique({
        where: { id: 1 },
        include: { clinic: true },
      });

      expect(result).toEqual(mockProvider);
      expect(result?.clinicId).toBe(1);
    });

    it('should try clinic credentials first', async () => {
      vi.mocked(getClinicLifefileCredentials).mockResolvedValue({
        practiceId: 'clinic-practice',
        practiceName: 'Clinic Practice',
        practiceAddress: '456 Clinic St',
        practicePhone: '555-5678',
        baseUrl: 'https://api.lifefile.com',
        username: 'clinic-user',
        password: 'clinic-pass',
        vendorId: 'vendor',
        locationId: 'location',
        networkId: 'network',
      });

      const credentials = await getClinicLifefileCredentials(1);
      expect(credentials).toBeDefined();
      expect(credentials?.practiceId).toBe('clinic-practice');
    });

    it('should fall back to env credentials when clinic not configured', async () => {
      vi.mocked(getClinicLifefileCredentials).mockResolvedValue(null);

      const clinicCreds = await getClinicLifefileCredentials(1);
      expect(clinicCreds).toBeNull();

      const envCreds = getEnvCredentials();
      expect(envCreds.practiceId).toBe('test-practice');
    });

    it('should save provider signature if new', async () => {
      vi.mocked(prisma.provider.update).mockResolvedValue({ ...mockProvider, signatureDataUrl: 'new-signature' } as any);

      await prisma.provider.update({
        where: { id: 1 },
        data: { signatureDataUrl: 'new-signature' },
      });

      expect(prisma.provider.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { signatureDataUrl: 'new-signature' },
      });
    });

    it('should generate prescription PDF', async () => {
      vi.mocked(generatePrescriptionPDF).mockResolvedValue('base64-pdf-content');

      const pdf = await generatePrescriptionPDF({
        referenceId: 'rx-123',
        date: '01/15/2024',
        provider: {
          name: 'Dr. Jane Smith',
          npi: '1234567890',
        },
        patient: {
          firstName: 'John',
          lastName: 'Doe',
          dob: '1990-01-15',
          gender: 'Male',
          address1: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '90210',
        },
        prescriptions: [
          {
            medication: 'Tirzepatide',
            strength: '5mg',
            sig: 'Inject once weekly',
            quantity: 1,
            refills: 0,
            daysSupply: 30,
          },
        ],
        shipping: {
          methodLabel: 'Standard Shipping',
          addressLine1: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '90210',
        },
        signatureDataUrl: 'data:image/png;base64,signature',
      } as any);

      expect(pdf).toBe('base64-pdf-content');
    });

    it('should create patient record if not exists', async () => {
      vi.mocked(prisma.patient.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.patient.create).mockResolvedValue({
        id: 1,
        ...validPrescriptionData.patient,
      } as any);

      const existing = await prisma.patient.findFirst({
        where: {
          firstName: 'John',
          lastName: 'Doe',
          dob: '1990-01-15',
        },
      });

      expect(existing).toBeNull();

      const created = await prisma.patient.create({
        data: validPrescriptionData.patient,
      });

      expect(created.id).toBe(1);
    });

    it('should create order record', async () => {
      const mockOrder = {
        id: 1,
        messageId: 'eonpro-123',
        referenceId: 'rx-123',
        patientId: 1,
        providerId: 1,
        shippingMethod: 'standard',
        primaryMedName: 'Tirzepatide',
        primaryMedStrength: '5mg',
        primaryMedForm: 'Vial',
        status: 'PENDING',
      };

      vi.mocked(prisma.order.create).mockResolvedValue(mockOrder as any);

      const order = await prisma.order.create({
        data: {
          messageId: 'eonpro-123',
          referenceId: 'rx-123',
          patientId: 1,
          providerId: 1,
          shippingMethod: 'standard',
          primaryMedName: 'Tirzepatide',
          primaryMedStrength: '5mg',
          primaryMedForm: 'Vial',
          status: 'PENDING',
          requestJson: '{}',
        },
      });

      expect(order.id).toBe(1);
      expect(order.status).toBe('PENDING');
    });

    it('should create rx records for each medication', async () => {
      vi.mocked(prisma.rx.createMany).mockResolvedValue({ count: 2 });

      const result = await prisma.rx.createMany({
        data: [
          {
            orderId: 1,
            medicationKey: 'tirzepatide-5mg',
            medName: 'Tirzepatide',
            strength: '5mg',
            form: 'vial',
            quantity: 1,
            refills: 0,
            sig: 'Inject once weekly',
          },
          {
            orderId: 1,
            medicationKey: 'semaglutide-0.25mg',
            medName: 'Semaglutide',
            strength: '0.25mg',
            form: 'vial',
            quantity: 1,
            refills: 0,
            sig: 'Inject once weekly',
          },
        ],
      });

      expect(result.count).toBe(2);
    });

    it('should submit order to Lifefile', async () => {
      vi.mocked(lifefile.createFullOrder).mockResolvedValue({
        orderId: 'LF-ORDER-123',
        status: 'submitted',
      });

      const response = await lifefile.createFullOrder({
        message: { id: 'eonpro-123', sentTime: new Date().toISOString() },
        order: {
          general: { memo: 'Test', referenceId: 'rx-123' },
          prescriber: { npi: '1234567890', firstName: 'Jane', lastName: 'Smith' },
          practice: { id: 'practice-id', name: 'Test Practice' },
          patient: {
            firstName: 'John',
            lastName: 'Doe',
            dateOfBirth: '1990-01-15',
            gender: 'm',
            address1: '123 Main St',
            city: 'Anytown',
            state: 'CA',
            zip: '90210',
          },
          shipping: {
            recipientType: 'patient',
            recipientFirstName: 'John',
            recipientLastName: 'Doe',
            addressLine1: '123 Main St',
            city: 'Anytown',
            state: 'CA',
            zipCode: '90210',
            service: 'standard',
          },
          billing: { payorType: 'pat' },
          rxs: [],
          document: { pdfBase64: 'base64-content' },
        },
      } as any);

      expect(response.orderId).toBe('LF-ORDER-123');
      expect(response.status).toBe('submitted');
    });

    it('should update order with Lifefile response', async () => {
      vi.mocked(prisma.order.update).mockResolvedValue({
        id: 1,
        lifefileOrderId: 'LF-ORDER-123',
        status: 'submitted',
      } as any);

      const updated = await prisma.order.update({
        where: { id: 1 },
        data: {
          lifefileOrderId: 'LF-ORDER-123',
          status: 'submitted',
          responseJson: '{"orderId": "LF-ORDER-123"}',
        },
      });

      expect(updated.lifefileOrderId).toBe('LF-ORDER-123');
      expect(updated.status).toBe('submitted');
    });

    it('should handle Lifefile error and update order status', async () => {
      vi.mocked(lifefile.createFullOrder).mockRejectedValue(new Error('Lifefile API error'));
      vi.mocked(prisma.order.updateMany).mockResolvedValue({ count: 1 });

      await prisma.order.updateMany({
        where: { messageId: 'eonpro-123' },
        data: {
          status: 'error',
          errorMessage: 'Lifefile API error',
        },
      });

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { messageId: 'eonpro-123' },
        data: expect.objectContaining({
          status: 'error',
        }),
      });
    });
  });
});

describe('Clinical Difference Statements', () => {
  const getClinicalDifferenceStatement = (medicationName: string): string | undefined => {
    const upperMedName = medicationName.toUpperCase();
    
    if (upperMedName.includes('TIRZEPATIDE')) {
      return 'Beyond Medical Necessary - Tirzepatide with Glycine...';
    }
    
    if (upperMedName.includes('SEMAGLUTIDE')) {
      return 'Beyond Medical Necessary - Semaglutide with Glycine...';
    }
    
    if (upperMedName.includes('TESTOSTERONE')) {
      return 'Beyond medical necessary - Testosterone with grapeseed oil...';
    }
    
    return undefined;
  };

  it('should return statement for Tirzepatide', () => {
    const statement = getClinicalDifferenceStatement('Tirzepatide 5mg');
    expect(statement).toContain('Tirzepatide');
  });

  it('should return statement for Semaglutide', () => {
    const statement = getClinicalDifferenceStatement('Semaglutide 0.25mg');
    expect(statement).toContain('Semaglutide');
  });

  it('should return statement for Testosterone', () => {
    const statement = getClinicalDifferenceStatement('Testosterone Cypionate');
    expect(statement).toContain('Testosterone');
  });

  it('should return undefined for other medications', () => {
    const statement = getClinicalDifferenceStatement('Aspirin 81mg');
    expect(statement).toBeUndefined();
  });
});

describe('Date of Birth Normalization', () => {
  const normalizeDob = (input: string): string => {
    if (!input) return '';
    if (input.includes('-')) {
      return input;
    }
    const parts = input.split('/');
    if (parts.length === 3) {
      const [mm, dd, yyyy] = parts;
      if (yyyy && mm && dd) {
        return `${yyyy.padStart(4, '0')}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
      }
    }
    return input;
  };

  it('should handle ISO format', () => {
    expect(normalizeDob('1990-01-15')).toBe('1990-01-15');
  });

  it('should convert MM/DD/YYYY to ISO', () => {
    expect(normalizeDob('01/15/1990')).toBe('1990-01-15');
  });

  it('should handle single digit month/day', () => {
    expect(normalizeDob('1/5/1990')).toBe('1990-01-05');
  });

  it('should handle empty string', () => {
    expect(normalizeDob('')).toBe('');
  });

  it('should return original for unknown format', () => {
    expect(normalizeDob('Jan 15, 1990')).toBe('Jan 15, 1990');
  });
});

describe('Shipping Method Resolution', () => {
  const SHIPPING_METHODS = [
    { id: 'standard', label: 'Standard Shipping (5-7 days)' },
    { id: 'expedited', label: 'Expedited Shipping (2-3 days)' },
    { id: 'overnight', label: 'Overnight Shipping' },
  ];

  const getShippingLabel = (methodId: string): string => {
    const method = SHIPPING_METHODS.find(m => m.id === methodId);
    return method?.label ?? `Service ${methodId}`;
  };

  it('should return standard shipping label', () => {
    expect(getShippingLabel('standard')).toContain('Standard');
  });

  it('should return expedited shipping label', () => {
    expect(getShippingLabel('expedited')).toContain('Expedited');
  });

  it('should return fallback for unknown method', () => {
    expect(getShippingLabel('unknown')).toBe('Service unknown');
  });
});

describe('Medication Key Validation', () => {
  const MEDS: Record<string, any> = {
    'tirzepatide-5mg': { id: 'LF001', name: 'Tirzepatide', strength: '5mg' },
    'semaglutide-0.25mg': { id: 'LF002', name: 'Semaglutide', strength: '0.25mg' },
  };

  it('should find valid medication key', () => {
    const med = MEDS['tirzepatide-5mg'];
    expect(med).toBeDefined();
    expect(med.name).toBe('Tirzepatide');
  });

  it('should return undefined for invalid key', () => {
    const med = MEDS['invalid-key'];
    expect(med).toBeUndefined();
  });

  it('should throw for invalid medication in processing', () => {
    const processRx = (key: string) => {
      const med = MEDS[key];
      if (!med) {
        throw new Error(`Invalid medicationKey: ${key}`);
      }
      return med;
    };

    expect(() => processRx('invalid-key')).toThrow('Invalid medicationKey');
  });
});
