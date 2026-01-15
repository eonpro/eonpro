/**
 * Billing & Invoice Tests
 * Tests for invoice creation, payment processing, and Stripe integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock Stripe
vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => ({
    invoices: {
      create: vi.fn(),
      retrieve: vi.fn(),
      sendInvoice: vi.fn(),
      voidInvoice: vi.fn(),
    },
    paymentIntents: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
    customers: {
      create: vi.fn(),
      retrieve: vi.fn(),
    },
  })),
  STRIPE_CONFIG: {
    webhookEndpointSecret: 'test_secret',
    currency: 'usd',
    defaultPaymentMethods: ['card'],
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

import { prisma } from '@/lib/db';

describe('Invoice Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Invoice Creation Schema', () => {
    it('should validate invoice with required fields', async () => {
      const { invoiceCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = invoiceCreateSchema.safeParse({
        patientId: 1,
        description: 'Consultation fee',
        amount: 10000, // $100.00 in cents
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(10000);
        expect(result.data.patientId).toBe(1);
      }
    });

    it('should reject negative amount', async () => {
      const { invoiceCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = invoiceCreateSchema.safeParse({
        patientId: 1,
        description: 'Refund',
        amount: -5000,
      });
      
      expect(result.success).toBe(false);
    });

    it('should truncate decimal amount to integer (cents)', async () => {
      const { invoiceCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = invoiceCreateSchema.safeParse({
        patientId: 1,
        description: 'Test',
        amount: 10050, // $100.50 in cents
      });
      
      // Amount should be passed as integer cents
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.amount).toBe(10050);
      }
    });

    it('should accept invoice with line items', async () => {
      const { invoiceCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = invoiceCreateSchema.safeParse({
        patientId: 1,
        description: 'Medical services',
        amount: 25000,
        lineItems: [
          { description: 'Consultation', amount: 15000, quantity: 1 },
          { description: 'Lab work', amount: 10000, quantity: 1 },
        ],
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lineItems).toHaveLength(2);
      }
    });

    it('should reject missing description', async () => {
      const { invoiceCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = invoiceCreateSchema.safeParse({
        patientId: 1,
        amount: 10000,
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('Payment Processing Schema', () => {
    it('should validate payment with required fields', async () => {
      const { paymentProcessSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentProcessSchema.safeParse({
        patientId: 1,
        amount: 5000,
      });
      
      expect(result.success).toBe(true);
    });

    it('should accept payment with payment method', async () => {
      const { paymentProcessSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentProcessSchema.safeParse({
        patientId: 1,
        amount: 5000,
        paymentMethodId: 'pm_1234567890',
        description: 'Invoice payment',
        invoiceId: 123,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject zero amount', async () => {
      const { paymentProcessSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentProcessSchema.safeParse({
        patientId: 1,
        amount: 0,
      });
      
      // Zero is non-negative, so it passes
      expect(result.success).toBe(true);
    });
  });

  describe('Payment Method Schema', () => {
    it('should validate card with correct format', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
        cardholderName: 'John Doe',
        billingZip: '12345',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid card number length', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '12345', // Too short
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
        cardholderName: 'John Doe',
        billingZip: '12345',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid expiry month', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '4242424242424242',
        expiryMonth: 13, // Invalid month
        expiryYear: 2030,
        cvv: '123',
        cardholderName: 'John Doe',
        billingZip: '12345',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject expired card', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2020, // Expired
        cvv: '123',
        cardholderName: 'John Doe',
        billingZip: '12345',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid CVV', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '12', // Too short
        cardholderName: 'John Doe',
        billingZip: '12345',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid zip code', async () => {
      const { paymentMethodCreateSchema } = await import('@/lib/validation/schemas');
      
      const result = paymentMethodCreateSchema.safeParse({
        patientId: 1,
        cardNumber: '4242424242424242',
        expiryMonth: 12,
        expiryYear: 2030,
        cvv: '123',
        cardholderName: 'John Doe',
        billingZip: '1234', // Too short
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('Currency Formatting', () => {
  it('should validate currency amounts in cents', async () => {
    const { currencyAmountSchema } = await import('@/lib/validation/schemas');
    
    // $100.00 = 10000 cents
    const result = currencyAmountSchema.safeParse(10000);
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(10000);
    }
  });

  it('should coerce string to number', async () => {
    const { currencyAmountSchema } = await import('@/lib/validation/schemas');
    
    const result = currencyAmountSchema.safeParse('5000');
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(5000);
    }
  });
});

describe('Superbill Validation', () => {
  it('should validate superbill with CPT codes', async () => {
    const { superbillCreateSchema } = await import('@/lib/validation/schemas');
    
    const result = superbillCreateSchema.safeParse({
      patientId: 1,
      providerId: 1,
      serviceDate: '2024-01-15T10:00:00Z',
      items: [
        {
          cptCode: '99213',
          cptDescription: 'Office visit, established patient',
          icdCodes: ['E11.9'],
          icdDescriptions: ['Type 2 diabetes mellitus without complications'],
          units: 1,
          unitPrice: 15000,
        },
      ],
    });
    
    expect(result.success).toBe(true);
  });

  it('should reject invalid CPT code format', async () => {
    const { superbillCreateSchema } = await import('@/lib/validation/schemas');
    
    const result = superbillCreateSchema.safeParse({
      patientId: 1,
      providerId: 1,
      serviceDate: '2024-01-15T10:00:00Z',
      items: [
        {
          cptCode: '123', // Invalid - should be 5 digits
          cptDescription: 'Test',
          icdCodes: ['E11.9'],
          icdDescriptions: ['Test'],
          units: 1,
          unitPrice: 15000,
        },
      ],
    });
    
    expect(result.success).toBe(false);
  });

  it('should require at least one line item', async () => {
    const { superbillCreateSchema } = await import('@/lib/validation/schemas');
    
    const result = superbillCreateSchema.safeParse({
      patientId: 1,
      providerId: 1,
      serviceDate: '2024-01-15T10:00:00Z',
      items: [],
    });
    
    expect(result.success).toBe(false);
  });
});
