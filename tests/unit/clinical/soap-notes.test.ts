/**
 * SOAP Notes & Clinical Data Tests
 * Tests for SOAP note creation, validation, and clinical workflows
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    soapNote: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
    provider: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('SOAP Note Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SOAP Note Create Schema', () => {
    it('should validate SOAP note with all required fields', async () => {
      const { soapNoteCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteCreateSchema.safeParse({
        patientId: 1,
        subjective: 'Patient reports weight loss of 5 lbs over past month. Denies nausea or vomiting.',
        objective: 'BP 120/80, HR 72, Weight 185 lbs. BMI 28.5. Patient appears well-nourished.',
        assessment: 'Type 2 diabetes mellitus, well-controlled. Weight loss consistent with dietary changes.',
        plan: '1. Continue current medication regimen\n2. Follow up in 3 months\n3. Continue current diet',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject empty subjective field', async () => {
      const { soapNoteCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteCreateSchema.safeParse({
        patientId: 1,
        subjective: '',
        objective: 'BP 120/80',
        assessment: 'Stable',
        plan: 'Continue medications',
      });
      
      expect(result.success).toBe(false);
    });

    it('should accept optional medical necessity', async () => {
      const { soapNoteCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteCreateSchema.safeParse({
        patientId: 1,
        subjective: 'Chief complaint: weight management',
        objective: 'Current weight: 200 lbs, BMI: 30',
        assessment: 'Obesity with metabolic syndrome',
        plan: 'Initiate weight loss medication',
        medicalNecessity: 'Patient has BMI > 27 with obesity-related comorbidities. Weight loss medication is medically necessary to reduce cardiovascular risk.',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.medicalNecessity).toBeDefined();
      }
    });

    it('should enforce maximum length for fields', async () => {
      const { soapNoteCreateSchema } = await import('@/lib/validation/schemas');
      
      // Create string longer than 10000 characters
      const veryLongString = 'a'.repeat(15000);
      
      const result = soapNoteCreateSchema.safeParse({
        patientId: 1,
        subjective: veryLongString,
        objective: 'Normal',
        assessment: 'Stable',
        plan: 'Continue',
      });
      
      expect(result.success).toBe(false);
    });

    it('should accept intake document reference', async () => {
      const { soapNoteCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteCreateSchema.safeParse({
        patientId: 1,
        subjective: 'Based on intake form submission',
        objective: 'As documented in intake',
        assessment: 'New patient evaluation',
        plan: 'Initial treatment plan',
        intakeDocumentId: 456,
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.intakeDocumentId).toBe(456);
      }
    });
  });

  describe('SOAP Note Update Schema', () => {
    it('should allow partial updates', async () => {
      const { soapNoteUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteUpdateSchema.safeParse({
        plan: 'Updated treatment plan with new medication',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate status changes', async () => {
      const { soapNoteUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteUpdateSchema.safeParse({
        status: 'APPROVED',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('APPROVED');
      }
    });

    it('should reject invalid status', async () => {
      const { soapNoteUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = soapNoteUpdateSchema.safeParse({
        status: 'INVALID_STATUS',
      });
      
      expect(result.success).toBe(false);
    });

    it('should accept all valid statuses', async () => {
      const { soapNoteUpdateSchema } = await import('@/lib/validation/schemas');
      
      const validStatuses = ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'LOCKED', 'ARCHIVED'];
      
      for (const status of validStatuses) {
        const result = soapNoteUpdateSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('Appointment Validation', () => {
  describe('Appointment Create Schema', () => {
    it('should validate appointment with required fields', async () => {
      const { appointmentCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentCreateSchema.safeParse({
        patientId: 1,
        providerId: 2,
        startTime: '2024-02-15T10:00:00Z',
        duration: 30,
        type: 'VIDEO',
      });
      
      expect(result.success).toBe(true);
    });

    it('should default type to VIDEO', async () => {
      const { appointmentCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentCreateSchema.safeParse({
        patientId: 1,
        providerId: 2,
        startTime: '2024-02-15T10:00:00Z',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('VIDEO');
      }
    });

    it('should accept optional fields', async () => {
      const { appointmentCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentCreateSchema.safeParse({
        patientId: 1,
        providerId: 2,
        startTime: '2024-02-15T10:00:00Z',
        title: 'Follow-up Consultation',
        reason: 'Weight loss medication follow-up',
        notes: 'Patient requested afternoon slot',
        location: 'https://zoom.us/j/123456',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject duration under 5 minutes', async () => {
      const { appointmentCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentCreateSchema.safeParse({
        patientId: 1,
        providerId: 2,
        startTime: '2024-02-15T10:00:00Z',
        duration: 3,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject duration over 480 minutes', async () => {
      const { appointmentCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentCreateSchema.safeParse({
        patientId: 1,
        providerId: 2,
        startTime: '2024-02-15T10:00:00Z',
        duration: 500,
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('Appointment Update Schema', () => {
    it('should validate status changes', async () => {
      const { appointmentUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentUpdateSchema.safeParse({
        status: 'CONFIRMED',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept cancellation with reason', async () => {
      const { appointmentUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = appointmentUpdateSchema.safeParse({
        status: 'CANCELLED',
        cancellationReason: 'Patient requested reschedule',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept all valid appointment statuses', async () => {
      const { appointmentUpdateSchema } = await import('@/lib/validation/schemas');
      
      const validStatuses = [
        'SCHEDULED',
        'CONFIRMED',
        'CHECKED_IN',
        'IN_PROGRESS',
        'COMPLETED',
        'CANCELLED',
        'NO_SHOW',
        'RESCHEDULED',
      ];
      
      for (const status of validStatuses) {
        const result = appointmentUpdateSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });
  });
});

describe('Care Plan Validation', () => {
  describe('Care Plan Create Schema', () => {
    it('should validate care plan with required fields', async () => {
      const { carePlanCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = carePlanCreateSchema.safeParse({
        patientId: 1,
        title: 'Weight Management Care Plan',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept care plan with goals', async () => {
      const { carePlanCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = carePlanCreateSchema.safeParse({
        patientId: 1,
        title: 'Weight Loss Program',
        description: 'Comprehensive weight management with medication support',
        goals: [
          {
            title: 'Lose 10% body weight',
            description: 'Target weight loss over 6 months',
            targetValue: '10',
            unit: 'percent',
            targetDate: '2024-07-15T00:00:00Z',
          },
          {
            title: 'Improve A1C',
            description: 'Reduce A1C from 7.5 to 6.5',
            targetValue: '6.5',
            unit: 'percent',
          },
        ],
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.goals).toHaveLength(2);
      }
    });

    it('should accept provider assignment', async () => {
      const { carePlanCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = carePlanCreateSchema.safeParse({
        patientId: 1,
        providerId: 5,
        title: 'Managed Care Plan',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.providerId).toBe(5);
      }
    });
  });
});

describe('Ticket Validation', () => {
  describe('Ticket Create Schema', () => {
    it('should validate support ticket', async () => {
      const { ticketCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = ticketCreateSchema.safeParse({
        title: 'Medication question',
        description: 'Patient has question about dosing schedule',
        priority: 'MEDIUM',
        category: 'MEDICATION_QUESTION',
      });
      
      expect(result.success).toBe(true);
    });

    it('should default priority to MEDIUM', async () => {
      const { ticketCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = ticketCreateSchema.safeParse({
        title: 'General inquiry',
        description: 'Question about appointment scheduling',
        category: 'APPOINTMENT',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.priority).toBe('MEDIUM');
      }
    });

    it('should accept all valid categories', async () => {
      const { ticketCreateSchema } = await import('@/lib/validation/schemas');
      
      const validCategories = [
        'GENERAL', 'BILLING', 'PRESCRIPTION', 'APPOINTMENT',
        'TECHNICAL_ISSUE', 'MEDICATION_QUESTION', 'INSURANCE',
        'DELIVERY', 'SIDE_EFFECTS', 'DOSAGE', 'REFILL',
        'PORTAL_ACCESS', 'OTHER',
      ];
      
      for (const category of validCategories) {
        const result = ticketCreateSchema.safeParse({
          title: 'Test ticket',
          description: 'Test description',
          category,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should accept patient and order references', async () => {
      const { ticketCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = ticketCreateSchema.safeParse({
        title: 'Order delay inquiry',
        description: 'Patient asking about delayed shipment',
        category: 'DELIVERY',
        patientId: 123,
        orderId: 456,
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.patientId).toBe(123);
        expect(result.data.orderId).toBe(456);
      }
    });
  });

  describe('Ticket Update Schema', () => {
    it('should validate status changes', async () => {
      const { ticketUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = ticketUpdateSchema.safeParse({
        status: 'IN_PROGRESS',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept disposition on resolution', async () => {
      const { ticketUpdateSchema } = await import('@/lib/validation/schemas');
      
      const result = ticketUpdateSchema.safeParse({
        status: 'RESOLVED',
        disposition: 'RESOLVED_SUCCESSFULLY',
        resolutionNotes: 'Issue resolved by updating prescription timing instructions',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept all valid dispositions', async () => {
      const { ticketUpdateSchema } = await import('@/lib/validation/schemas');
      
      const validDispositions = [
        'RESOLVED_SUCCESSFULLY', 'RESOLVED_WITH_WORKAROUND', 'NOT_RESOLVED',
        'DUPLICATE', 'NOT_REPRODUCIBLE', 'BY_DESIGN', 'CUSTOMER_ERROR',
        'TRAINING_ISSUE', 'REFERRED_TO_SPECIALIST', 'PENDING_CUSTOMER', 'CANCELLED_BY_CUSTOMER',
      ];
      
      for (const disposition of validDispositions) {
        const result = ticketUpdateSchema.safeParse({ disposition });
        expect(result.success).toBe(true);
      }
    });
  });
});
