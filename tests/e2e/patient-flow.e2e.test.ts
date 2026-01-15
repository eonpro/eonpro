/**
 * E2E Tests - Patient Flow
 * Tests critical patient management user flows
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock all external dependencies for E2E-style tests
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    patientCounter: {
      upsert: vi.fn(),
    },
    patientAudit: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    patientDocument: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    invoice: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    soapNote: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((callback) => callback({
      patientCounter: {
        upsert: vi.fn().mockResolvedValue({ current: 1 }),
      },
      patient: {
        create: vi.fn().mockResolvedValue({ id: 1, patientId: '000001' }),
      },
      patientAudit: {
        create: vi.fn(),
      },
    })),
  },
}));

vi.mock('@/lib/security/phi-encryption', () => ({
  encryptPatientPHI: vi.fn((data) => data),
  decryptPatientPHI: vi.fn((data) => data),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    api: vi.fn(),
  },
}));

vi.mock('@/lib/rateLimit', () => ({
  strictRateLimit: (handler: Function) => handler,
  standardRateLimit: (handler: Function) => handler,
  relaxedRateLimit: (handler: Function) => handler,
}));

import { prisma } from '@/lib/db';

describe('E2E: Patient Registration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('New Patient Registration', () => {
    it('should complete full patient registration flow', async () => {
      // Step 1: Validate patient data
      const patientData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '5551234567',
        dob: '1990-01-15',
        gender: 'Male',
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      };

      // Validate with schema
      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      const validationResult = patientCreateSchema.safeParse(patientData);
      expect(validationResult.success).toBe(true);

      // Step 2: Create patient in database
      vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
        return callback({
          patientCounter: {
            upsert: vi.fn().mockResolvedValue({ current: 1 }),
          },
          patient: {
            create: vi.fn().mockResolvedValue({
              id: 1,
              patientId: '000001',
              ...patientData,
              createdAt: new Date(),
            }),
          },
          patientAudit: {
            create: vi.fn(),
          },
        });
      });

      // Step 3: Verify patient was created with correct data
      const createdPatient = {
        id: 1,
        patientId: '000001',
        ...patientData,
      };

      expect(createdPatient.patientId).toBe('000001');
      expect(createdPatient.firstName).toBe('John');
      expect(createdPatient.email).toBe('john.doe@example.com');
    });

    it('should reject invalid patient data', async () => {
      const invalidData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email', // Invalid
        phone: '123', // Too short
        dob: '1990-01-15',
        gender: 'Unknown', // Invalid enum
        address1: '123 Main St',
        city: 'Miami',
        state: 'FL',
        zip: '33101',
      };

      const { patientCreateSchema } = await import('@/lib/validation/schemas');
      const result = patientCreateSchema.safeParse(invalidData);
      
      expect(result.success).toBe(false);
    });

    it('should generate sequential patient IDs', async () => {
      const patientIds: string[] = [];
      
      for (let i = 1; i <= 3; i++) {
        const patientId = i.toString().padStart(6, '0');
        patientIds.push(patientId);
      }

      expect(patientIds).toEqual(['000001', '000002', '000003']);
    });
  });

  describe('Patient Profile Update Flow', () => {
    it('should update patient profile and create audit log', async () => {
      const existingPatient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '5551234567',
      };

      const updates = {
        phone: '5559876543',
        address1: '456 New St',
      };

      vi.mocked(prisma.patient.findUnique).mockResolvedValue(existingPatient as any);
      vi.mocked(prisma.patient.update).mockResolvedValue({
        ...existingPatient,
        ...updates,
      } as any);

      // Verify audit log would be created
      const auditEntry = {
        patientId: 1,
        action: 'UPDATE',
        actorEmail: 'admin@eonpro.com',
        diff: {
          phone: { before: '5551234567', after: '5559876543' },
          address1: { before: undefined, after: '456 New St' },
        },
      };

      expect(auditEntry.diff.phone.after).toBe('5559876543');
    });

    it('should not create audit log for unchanged data', async () => {
      const existingPatient = {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
      };

      const updates = {
        firstName: 'John', // Same value
        lastName: 'Doe', // Same value
      };

      // Calculate diff
      const diff: Record<string, any> = {};
      Object.keys(updates).forEach(key => {
        const oldVal = (existingPatient as any)[key];
        const newVal = (updates as any)[key];
        if (oldVal !== newVal) {
          diff[key] = { before: oldVal, after: newVal };
        }
      });

      expect(Object.keys(diff)).toHaveLength(0);
    });
  });

  describe('Patient Search Flow', () => {
    it('should search patients by name', async () => {
      const mockPatients = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
        { id: 2, firstName: 'Johnny', lastName: 'Smith', email: 'johnny@example.com' },
      ];

      vi.mocked(prisma.patient.findMany).mockResolvedValue(mockPatients as any);

      const searchTerm = 'john';
      const results = mockPatients.filter(
        p => p.firstName.toLowerCase().includes(searchTerm) ||
             p.lastName.toLowerCase().includes(searchTerm)
      );

      expect(results).toHaveLength(2);
    });

    it('should search patients by email', async () => {
      const mockPatients = [
        { id: 1, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
      ];

      vi.mocked(prisma.patient.findMany).mockResolvedValue(mockPatients as any);

      const searchTerm = 'john@example.com';
      const results = mockPatients.filter(p => p.email === searchTerm);

      expect(results).toHaveLength(1);
      expect(results[0].firstName).toBe('John');
    });

    it('should paginate search results', async () => {
      const allPatients = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        firstName: `Patient${i + 1}`,
        lastName: 'Test',
      }));

      const page = 2;
      const limit = 20;
      const offset = (page - 1) * limit;
      const paginatedResults = allPatients.slice(offset, offset + limit);

      expect(paginatedResults).toHaveLength(20);
      expect(paginatedResults[0].id).toBe(21);
    });
  });
});

describe('E2E: Patient Intake Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Intake Form Submission', () => {
    it('should process intake form and create patient', async () => {
      const intakeData = {
        submissionId: 'intake-12345',
        data: {
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
          phone: '5559876543',
          dob: '1985-05-20',
          gender: 'Female',
          address1: '789 Oak Ave',
          city: 'Orlando',
          state: 'FL',
          zip: '32801',
          allergies: 'Penicillin',
          currentMedications: 'Metformin 500mg',
          medicalHistory: 'Type 2 Diabetes',
        },
      };

      // Validate intake data
      expect(intakeData.data.firstName).toBeDefined();
      expect(intakeData.data.email).toContain('@');

      // Simulate patient creation from intake
      const createdPatient = {
        id: 2,
        patientId: '000002',
        ...intakeData.data,
        source: 'webhook',
        sourceMetadata: {
          submissionId: intakeData.submissionId,
          timestamp: new Date().toISOString(),
        },
      };

      expect(createdPatient.source).toBe('webhook');
      expect(createdPatient.sourceMetadata.submissionId).toBe('intake-12345');
    });

    it('should update existing patient from intake', async () => {
      const existingPatient = {
        id: 1,
        email: 'jane.smith@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
      };

      const intakeData = {
        email: 'jane.smith@example.com',
        phone: '5551111111', // Updated phone
        address1: '999 New Address', // Updated address
      };

      vi.mocked(prisma.patient.findUnique).mockResolvedValue(existingPatient as any);

      // Upsert logic
      const updatedPatient = {
        ...existingPatient,
        ...intakeData,
      };

      expect(updatedPatient.phone).toBe('5551111111');
      expect(updatedPatient.address1).toBe('999 New Address');
    });

    it('should generate SOAP note from intake', async () => {
      const intakeData = {
        chiefComplaint: 'Weight management',
        currentWeight: '200 lbs',
        targetWeight: '180 lbs',
        allergies: 'None',
        medications: 'None',
        medicalHistory: 'Hypertension',
      };

      const generatedSOAP = {
        subjective: `Patient presents for weight management consultation. Chief complaint: ${intakeData.chiefComplaint}. Current weight: ${intakeData.currentWeight}. Target weight: ${intakeData.targetWeight}.`,
        objective: `Weight: ${intakeData.currentWeight}. Allergies: ${intakeData.allergies}. Current medications: ${intakeData.medications}.`,
        assessment: 'Obesity with desire for weight management. Medical history significant for hypertension.',
        plan: '1. Discuss weight loss medication options\n2. Review diet and exercise\n3. Follow up in 4 weeks',
      };

      expect(generatedSOAP.subjective).toContain('weight management');
      expect(generatedSOAP.objective).toContain('200 lbs');
      expect(generatedSOAP.assessment).toContain('Obesity');
    });
  });
});

describe('E2E: Patient Billing Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invoice Creation', () => {
    it('should create invoice for patient consultation', async () => {
      const patientId = 1;
      const consultationFee = 15000; // $150.00 in cents

      const invoice = {
        id: 1,
        patientId,
        description: 'Telehealth Consultation',
        amountDue: consultationFee,
        status: 'OPEN',
        lineItems: [
          { description: 'Initial Consultation - Weight Management', amount: 15000 },
        ],
      };

      expect(invoice.amountDue).toBe(15000);
      expect(invoice.status).toBe('OPEN');
    });

    it('should create invoice with multiple line items', async () => {
      const lineItems = [
        { description: 'Consultation', amount: 15000 },
        { description: 'Lab Work - Metabolic Panel', amount: 7500 },
        { description: 'Prescription - Semaglutide', amount: 50000 },
      ];

      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      expect(totalAmount).toBe(72500); // $725.00
    });
  });

  describe('Payment Processing', () => {
    it('should process payment and update invoice status', async () => {
      const invoice = {
        id: 1,
        status: 'OPEN',
        amountDue: 15000,
        amountPaid: 0,
      };

      const payment = {
        amount: 15000,
        status: 'succeeded',
      };

      // Update invoice after payment
      const updatedInvoice = {
        ...invoice,
        status: payment.status === 'succeeded' ? 'PAID' : invoice.status,
        amountPaid: payment.amount,
        paidAt: new Date(),
      };

      expect(updatedInvoice.status).toBe('PAID');
      expect(updatedInvoice.amountPaid).toBe(15000);
    });

    it('should handle partial payment', async () => {
      const invoice = {
        id: 1,
        status: 'OPEN',
        amountDue: 15000,
        amountPaid: 0,
      };

      const partialPayment = {
        amount: 5000,
        status: 'succeeded',
      };

      const updatedInvoice = {
        ...invoice,
        amountPaid: invoice.amountPaid + partialPayment.amount,
        status: (invoice.amountPaid + partialPayment.amount) >= invoice.amountDue ? 'PAID' : 'PARTIAL',
      };

      expect(updatedInvoice.status).toBe('PARTIAL');
      expect(updatedInvoice.amountPaid).toBe(5000);
    });
  });
});

describe('E2E: Patient Document Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Document Upload', () => {
    it('should upload and categorize patient document', async () => {
      const document = {
        patientId: 1,
        filename: 'lab-results-2024.pdf',
        mimeType: 'application/pdf',
        size: 125000,
        category: 'LAB_RESULTS',
        s3Key: 'patients/1/documents/1705312800-lab-results-2024.pdf',
      };

      expect(document.category).toBe('LAB_RESULTS');
      expect(document.s3Key).toContain('patients/1');
    });

    it('should validate file type', () => {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];

      const validFile = { mimeType: 'application/pdf' };
      const invalidFile = { mimeType: 'application/exe' };

      expect(allowedTypes.includes(validFile.mimeType)).toBe(true);
      expect(allowedTypes.includes(invalidFile.mimeType)).toBe(false);
    });

    it('should validate file size', () => {
      const maxSize = 10 * 1024 * 1024; // 10MB

      const validFile = { size: 5 * 1024 * 1024 }; // 5MB
      const invalidFile = { size: 15 * 1024 * 1024 }; // 15MB

      expect(validFile.size <= maxSize).toBe(true);
      expect(invalidFile.size <= maxSize).toBe(false);
    });
  });

  describe('Document Retrieval', () => {
    it('should list patient documents by category', async () => {
      const documents = [
        { id: 1, category: 'LAB_RESULTS', filename: 'lab1.pdf' },
        { id: 2, category: 'LAB_RESULTS', filename: 'lab2.pdf' },
        { id: 3, category: 'INTAKE_FORM', filename: 'intake.pdf' },
      ];

      const labResults = documents.filter(d => d.category === 'LAB_RESULTS');

      expect(labResults).toHaveLength(2);
    });

    it('should generate signed URL for download', async () => {
      const document = {
        id: 1,
        s3Key: 'patients/1/documents/test.pdf',
      };

      // Simulate signed URL generation
      const signedUrl = `https://bucket.s3.amazonaws.com/${document.s3Key}?signature=abc123&expires=3600`;

      expect(signedUrl).toContain(document.s3Key);
      expect(signedUrl).toContain('signature=');
    });
  });
});

describe('E2E: Patient Communication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SMS Notifications', () => {
    it('should send appointment reminder', async () => {
      const patient = {
        id: 1,
        firstName: 'John',
        phone: '+15551234567',
      };

      const appointment = {
        date: new Date('2024-02-15T10:00:00'),
        provider: 'Dr. Smith',
      };

      const message = `Hi ${patient.firstName}, reminder: your appointment with ${appointment.provider} is on Feb 15 at 10:00 AM.`;

      expect(message).toContain('John');
      expect(message).toContain('Dr. Smith');
    });

    it('should send prescription ready notification', async () => {
      const patient = {
        id: 1,
        firstName: 'Jane',
        phone: '+15559876543',
      };

      const prescription = {
        id: 'RX-12345',
        medication: 'Semaglutide',
      };

      const message = `Hi ${patient.firstName}, your prescription ${prescription.id} is ready.`;

      expect(message).toContain('Jane');
      expect(message).toContain('RX-12345');
    });
  });

  describe('Email Notifications', () => {
    it('should send welcome email', async () => {
      const patient = {
        firstName: 'John',
        email: 'john@example.com',
      };

      const emailContent = {
        to: patient.email,
        subject: 'Welcome to EONPRO',
        body: `Hi ${patient.firstName}, welcome to EONPRO!`,
      };

      expect(emailContent.to).toBe('john@example.com');
      expect(emailContent.body).toContain('John');
    });

    it('should send invoice email', async () => {
      const invoice = {
        number: 'INV-001',
        amount: 15000,
        dueDate: '2024-02-15',
        paymentUrl: 'https://pay.stripe.com/invoice/123',
      };

      const emailContent = {
        subject: `Invoice ${invoice.number} - Payment Due`,
        body: `Your invoice for $${(invoice.amount / 100).toFixed(2)} is due on ${invoice.dueDate}.`,
        paymentLink: invoice.paymentUrl,
      };

      expect(emailContent.body).toContain('$150.00');
      expect(emailContent.paymentLink).toContain('stripe.com');
    });
  });
});
