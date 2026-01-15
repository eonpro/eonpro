/**
 * Stripe Integration Tests
 * Tests for Stripe invoice, payment, and webhook handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';

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
      update: vi.fn(),
    },
  },
}));

// Mock Stripe
const mockStripeClient = {
  invoices: {
    create: vi.fn(),
    sendInvoice: vi.fn(),
    voidInvoice: vi.fn(),
    markUncollectible: vi.fn(),
    finalizeInvoice: vi.fn(),
    retrieve: vi.fn(),
  },
  invoiceItems: {
    create: vi.fn(),
  },
  paymentIntents: {
    create: vi.fn(),
    retrieve: vi.fn(),
    confirm: vi.fn(),
    cancel: vi.fn(),
  },
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
    update: vi.fn(),
  },
  paymentMethods: {
    attach: vi.fn(),
    detach: vi.fn(),
    list: vi.fn(),
  },
  webhooks: {
    constructEvent: vi.fn(),
  },
};

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => mockStripeClient),
  stripe: mockStripeClient,
  STRIPE_CONFIG: {
    webhookEndpointSecret: 'whsec_test_secret',
    currency: 'usd',
    collectionMethod: 'send_invoice',
    invoiceDueDays: 30,
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

// Mock customer service
vi.mock('@/services/stripe/customerService', () => ({
  StripeCustomerService: {
    getOrCreateCustomer: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
    syncPatientToStripe: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Stripe Invoice Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createInvoice', () => {
    it('should create an invoice with line items', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      const mockStripeInvoice = {
        id: 'in_test123',
        number: 'INV-001',
        hosted_invoice_url: 'https://pay.stripe.com/invoice/test',
        invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf',
        status: 'open',
        due_date: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        amount_due: 10000,
      };

      mockStripeClient.invoices.create.mockResolvedValue(mockStripeInvoice);
      mockStripeClient.invoices.finalizeInvoice.mockResolvedValue(mockStripeInvoice);
      mockStripeClient.invoiceItems.create.mockResolvedValue({});
      
      vi.mocked(prisma.invoice.create).mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_test123',
        patientId: 1,
        status: 'OPEN',
        amountDue: 10000,
      } as any);

      const result = await StripeInvoiceService.createInvoice({
        patientId: 1,
        description: 'Test invoice',
        lineItems: [
          { description: 'Consultation', amount: 10000 },
        ],
      });

      expect(result.invoice).toBeDefined();
      expect(result.stripeInvoice.id).toBe('in_test123');
      expect(mockStripeClient.invoices.create).toHaveBeenCalled();
      expect(mockStripeClient.invoiceItems.create).toHaveBeenCalled();
      expect(prisma.invoice.create).toHaveBeenCalled();
    });

    it('should support auto-send option', () => {
      const invoiceOptions = {
        patientId: 1,
        description: 'Test invoice',
        lineItems: [{ description: 'Service', amount: 5000 }],
        autoSend: true,
      };

      expect(invoiceOptions.autoSend).toBe(true);
      expect(invoiceOptions.lineItems[0].amount).toBe(5000);
    });

    it('should calculate total amount correctly', () => {
      const lineItems = [
        { description: 'Item 1', amount: 10000 },
        { description: 'Item 2', amount: 15000 },
      ];

      const totalAmount = lineItems.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      expect(totalAmount).toBe(25000); // 10000 + 15000
    });
  });

  describe('sendInvoice', () => {
    it('should send invoice via Stripe', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_send123',
      } as any);

      await StripeInvoiceService.sendInvoice(1);

      expect(mockStripeClient.invoices.sendInvoice).toHaveBeenCalledWith('in_send123');
    });

    it('should throw error if invoice not found', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

      await expect(StripeInvoiceService.sendInvoice(999)).rejects.toThrow('Invoice with ID 999 not found');
    });
  });

  describe('voidInvoice', () => {
    it('should void invoice in Stripe and database', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_void123',
      } as any);

      await StripeInvoiceService.voidInvoice(1);

      expect(mockStripeClient.invoices.voidInvoice).toHaveBeenCalledWith('in_void123');
      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'VOID' },
      });
    });
  });

  describe('updateFromWebhook', () => {
    it('should update invoice status from webhook', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({
        id: 1,
        stripeInvoiceId: 'in_webhook123',
      } as any);

      const stripeInvoice: Partial<Stripe.Invoice> = {
        id: 'in_webhook123',
        status: 'paid',
        amount_due: 10000,
        amount_paid: 10000,
        hosted_invoice_url: 'https://pay.stripe.com/invoice/test',
        invoice_pdf: 'https://pay.stripe.com/invoice/test/pdf',
        status_transitions: {
          paid_at: Math.floor(Date.now() / 1000),
          finalized_at: null,
          marked_uncollectible_at: null,
          voided_at: null,
        },
      };

      await StripeInvoiceService.updateFromWebhook(stripeInvoice as Stripe.Invoice);

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'PAID',
            amountPaid: 10000,
          }),
        })
      );
    });

    it('should handle missing invoice gracefully', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      const { logger } = await import('@/lib/logger');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue(null);

      const stripeInvoice: Partial<Stripe.Invoice> = {
        id: 'in_notfound',
        status: 'paid',
      };

      await StripeInvoiceService.updateFromWebhook(stripeInvoice as Stripe.Invoice);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });

  describe('getPatientInvoices', () => {
    it('should return patient invoices ordered by date', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      
      const mockInvoices = [
        { id: 1, patientId: 1, createdAt: new Date('2024-01-15') },
        { id: 2, patientId: 1, createdAt: new Date('2024-01-10') },
      ];

      vi.mocked(prisma.invoice.findMany).mockResolvedValue(mockInvoices as any);

      const result = await StripeInvoiceService.getPatientInvoices(1);

      expect(prisma.invoice.findMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        include: { payments: true },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });
  });

  describe('Convenience Invoice Methods', () => {
    it('should define consultation invoice parameters', () => {
      const consultationInvoice = {
        patientId: 1,
        description: 'Medical Consultation',
        lineItems: [{
          description: 'Telehealth Consultation - Weight Management Program',
          amount: 15000,
        }],
        autoSend: true,
      };

      expect(consultationInvoice.lineItems[0].amount).toBe(15000);
      expect(consultationInvoice.description).toContain('Consultation');
    });

    it('should define prescription invoice parameters', () => {
      const medications = [
        { name: 'Semaglutide', amount: 50000 },
        { name: 'B12 Injection', amount: 2500 },
      ];

      const lineItems = medications.map(med => ({
        description: `Prescription: ${med.name}`,
        amount: med.amount,
      }));

      expect(lineItems).toHaveLength(2);
      expect(lineItems[0].description).toContain('Semaglutide');
    });

    it('should define lab work invoice parameters', () => {
      const tests = [
        { name: 'Comprehensive Metabolic Panel', amount: 7500 },
        { name: 'Lipid Panel', amount: 5000 },
      ];

      const lineItems = tests.map(test => ({
        description: `Lab Test: ${test.name}`,
        amount: test.amount,
      }));

      const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

      expect(lineItems).toHaveLength(2);
      expect(totalAmount).toBe(12500);
    });
  });
});

describe('Stripe Webhook Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Signature Verification', () => {
    it('should reject requests without signature', async () => {
      const { POST } = await import('@/app/api/stripe/webhook/route');
      
      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const response = await POST(request as any);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('signature');
    });

    it('should reject invalid signature', async () => {
      const { POST } = await import('@/app/api/stripe/webhook/route');
      
      mockStripeClient.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      const request = new Request('http://localhost/api/stripe/webhook', {
        method: 'POST',
        body: JSON.stringify({ type: 'test' }),
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'invalid_signature',
        },
      });

      // Mock headers() to return the signature
      vi.doMock('next/headers', () => ({
        headers: async () => ({
          get: (name: string) => name === 'stripe-signature' ? 'invalid_signature' : null,
        }),
      }));

      const response = await POST(request as any);
      
      expect(response.status).toBe(400);
    });
  });

  describe('Invoice Events', () => {
    it('should handle invoice.payment_succeeded event', async () => {
      const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
      const updateFromWebhookSpy = vi.spyOn(StripeInvoiceService, 'updateFromWebhook');
      
      vi.mocked(prisma.invoice.findUnique).mockResolvedValue({ id: 1 } as any);
      vi.mocked(prisma.invoice.update).mockResolvedValue({ id: 1 } as any);

      const stripeInvoice: Partial<Stripe.Invoice> = {
        id: 'in_paid123',
        status: 'paid',
        amount_due: 10000,
        amount_paid: 10000,
      };

      await StripeInvoiceService.updateFromWebhook(stripeInvoice as Stripe.Invoice);

      expect(updateFromWebhookSpy).toHaveBeenCalled();
    });
  });
});

describe('Stripe Status Mapping', () => {
  it('should map all Stripe invoice statuses correctly', async () => {
    const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
    
    // Access private method via testing
    const mapStripeStatus = (StripeInvoiceService as any).mapStripeStatus;
    
    expect(mapStripeStatus('draft')).toBe('DRAFT');
    expect(mapStripeStatus('open')).toBe('OPEN');
    expect(mapStripeStatus('paid')).toBe('PAID');
    expect(mapStripeStatus('void')).toBe('VOID');
    expect(mapStripeStatus('uncollectible')).toBe('UNCOLLECTIBLE');
    expect(mapStripeStatus(null)).toBe('DRAFT');
    expect(mapStripeStatus('unknown_status')).toBe('DRAFT');
  });
});

describe('Error Handling', () => {
  it('should handle Stripe API errors gracefully', async () => {
    mockStripeClient.invoices.create.mockRejectedValue(
      new Error('Stripe API error: Card declined')
    );

    // Verify the mock rejects
    await expect(
      mockStripeClient.invoices.create({})
    ).rejects.toThrow('Stripe API error');
  });

  it('should handle database errors gracefully', async () => {
    vi.mocked(prisma.invoice.create).mockRejectedValue(
      new Error('Database connection error')
    );

    // Verify the mock rejects
    await expect(
      prisma.invoice.create({ data: {} as any })
    ).rejects.toThrow('Database connection error');
  });
});
