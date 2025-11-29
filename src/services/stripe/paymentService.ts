import { stripe, getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import type { PaymentStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface ProcessPaymentOptions {
  patientId: number;
  amount: number; // Amount in cents
  description?: string;
  invoiceId?: number;
  paymentMethodId?: string;
  metadata?: Record<string, string>;
}

/**
 * Service for managing Stripe payments
 */
export class StripePaymentService {
  /**
   * Create a payment intent for immediate payment
   */
  static async createPaymentIntent(options: ProcessPaymentOptions): Promise<{
    payment: any;
    clientSecret: string;
  }> {
    const stripeClient = getStripe();
    
    // Get or create Stripe customer
    const customer = await StripeCustomerService.getOrCreateCustomer(options.patientId);
    
    // Create payment intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: options.amount,
      currency: STRIPE_CONFIG.currency,
      customer: customer.id,
      description: options.description,
      payment_method: options.paymentMethodId,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        patientId: options.patientId.toString(),
        invoiceId: options.invoiceId?.toString() || '',
        ...options.metadata,
      } as any,
    });
    
    // Store payment in database
    const payment = await prisma.payment.create({
      data: {
        stripePaymentIntentId: paymentIntent.id,
        amount: options.amount,
        currency: STRIPE_CONFIG.currency,
        status: this.mapStripeStatus(paymentIntent.status),
        paymentMethod: paymentIntent.payment_method?.toString(),
        patientId: options.patientId,
        invoiceId: options.invoiceId,
        metadata: options.metadata,
      },
    });
    
    logger.debug(`[STRIPE] Created payment intent ${paymentIntent.id} for patient ${options.patientId}`);
    
    return {
      payment,
      clientSecret: paymentIntent.client_secret!,
    };
  }
  
  /**
   * Process a payment with a saved payment method
   */
  static async processPayment(options: ProcessPaymentOptions): Promise<any> {
    const stripeClient = getStripe();
    
    if (!options.paymentMethodId) {
      throw new Error('Payment method ID is required');
    }
    
    // Create payment intent
    const { payment, clientSecret } = await this.createPaymentIntent(options);
    
    // Confirm the payment
    const paymentIntent = await stripeClient.paymentIntents.confirm(
      payment.stripePaymentIntentId!,
      {
        payment_method: options.paymentMethodId,
      }
    );
    
    // Update payment status
    await this.updatePaymentFromIntent(paymentIntent);
    
    return payment;
  }
  
  /**
   * Update payment from Stripe webhook
   */
  static async updatePaymentFromIntent(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Find payment in database
    const payment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });
    
    if (!payment) {
      logger.warn(`[STRIPE] Payment intent ${paymentIntent.id} not found in database`);
      return;
    }
    
    // Update payment
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: this.mapStripeStatus(paymentIntent.status),
        stripeChargeId: paymentIntent.latest_charge?.toString(),
        paymentMethod: paymentIntent.payment_method?.toString(),
        failureReason: paymentIntent.last_payment_error?.message,
      },
    });
    
    // If payment succeeded and linked to an invoice, update invoice
    if (paymentIntent.status === 'succeeded' && payment.invoiceId) {
      await prisma.invoice.update({
        where: { id: payment.invoiceId },
        data: {
          amountPaid: {
            increment: payment.amount,
          },
          status: 'PAID',
          paidAt: new Date(),
        },
      });
    }
    
    logger.debug(`[STRIPE] Updated payment ${paymentIntent.id} from webhook`);
  }
  
  /**
   * Refund a payment
   */
  static async refundPayment(
    paymentId: number,
    amount?: number,
    reason?: string
  ): Promise<Stripe.Refund> {
    const stripeClient = getStripe();
    
    // Get payment from database
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });
    
    if (!payment) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }
    
    if (!payment.stripeChargeId) {
      throw new Error('Payment has no charge ID');
    }
    
    // Create refund in Stripe
    const refund = await stripeClient.refunds.create({
      charge: payment.stripeChargeId,
      amount: amount || payment.amount,
      reason: reason as Stripe.RefundCreateParams.Reason || 'requested_by_customer',
    });
    
    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: amount && amount < payment.amount ? 'REFUNDED' : 'REFUNDED',
      },
    });
    
    logger.debug(`[STRIPE] Refunded payment ${payment.stripePaymentIntentId}`);
    
    return refund;
  }
  
  /**
   * Get payment methods for a patient
   */
  static async getPaymentMethods(patientId: number): Promise<Stripe.PaymentMethod[]> {
    const stripeClient = getStripe();
    
    // Get or create customer
    const customer = await StripeCustomerService.getOrCreateCustomer(patientId);
    
    // List payment methods
    const paymentMethods = await stripeClient.paymentMethods.list({
      customer: customer.id,
      type: 'card',
    });
    
    return paymentMethods.data;
  }
  
  /**
   * Save a payment method for future use
   */
  static async attachPaymentMethod(
    patientId: number,
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    const stripeClient = getStripe();
    
    // Get or create customer
    const customer = await StripeCustomerService.getOrCreateCustomer(patientId);
    
    // Attach payment method to customer
    const paymentMethod = await stripeClient.paymentMethods.attach(
      paymentMethodId,
      { customer: customer.id }
    );
    
    logger.debug(`[STRIPE] Attached payment method ${paymentMethodId} to customer ${customer.id}`);
    
    return paymentMethod;
  }
  
  /**
   * Remove a payment method
   */
  static async detachPaymentMethod(
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    const stripeClient = getStripe();
    
    const paymentMethod = await stripeClient.paymentMethods.detach(paymentMethodId);
    
    logger.debug(`[STRIPE] Detached payment method ${paymentMethodId}`);
    
    return paymentMethod;
  }
  
  /**
   * Get payment history for a patient
   */
  static async getPatientPayments(patientId: number) {
    return await prisma.payment.findMany({
      where: { patientId },
      include: {
        invoice: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  
  /**
   * Map Stripe payment intent status to our enum
   */
  private static mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    switch (status) {
      case 'requires_payment_method':
      case 'requires_confirmation':
      case 'requires_action':
        return 'PENDING';
      case 'processing':
        return 'PROCESSING';
      case 'succeeded':
        return 'SUCCEEDED';
      case 'canceled':
        return 'CANCELED';
      default:
        return 'FAILED';
    }
  }
}
