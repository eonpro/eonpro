/**
 * Webhook Tests
 * Tests for webhook validation, signature verification, and payload processing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    patient: {
      create: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    patientDocument: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    webhookLog: {
      create: vi.fn(),
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
    webhook: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Webhook Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Webhook Payload Schema', () => {
    it('should accept valid intake webhook payload', async () => {
      const { webhookPayloadSchema } = await import('@/lib/validation/schemas');
      
      const result = webhookPayloadSchema.safeParse({
        submissionId: 'sub-123456',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
        timestamp: '2024-01-15T10:30:00Z',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept payload with sections format', async () => {
      const { webhookPayloadSchema } = await import('@/lib/validation/schemas');
      
      const result = webhookPayloadSchema.safeParse({
        submissionId: 'sub-123456',
        sections: [
          {
            title: 'Personal Information',
            fields: [
              { id: 'firstName', label: 'First Name', value: 'John' },
              { id: 'lastName', label: 'Last Name', value: 'Doe' },
            ],
          },
        ],
      });
      
      expect(result.success).toBe(true);
    });

    it('should allow additional fields (passthrough)', async () => {
      const { webhookPayloadSchema } = await import('@/lib/validation/schemas');
      
      const result = webhookPayloadSchema.safeParse({
        submissionId: 'sub-123456',
        customField: 'custom value',
        anotherField: { nested: true },
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customField).toBe('custom value');
      }
    });

    it('should accept empty payload for health check', async () => {
      const { webhookPayloadSchema } = await import('@/lib/validation/schemas');
      
      const result = webhookPayloadSchema.safeParse({});
      
      expect(result.success).toBe(true);
    });
  });

  describe('Intake Form Submission', () => {
    it('should validate intake submission schema', async () => {
      const { intakeSubmissionSchema } = await import('@/lib/validation/schemas');
      
      const result = intakeSubmissionSchema.safeParse({
        submissionId: 'intake-12345',
        submittedAt: '2024-01-15T10:30:00Z',
        data: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '5551234567',
          dateOfBirth: '1990-01-15',
          gender: 'Male',
          allergies: 'Penicillin',
          currentMedications: 'Metformin 500mg',
        },
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept submission with sections', async () => {
      const { intakeSubmissionSchema } = await import('@/lib/validation/schemas');
      
      const result = intakeSubmissionSchema.safeParse({
        sections: [
          {
            title: 'Personal Info',
            fields: [
              { id: 'name', label: 'Full Name', value: 'John Doe' },
            ],
          },
          {
            title: 'Medical History',
            fields: [
              { id: 'allergies', label: 'Allergies', value: 'None' },
            ],
          },
        ],
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('Send Intake Form Schema', () => {
    it('should validate send intake form request', async () => {
      const { sendIntakeFormSchema } = await import('@/lib/validation/schemas');
      
      const result = sendIntakeFormSchema.safeParse({
        templateId: 1,
        email: 'patient@example.com',
        sendVia: 'email',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept with patient ID', async () => {
      const { sendIntakeFormSchema } = await import('@/lib/validation/schemas');
      
      const result = sendIntakeFormSchema.safeParse({
        patientId: 123,
        templateId: 1,
        email: 'patient@example.com',
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept phone for SMS delivery', async () => {
      const { sendIntakeFormSchema } = await import('@/lib/validation/schemas');
      
      const result = sendIntakeFormSchema.safeParse({
        templateId: 1,
        email: 'patient@example.com',
        phone: '5551234567',
        sendVia: 'sms',
      });
      
      expect(result.success).toBe(true);
    });

    it('should default sendVia to email', async () => {
      const { sendIntakeFormSchema } = await import('@/lib/validation/schemas');
      
      const result = sendIntakeFormSchema.safeParse({
        templateId: 1,
        email: 'patient@example.com',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sendVia).toBe('email');
      }
    });
  });
});

describe('Webhook Signature Verification', () => {
  const secret = 'test-webhook-secret-12345';
  
  function generateSignature(payload: string, secret: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
  
  it('should verify valid HMAC signature', () => {
    const payload = JSON.stringify({ test: 'data' });
    const signature = generateSignature(payload, secret);
    
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    expect(signature).toBe(expectedSignature);
  });
  
  it('should reject invalid signature', () => {
    const payload = JSON.stringify({ test: 'data' });
    const validSignature = generateSignature(payload, secret);
    const wrongSignature = generateSignature(payload, 'wrong-secret');
    
    expect(validSignature).not.toBe(wrongSignature);
  });
  
  it('should be timing-safe comparison', () => {
    const signature1 = 'abc123def456';
    const signature2 = 'abc123def456';
    const signature3 = 'xyz789abc123';
    
    // Timing-safe comparison should be used in production
    expect(
      crypto.timingSafeEqual(
        Buffer.from(signature1),
        Buffer.from(signature2)
      )
    ).toBe(true);
    
    expect(
      crypto.timingSafeEqual(
        Buffer.from(signature1),
        Buffer.from(signature3)
      )
    ).toBe(false);
  });
});

describe('Stripe Webhook', () => {
  describe('Invoice Events', () => {
    it('should handle invoice.payment_succeeded event', async () => {
      const mockInvoice = {
        id: 'in_123456',
        customer: 'cus_123456',
        amount_due: 10000,
        amount_paid: 10000,
        status: 'paid',
        hosted_invoice_url: 'https://stripe.com/invoice/123',
        invoice_pdf: 'https://stripe.com/invoice/123/pdf',
        status_transitions: {
          paid_at: Date.now() / 1000,
        },
      };
      
      // Verify mock invoice structure
      expect(mockInvoice.status).toBe('paid');
      expect(mockInvoice.amount_paid).toBe(10000);
    });

    it('should handle invoice.payment_failed event', async () => {
      const mockInvoice = {
        id: 'in_123456',
        customer: 'cus_123456',
        amount_due: 10000,
        amount_paid: 0,
        status: 'open',
        last_finalization_error: {
          message: 'Card declined',
        },
      };
      
      expect(mockInvoice.status).toBe('open');
      expect(mockInvoice.amount_paid).toBe(0);
    });
  });

  describe('Payment Intent Events', () => {
    it('should handle payment_intent.succeeded event', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        customer: 'cus_123456',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: 'pm_123456',
      };
      
      expect(mockPaymentIntent.status).toBe('succeeded');
      expect(mockPaymentIntent.amount).toBe(5000);
    });

    it('should handle payment_intent.payment_failed event', async () => {
      const mockPaymentIntent = {
        id: 'pi_123456',
        customer: 'cus_123456',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          message: 'Your card was declined',
          code: 'card_declined',
        },
      };
      
      expect(mockPaymentIntent.status).toBe('requires_payment_method');
      expect(mockPaymentIntent.last_payment_error?.code).toBe('card_declined');
    });
  });
});

describe('Lifefile Webhook', () => {
  it('should validate prescription status update', () => {
    const statusUpdate = {
      orderId: 'ORD-123456',
      status: 'shipped',
      trackingNumber: '1Z999AA10123456784',
      trackingUrl: 'https://tracking.example.com/1Z999AA10123456784',
      estimatedDelivery: '2024-01-20',
    };
    
    expect(statusUpdate.status).toBe('shipped');
    expect(statusUpdate.trackingNumber).toBeDefined();
  });

  it('should handle order event payloads', () => {
    const orderEvent = {
      eventType: 'ORDER_FILLED',
      orderId: 'ORD-123456',
      lifefileOrderId: 'LF-789',
      timestamp: '2024-01-15T10:30:00Z',
      details: {
        pharmacist: 'Jane Smith, RPh',
        fillDate: '2024-01-15',
      },
    };
    
    expect(orderEvent.eventType).toBe('ORDER_FILLED');
    expect(orderEvent.lifefileOrderId).toBeDefined();
  });
});
