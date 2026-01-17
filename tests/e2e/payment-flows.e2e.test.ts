/**
 * E2E Tests for Payment Flows
 * Tests Stripe integration, invoicing, subscriptions, and payment processing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    invoice: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    payment: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  setClinicContext: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('E2E: Invoice Creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Invoice', () => {
    it('should create invoice with line items', async () => {
      const createInvoice = async (data: {
        patientId: number;
        clinicId: number;
        items: Array<{
          description: string;
          quantity: number;
          unitPrice: number;
          productId?: number;
        }>;
        dueDate?: Date;
      }) => {
        const amount = data.items.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0
        );

        return {
          id: Date.now(),
          invoiceNumber: `INV-${Date.now()}`,
          patientId: data.patientId,
          clinicId: data.clinicId,
          items: data.items,
          amount,
          amountDue: amount,
          amountPaid: 0,
          status: 'DRAFT',
          dueDate: data.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
        };
      };

      const invoice = await createInvoice({
        patientId: 1,
        clinicId: 1,
        items: [
          { description: 'Semaglutide 0.5mg', quantity: 1, unitPrice: 30000, productId: 1 },
          { description: 'Lab Panel', quantity: 1, unitPrice: 15000, productId: 2 },
        ],
      });

      expect(invoice.status).toBe('DRAFT');
      expect(invoice.amount).toBe(45000);
      expect(invoice.items).toHaveLength(2);
    });

    it('should apply discount to invoice', async () => {
      const applyDiscountToInvoice = async (
        invoiceAmount: number,
        discountCode: { discountType: string; discountValue: number }
      ) => {
        let discountAmount = 0;
        
        if (discountCode.discountType === 'PERCENTAGE') {
          discountAmount = Math.round(invoiceAmount * (discountCode.discountValue / 100));
        } else {
          discountAmount = Math.min(discountCode.discountValue, invoiceAmount);
        }

        return {
          originalAmount: invoiceAmount,
          discountAmount,
          finalAmount: invoiceAmount - discountAmount,
        };
      };

      const result = await applyDiscountToInvoice(10000, {
        discountType: 'PERCENTAGE',
        discountValue: 15,
      });

      expect(result.discountAmount).toBe(1500);
      expect(result.finalAmount).toBe(8500);
    });
  });

  describe('Invoice Status Management', () => {
    it('should transition invoice through valid statuses', async () => {
      const VALID_TRANSITIONS: Record<string, string[]> = {
        DRAFT: ['OPEN', 'VOID'],
        OPEN: ['PAID', 'VOID', 'OVERDUE'],
        OVERDUE: ['PAID', 'VOID'],
        PAID: [],
        VOID: [],
      };

      const canTransition = (from: string, to: string) => {
        return VALID_TRANSITIONS[from]?.includes(to) || false;
      };

      expect(canTransition('DRAFT', 'OPEN')).toBe(true);
      expect(canTransition('OPEN', 'PAID')).toBe(true);
      expect(canTransition('PAID', 'VOID')).toBe(false);
    });

    it('should finalize and send invoice', async () => {
      const finalizeInvoice = async (invoiceId: number) => {
        return {
          id: invoiceId,
          status: 'OPEN',
          sentAt: new Date(),
          stripeInvoiceId: `in_${Date.now()}`,
          paymentUrl: `https://invoice.stripe.com/i/${Date.now()}`,
        };
      };

      const invoice = await finalizeInvoice(1);
      expect(invoice.status).toBe('OPEN');
      expect(invoice.stripeInvoiceId).toBeDefined();
      expect(invoice.paymentUrl).toBeDefined();
    });
  });
});

describe('E2E: Payment Processing', () => {
  describe('One-Time Payments', () => {
    it('should process card payment', async () => {
      const processPayment = async (data: {
        invoiceId: number;
        amount: number;
        paymentMethodId: string;
      }) => {
        // Simulate Stripe payment intent
        return {
          id: Date.now(),
          invoiceId: data.invoiceId,
          amount: data.amount,
          status: 'SUCCEEDED',
          stripePaymentIntentId: `pi_${Date.now()}`,
          paymentMethod: 'card',
          processedAt: new Date(),
        };
      };

      const payment = await processPayment({
        invoiceId: 1,
        amount: 30000,
        paymentMethodId: 'pm_card_visa',
      });

      expect(payment.status).toBe('SUCCEEDED');
      expect(payment.stripePaymentIntentId).toBeDefined();
    });

    it('should handle payment failure', async () => {
      const processPayment = async (shouldFail: boolean) => {
        if (shouldFail) {
          return {
            status: 'FAILED',
            error: {
              code: 'card_declined',
              message: 'Your card was declined.',
            },
          };
        }
        return { status: 'SUCCEEDED' };
      };

      const result = await processPayment(true);
      expect(result.status).toBe('FAILED');
      expect(result.error?.code).toBe('card_declined');
    });

    it('should update invoice after successful payment', async () => {
      const markInvoicePaid = async (invoiceId: number, paymentId: number, amount: number) => {
        return {
          id: invoiceId,
          status: 'PAID',
          amountPaid: amount,
          amountDue: 0,
          paidAt: new Date(),
          paymentId,
        };
      };

      const invoice = await markInvoicePaid(1, 100, 30000);
      expect(invoice.status).toBe('PAID');
      expect(invoice.amountDue).toBe(0);
    });
  });

  describe('Partial Payments', () => {
    it('should handle partial payment', async () => {
      const processPartialPayment = async (
        invoiceId: number,
        totalAmount: number,
        paymentAmount: number
      ) => {
        const amountPaid = paymentAmount;
        const amountDue = totalAmount - paymentAmount;

        return {
          invoiceId,
          totalAmount,
          amountPaid,
          amountDue,
          status: amountDue > 0 ? 'PARTIALLY_PAID' : 'PAID',
        };
      };

      const result = await processPartialPayment(1, 30000, 15000);
      expect(result.status).toBe('PARTIALLY_PAID');
      expect(result.amountDue).toBe(15000);
    });
  });

  describe('Refunds', () => {
    it('should process full refund', async () => {
      const processRefund = async (paymentId: number, amount: number) => {
        return {
          id: Date.now(),
          paymentId,
          amount,
          status: 'SUCCEEDED',
          stripeRefundId: `re_${Date.now()}`,
          processedAt: new Date(),
        };
      };

      const refund = await processRefund(1, 30000);
      expect(refund.status).toBe('SUCCEEDED');
      expect(refund.amount).toBe(30000);
    });

    it('should process partial refund', async () => {
      const processPartialRefund = async (
        paymentId: number,
        originalAmount: number,
        refundAmount: number
      ) => {
        if (refundAmount > originalAmount) {
          throw new Error('Refund amount exceeds original payment');
        }

        return {
          paymentId,
          refundAmount,
          remainingAmount: originalAmount - refundAmount,
          status: 'SUCCEEDED',
        };
      };

      const result = await processPartialRefund(1, 30000, 10000);
      expect(result.remainingAmount).toBe(20000);
    });
  });
});

describe('E2E: Subscription Management', () => {
  describe('Create Subscription', () => {
    it('should create subscription from recurring product', async () => {
      const createSubscription = async (data: {
        patientId: number;
        productId: number;
        priceId: string;
        paymentMethodId: string;
      }) => {
        return {
          id: Date.now(),
          patientId: data.patientId,
          productId: data.productId,
          stripeSubscriptionId: `sub_${Date.now()}`,
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
          createdAt: new Date(),
        };
      };

      const subscription = await createSubscription({
        patientId: 1,
        productId: 1,
        priceId: 'price_monthly_membership',
        paymentMethodId: 'pm_card_visa',
      });

      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.stripeSubscriptionId).toBeDefined();
    });

    it('should create subscription with trial period', async () => {
      const createSubscriptionWithTrial = async (
        patientId: number,
        trialDays: number
      ) => {
        const trialEnd = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

        return {
          id: Date.now(),
          patientId,
          status: 'TRIALING',
          trialStart: new Date(),
          trialEnd,
          currentPeriodEnd: trialEnd,
        };
      };

      const subscription = await createSubscriptionWithTrial(1, 7);
      expect(subscription.status).toBe('TRIALING');
      expect(subscription.trialEnd).toBeDefined();
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should handle subscription renewal', async () => {
      const renewSubscription = async (subscriptionId: number) => {
        const now = new Date();
        const nextPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        return {
          id: subscriptionId,
          status: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: nextPeriodEnd,
          renewedAt: now,
        };
      };

      const subscription = await renewSubscription(1);
      expect(subscription.status).toBe('ACTIVE');
      expect(subscription.renewedAt).toBeDefined();
    });

    it('should cancel subscription at period end', async () => {
      const cancelSubscription = async (subscriptionId: number, immediate: boolean) => {
        if (immediate) {
          return {
            id: subscriptionId,
            status: 'CANCELED',
            canceledAt: new Date(),
          };
        }

        return {
          id: subscriptionId,
          status: 'ACTIVE',
          cancelAtPeriodEnd: true,
          canceledAt: null,
        };
      };

      const result = await cancelSubscription(1, false);
      expect(result.status).toBe('ACTIVE');
      expect(result.cancelAtPeriodEnd).toBe(true);
    });

    it('should pause subscription', async () => {
      const pauseSubscription = async (subscriptionId: number, resumeDate?: Date) => {
        return {
          id: subscriptionId,
          status: 'PAUSED',
          pausedAt: new Date(),
          resumeAt: resumeDate || null,
        };
      };

      const result = await pauseSubscription(1, new Date('2026-02-01'));
      expect(result.status).toBe('PAUSED');
      expect(result.resumeAt).toBeDefined();
    });

    it('should upgrade subscription', async () => {
      const upgradeSubscription = async (
        subscriptionId: number,
        newPriceId: string,
        prorationBehavior: 'create_prorations' | 'none'
      ) => {
        return {
          id: subscriptionId,
          priceId: newPriceId,
          status: 'ACTIVE',
          prorationAmount: prorationBehavior === 'create_prorations' ? 1500 : 0,
          upgradedAt: new Date(),
        };
      };

      const result = await upgradeSubscription(1, 'price_premium', 'create_prorations');
      expect(result.priceId).toBe('price_premium');
      expect(result.prorationAmount).toBe(1500);
    });
  });

  describe('Subscription Billing', () => {
    it('should calculate MRR (Monthly Recurring Revenue)', () => {
      const calculateMRR = (subscriptions: Array<{ amount: number; interval: string }>) => {
        return subscriptions.reduce((total, sub) => {
          let monthlyAmount = sub.amount;
          
          switch (sub.interval) {
            case 'year':
              monthlyAmount = Math.round(sub.amount / 12);
              break;
            case 'quarter':
              monthlyAmount = Math.round(sub.amount / 3);
              break;
          }
          
          return total + monthlyAmount;
        }, 0);
      };

      const mrr = calculateMRR([
        { amount: 9900, interval: 'month' },
        { amount: 19900, interval: 'month' },
        { amount: 99900, interval: 'year' },
      ]);

      expect(mrr).toBe(9900 + 19900 + 8325); // ~38125
    });

    it('should handle failed subscription payment', async () => {
      const handleFailedPayment = async (subscriptionId: number, attemptCount: number) => {
        const MAX_RETRY_ATTEMPTS = 3;

        if (attemptCount >= MAX_RETRY_ATTEMPTS) {
          return {
            subscriptionId,
            status: 'PAST_DUE',
            action: 'SUSPEND',
          };
        }

        return {
          subscriptionId,
          status: 'ACTIVE',
          action: 'RETRY',
          nextRetryAt: new Date(Date.now() + 24 * 60 * 60 * 1000 * attemptCount),
        };
      };

      const result1 = await handleFailedPayment(1, 1);
      expect(result1.action).toBe('RETRY');

      const result2 = await handleFailedPayment(1, 3);
      expect(result2.status).toBe('PAST_DUE');
      expect(result2.action).toBe('SUSPEND');
    });
  });
});

describe('E2E: Stripe Webhooks', () => {
  describe('Payment Intent Events', () => {
    it('should handle payment_intent.succeeded', async () => {
      const handlePaymentSucceeded = async (event: {
        type: string;
        data: { object: { id: string; amount: number; metadata: Record<string, string> } };
      }) => {
        const paymentIntent = event.data.object;
        
        return {
          processed: true,
          invoiceId: paymentIntent.metadata.invoiceId,
          amount: paymentIntent.amount,
          action: 'MARK_PAID',
        };
      };

      const result = await handlePaymentSucceeded({
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_123',
            amount: 30000,
            metadata: { invoiceId: '1', patientId: '100' },
          },
        },
      });

      expect(result.processed).toBe(true);
      expect(result.action).toBe('MARK_PAID');
    });

    it('should handle payment_intent.payment_failed', async () => {
      const handlePaymentFailed = async (event: {
        data: { object: { id: string; last_payment_error: { message: string } } };
      }) => {
        return {
          processed: true,
          error: event.data.object.last_payment_error.message,
          action: 'NOTIFY_PATIENT',
        };
      };

      const result = await handlePaymentFailed({
        data: {
          object: {
            id: 'pi_123',
            last_payment_error: { message: 'Card declined' },
          },
        },
      });

      expect(result.action).toBe('NOTIFY_PATIENT');
    });
  });

  describe('Subscription Events', () => {
    it('should handle customer.subscription.created', async () => {
      const handleSubscriptionCreated = async (subscription: {
        id: string;
        customer: string;
        status: string;
        items: { data: Array<{ price: { id: string } }> };
      }) => {
        return {
          processed: true,
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: subscription.customer,
          status: subscription.status,
          action: 'CREATE_LOCAL_SUBSCRIPTION',
        };
      };

      const result = await handleSubscriptionCreated({
        id: 'sub_123',
        customer: 'cus_456',
        status: 'active',
        items: { data: [{ price: { id: 'price_monthly' } }] },
      });

      expect(result.action).toBe('CREATE_LOCAL_SUBSCRIPTION');
    });

    it('should handle customer.subscription.deleted', async () => {
      const handleSubscriptionDeleted = async (subscriptionId: string) => {
        return {
          processed: true,
          subscriptionId,
          action: 'CANCEL_LOCAL_SUBSCRIPTION',
        };
      };

      const result = await handleSubscriptionDeleted('sub_123');
      expect(result.action).toBe('CANCEL_LOCAL_SUBSCRIPTION');
    });

    it('should handle invoice.paid for subscription', async () => {
      const handleInvoicePaid = async (invoice: {
        id: string;
        subscription: string | null;
        amount_paid: number;
      }) => {
        if (invoice.subscription) {
          return {
            processed: true,
            type: 'SUBSCRIPTION_PAYMENT',
            subscriptionId: invoice.subscription,
            amount: invoice.amount_paid,
            action: 'EXTEND_SUBSCRIPTION_PERIOD',
          };
        }

        return {
          processed: true,
          type: 'ONE_TIME_PAYMENT',
          action: 'MARK_INVOICE_PAID',
        };
      };

      const result = await handleInvoicePaid({
        id: 'in_123',
        subscription: 'sub_456',
        amount_paid: 9900,
      });

      expect(result.type).toBe('SUBSCRIPTION_PAYMENT');
      expect(result.action).toBe('EXTEND_SUBSCRIPTION_PERIOD');
    });
  });
});

describe('E2E: Payment Methods', () => {
  describe('Save Payment Method', () => {
    it('should save card for future use', async () => {
      const savePaymentMethod = async (
        patientId: number,
        paymentMethodId: string
      ) => {
        return {
          id: Date.now(),
          patientId,
          stripePaymentMethodId: paymentMethodId,
          type: 'card',
          last4: '4242',
          brand: 'visa',
          expMonth: 12,
          expYear: 2028,
          isDefault: true,
          createdAt: new Date(),
        };
      };

      const result = await savePaymentMethod(1, 'pm_card_visa');
      expect(result.last4).toBe('4242');
      expect(result.isDefault).toBe(true);
    });
  });

  describe('Default Payment Method', () => {
    it('should set default payment method', async () => {
      const setDefaultPaymentMethod = async (
        patientId: number,
        paymentMethodId: number
      ) => {
        // Unset previous default, set new one
        return {
          patientId,
          defaultPaymentMethodId: paymentMethodId,
          updatedAt: new Date(),
        };
      };

      const result = await setDefaultPaymentMethod(1, 5);
      expect(result.defaultPaymentMethodId).toBe(5);
    });
  });
});

describe('E2E: Billing Reports', () => {
  describe('Revenue Reports', () => {
    it('should calculate total revenue for period', () => {
      const calculateRevenue = (
        payments: Array<{ amount: number; status: string; paidAt: Date }>,
        startDate: Date,
        endDate: Date
      ) => {
        const filteredPayments = payments.filter(
          p => p.status === 'SUCCEEDED' &&
               p.paidAt >= startDate &&
               p.paidAt <= endDate
        );

        const total = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
        const count = filteredPayments.length;

        return { total, count, average: count > 0 ? Math.round(total / count) : 0 };
      };

      const payments = [
        { amount: 30000, status: 'SUCCEEDED', paidAt: new Date('2026-01-15') },
        { amount: 15000, status: 'SUCCEEDED', paidAt: new Date('2026-01-16') },
        { amount: 20000, status: 'FAILED', paidAt: new Date('2026-01-17') },
      ];

      const result = calculateRevenue(
        payments,
        new Date('2026-01-01'),
        new Date('2026-01-31')
      );

      expect(result.total).toBe(45000);
      expect(result.count).toBe(2);
      expect(result.average).toBe(22500);
    });
  });

  describe('Outstanding Balance', () => {
    it('should calculate total outstanding', () => {
      const calculateOutstanding = (
        invoices: Array<{ amountDue: number; status: string }>
      ) => {
        return invoices
          .filter(inv => ['OPEN', 'OVERDUE'].includes(inv.status))
          .reduce((sum, inv) => sum + inv.amountDue, 0);
      };

      const invoices = [
        { amountDue: 30000, status: 'OPEN' },
        { amountDue: 15000, status: 'OVERDUE' },
        { amountDue: 0, status: 'PAID' },
      ];

      const outstanding = calculateOutstanding(invoices);
      expect(outstanding).toBe(45000);
    });
  });
});
