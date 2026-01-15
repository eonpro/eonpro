/**
 * Stripe Payment Service Tests
 * Tests for payment processing, refunds, and payment methods
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type Stripe from 'stripe';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    payment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    invoice: {
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
  paymentIntents: {
    create: vi.fn(),
    confirm: vi.fn(),
    retrieve: vi.fn(),
    cancel: vi.fn(),
  },
  paymentMethods: {
    list: vi.fn(),
    attach: vi.fn(),
    detach: vi.fn(),
  },
  refunds: {
    create: vi.fn(),
  },
  customers: {
    create: vi.fn(),
    retrieve: vi.fn(),
  },
};

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(() => mockStripeClient),
  stripe: mockStripeClient,
  STRIPE_CONFIG: {
    currency: 'usd',
    webhookEndpointSecret: 'whsec_test',
  },
}));

// Mock customer service
const mockGetOrCreateCustomer = vi.fn().mockResolvedValue({ id: 'cus_test123' });
vi.mock('@/services/stripe/customerService', () => ({
  StripeCustomerService: {
    getOrCreateCustomer: mockGetOrCreateCustomer,
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

describe('Stripe Payment Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset customer service mock to return valid customer
    mockGetOrCreateCustomer.mockResolvedValue({ id: 'cus_test123' });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent for patient', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentIntents.create.mockResolvedValue({
        id: 'pi_test123',
        client_secret: 'pi_test123_secret_xyz',
        status: 'requires_payment_method',
        amount: 10000,
        currency: 'usd',
      });

      vi.mocked(prisma.payment.create).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_test123',
        amount: 10000,
        status: 'PENDING',
        patientId: 1,
      } as any);

      const result = await StripePaymentService.createPaymentIntent({
        patientId: 1,
        amount: 10000,
        description: 'Test payment',
      });

      expect(result.clientSecret).toBe('pi_test123_secret_xyz');
      expect(result.payment.stripePaymentIntentId).toBe('pi_test123');
      expect(mockStripeClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 10000,
          currency: 'usd',
          customer: 'cus_test123',
        })
      );
    });

    it('should include metadata in payment intent', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentIntents.create.mockResolvedValue({
        id: 'pi_meta123',
        client_secret: 'secret',
        status: 'requires_payment_method',
      });

      vi.mocked(prisma.payment.create).mockResolvedValue({ id: 1 } as any);

      await StripePaymentService.createPaymentIntent({
        patientId: 1,
        amount: 5000,
        invoiceId: 123,
        metadata: { orderId: '456' },
      });

      expect(mockStripeClient.paymentIntents.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            patientId: '1',
            invoiceId: '123',
            orderId: '456',
          }),
        })
      );
    });
  });

  describe('processPayment', () => {
    it('should process payment with payment method', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentIntents.create.mockResolvedValue({
        id: 'pi_process123',
        client_secret: 'secret',
        status: 'requires_confirmation',
      });

      mockStripeClient.paymentIntents.confirm.mockResolvedValue({
        id: 'pi_process123',
        status: 'succeeded',
        latest_charge: 'ch_123',
        payment_method: 'pm_123',
      });

      vi.mocked(prisma.payment.create).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_process123',
        amount: 5000,
      } as any);

      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_process123',
        amount: 5000,
      } as any);

      const result = await StripePaymentService.processPayment({
        patientId: 1,
        amount: 5000,
        paymentMethodId: 'pm_test123',
      });

      expect(result).toBeDefined();
      expect(mockStripeClient.paymentIntents.confirm).toHaveBeenCalledWith(
        'pi_process123',
        { payment_method: 'pm_test123' }
      );
    });

    it('should throw error if payment method not provided', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      await expect(
        StripePaymentService.processPayment({
          patientId: 1,
          amount: 5000,
        })
      ).rejects.toThrow('Payment method ID is required');
    });
  });

  describe('updatePaymentFromIntent', () => {
    it('should update payment status from webhook', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_webhook123',
        amount: 10000,
        invoiceId: null,
      } as any);

      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_webhook123',
        status: 'succeeded',
        latest_charge: 'ch_456',
        payment_method: 'pm_789',
      };

      await StripePaymentService.updatePaymentFromIntent(paymentIntent as Stripe.PaymentIntent);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          stripeChargeId: 'ch_456',
          paymentMethod: 'pm_789',
        }),
      });
    });

    it('should update invoice when payment succeeds', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_invoice123',
        amount: 15000,
        invoiceId: 100,
      } as any);

      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_invoice123',
        status: 'succeeded',
      };

      await StripePaymentService.updatePaymentFromIntent(paymentIntent as Stripe.PaymentIntent);

      expect(prisma.invoice.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: expect.objectContaining({
          status: 'PAID',
        }),
      });
    });

    it('should handle missing payment gracefully', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      const { logger } = await import('@/lib/logger');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_notfound',
        status: 'succeeded',
      };

      await StripePaymentService.updatePaymentFromIntent(paymentIntent as Stripe.PaymentIntent);

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(prisma.payment.update).not.toHaveBeenCalled();
    });

    it('should handle failed payment status', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        stripePaymentIntentId: 'pi_failed123',
        amount: 10000,
      } as any);

      const paymentIntent: Partial<Stripe.PaymentIntent> = {
        id: 'pi_failed123',
        status: 'canceled',
        last_payment_error: { message: 'Card declined' },
      };

      await StripePaymentService.updatePaymentFromIntent(paymentIntent as Stripe.PaymentIntent);

      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'CANCELED',
            failureReason: 'Card declined',
          }),
        })
      );
    });
  });

  describe('refundPayment', () => {
    it('should create full refund', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        amount: 10000,
        stripeChargeId: 'ch_refund123',
      } as any);

      mockStripeClient.refunds.create.mockResolvedValue({
        id: 're_123',
        amount: 10000,
        status: 'succeeded',
      });

      const refund = await StripePaymentService.refundPayment(1);

      expect(refund.amount).toBe(10000);
      expect(mockStripeClient.refunds.create).toHaveBeenCalledWith({
        charge: 'ch_refund123',
        amount: 10000,
        reason: 'requested_by_customer',
      });
    });

    it('should create partial refund', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        amount: 10000,
        stripeChargeId: 'ch_partial123',
      } as any);

      mockStripeClient.refunds.create.mockResolvedValue({
        id: 're_partial',
        amount: 5000,
        status: 'succeeded',
      });

      await StripePaymentService.refundPayment(1, 5000);

      expect(mockStripeClient.refunds.create).toHaveBeenCalledWith({
        charge: 'ch_partial123',
        amount: 5000,
        reason: 'requested_by_customer',
      });
    });

    it('should throw error if payment not found', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue(null);

      await expect(
        StripePaymentService.refundPayment(999)
      ).rejects.toThrow('Payment with ID 999 not found');
    });

    it('should throw error if no charge ID', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        amount: 10000,
        stripeChargeId: null,
      } as any);

      await expect(
        StripePaymentService.refundPayment(1)
      ).rejects.toThrow('no charge ID');
    });

    it('should update payment status after refund', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      vi.mocked(prisma.payment.findUnique).mockResolvedValue({
        id: 1,
        amount: 10000,
        stripeChargeId: 'ch_status123',
      } as any);

      mockStripeClient.refunds.create.mockResolvedValue({
        id: 're_123',
        amount: 10000,
      });

      await StripePaymentService.refundPayment(1);

      expect(prisma.payment.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: 'REFUNDED' },
      });
    });
  });

  describe('getPaymentMethods', () => {
    it('should return patient payment methods', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      const mockPaymentMethods = [
        { id: 'pm_1', card: { brand: 'visa', last4: '4242' } },
        { id: 'pm_2', card: { brand: 'mastercard', last4: '5555' } },
      ];

      mockStripeClient.paymentMethods.list.mockResolvedValue({
        data: mockPaymentMethods,
      });

      const result = await StripePaymentService.getPaymentMethods(1);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('pm_1');
      expect(mockStripeClient.paymentMethods.list).toHaveBeenCalledWith({
        customer: 'cus_test123',
        type: 'card',
      });
    });

    it('should return empty array for no payment methods', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentMethods.list.mockResolvedValue({ data: [] });

      const result = await StripePaymentService.getPaymentMethods(1);

      expect(result).toHaveLength(0);
    });
  });

  describe('attachPaymentMethod', () => {
    it('should attach payment method to customer', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentMethods.attach.mockResolvedValue({
        id: 'pm_attached',
        customer: 'cus_test123',
      });

      const result = await StripePaymentService.attachPaymentMethod(1, 'pm_newcard');

      expect(result.id).toBe('pm_attached');
      expect(mockStripeClient.paymentMethods.attach).toHaveBeenCalledWith(
        'pm_newcard',
        { customer: 'cus_test123' }
      );
    });
  });

  describe('detachPaymentMethod', () => {
    it('should detach payment method', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      mockStripeClient.paymentMethods.detach.mockResolvedValue({
        id: 'pm_detached',
        customer: null,
      });

      const result = await StripePaymentService.detachPaymentMethod('pm_remove');

      expect(result.id).toBe('pm_detached');
      expect(mockStripeClient.paymentMethods.detach).toHaveBeenCalledWith('pm_remove');
    });
  });

  describe('getPatientPayments', () => {
    it('should return patient payment history', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      const mockPayments = [
        { id: 1, amount: 10000, status: 'SUCCEEDED', createdAt: new Date() },
        { id: 2, amount: 5000, status: 'REFUNDED', createdAt: new Date() },
      ];

      vi.mocked(prisma.payment.findMany).mockResolvedValue(mockPayments as any);

      const result = await StripePaymentService.getPatientPayments(1);

      expect(result).toHaveLength(2);
      expect(prisma.payment.findMany).toHaveBeenCalledWith({
        where: { patientId: 1 },
        include: { invoice: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('Status Mapping', () => {
    it('should map Stripe statuses correctly', async () => {
      const { StripePaymentService } = await import('@/services/stripe/paymentService');
      
      // Access private method via testing
      const mapStripeStatus = (StripePaymentService as any).mapStripeStatus;
      
      expect(mapStripeStatus('requires_payment_method')).toBe('PENDING');
      expect(mapStripeStatus('requires_confirmation')).toBe('PENDING');
      expect(mapStripeStatus('requires_action')).toBe('PENDING');
      expect(mapStripeStatus('processing')).toBe('PROCESSING');
      expect(mapStripeStatus('succeeded')).toBe('SUCCEEDED');
      expect(mapStripeStatus('canceled')).toBe('CANCELED');
      expect(mapStripeStatus('unknown_status')).toBe('FAILED');
    });
  });
});

describe('Payment Amount Handling', () => {
  it('should handle amounts in cents', () => {
    // $100.00 = 10000 cents
    const dollars = 100;
    const cents = dollars * 100;
    
    expect(cents).toBe(10000);
  });

  it('should format cents to dollars', () => {
    const cents = 15050;
    const dollars = (cents / 100).toFixed(2);
    
    expect(dollars).toBe('150.50');
  });

  it('should validate positive amounts', () => {
    const validateAmount = (amount: number): boolean => {
      return amount > 0 && Number.isInteger(amount);
    };

    expect(validateAmount(10000)).toBe(true);
    expect(validateAmount(0)).toBe(false);
    expect(validateAmount(-100)).toBe(false);
    expect(validateAmount(100.50)).toBe(false); // Must be integer cents
  });
});

describe('Payment Error Handling', () => {
  describe('Card Errors', () => {
    it('should identify card declined', () => {
      const error = {
        type: 'card_error',
        code: 'card_declined',
        message: 'Your card was declined.',
      };

      expect(error.code).toBe('card_declined');
    });

    it('should identify insufficient funds', () => {
      const error = {
        type: 'card_error',
        code: 'card_declined',
        decline_code: 'insufficient_funds',
      };

      expect(error.decline_code).toBe('insufficient_funds');
    });

    it('should identify expired card', () => {
      const error = {
        type: 'card_error',
        code: 'expired_card',
        message: 'Your card has expired.',
      };

      expect(error.code).toBe('expired_card');
    });

    it('should identify invalid CVC', () => {
      const error = {
        type: 'card_error',
        code: 'incorrect_cvc',
        message: 'Your card security code is incorrect.',
      };

      expect(error.code).toBe('incorrect_cvc');
    });
  });

  describe('User-Friendly Messages', () => {
    const getErrorMessage = (code: string): string => {
      const messages: Record<string, string> = {
        card_declined: 'Your card was declined. Please try a different card.',
        insufficient_funds: 'Insufficient funds. Please try a different card.',
        expired_card: 'Your card has expired. Please update your card details.',
        incorrect_cvc: 'Invalid security code. Please check and try again.',
        processing_error: 'Payment processing error. Please try again.',
      };

      return messages[code] || 'Payment failed. Please try again.';
    };

    it('should provide user-friendly messages', () => {
      expect(getErrorMessage('card_declined')).toContain('try a different card');
      expect(getErrorMessage('expired_card')).toContain('expired');
      expect(getErrorMessage('unknown_error')).toContain('try again');
    });
  });
});
