import { prisma } from '@/lib/db';
import { getStripeForClinic, stripeRequestOptions, type StripeContext } from '@/lib/stripe/connect';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import type { PaymentStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';
import crypto from 'crypto';

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
 *
 * ENTERPRISE: All payment operations follow DB-first pattern to prevent
 * orphaned Stripe charges and ensure data consistency.
 */
export class StripePaymentService {
  private static async getStripeContextForPatient(patientId: number): Promise<StripeContext> {
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { clinicId: true },
    });
    if (!patient) {
      throw new Error(`Patient with ID ${patientId} not found`);
    }
    return getStripeForClinic(patient.clinicId);
  }

  /**
   * Create a payment intent for immediate payment
   *
   * SECURITY: Uses idempotency keys and DB-first pattern
   * 1. Create DB record with PENDING status
   * 2. Call Stripe API with idempotency key
   * 3. Update DB with Stripe ID
   */
  static async createPaymentIntent(
    options: ProcessPaymentOptions,
    preResolvedStripe?: StripeContext
  ): Promise<{
    payment: any;
    clientSecret: string;
  }> {
    const stripeContext = preResolvedStripe ?? (await this.getStripeContextForPatient(options.patientId));

    // ENTERPRISE: Generate idempotency key for deduplication
    // SOC 2 Compliance: Use crypto.randomUUID() to prevent collision under high concurrency
    const idempotencyKey = `pi_${options.patientId}_${options.invoiceId || 'no_invoice'}_${crypto.randomUUID()}`;

    // 1. Create DB record FIRST (pending status)
    const payment = await prisma.payment.create({
      data: {
        amount: options.amount,
        currency: 'usd',
        status: 'PENDING',
        patientId: options.patientId,
        invoiceId: options.invoiceId,
        metadata: {
          ...options.metadata,
          idempotencyKey,
        },
      },
    });

    logger.info(
      `[STRIPE] Created pending payment record ${payment.id} for patient ${options.patientId}`
    );

    try {
      // Get or create Stripe customer
      const customer = await StripeCustomerService.getOrCreateCustomer(options.patientId);

      // 2. Create payment intent in Stripe with idempotency key
      // SOC 2 Compliance: Wrapped with circuit breaker for availability
      const paymentIntent = await circuitBreakers.stripe.execute(() =>
        stripeContext.stripe.paymentIntents.create(
          {
            amount: options.amount,
            currency: 'usd',
            customer: customer.id,
            description: options.description,
            payment_method: options.paymentMethodId,
            automatic_payment_methods: {
              enabled: true,
            },
            metadata: {
              paymentId: payment.id.toString(),
              patientId: options.patientId.toString(),
              invoiceId: options.invoiceId?.toString() || '',
              idempotencyKey,
              ...options.metadata,
            } as any,
          },
          {
            idempotencyKey, // Stripe idempotency for duplicate prevention
            ...(stripeRequestOptions(stripeContext) ?? {}),
          }
        )
      );

      // 3. Update DB record with Stripe payment intent ID
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          status: this.mapStripeStatus(paymentIntent.status),
          paymentMethod: paymentIntent.payment_method?.toString(),
        },
      });

      logger.info(
        `[STRIPE] Created payment intent ${paymentIntent.id} for patient ${options.patientId}`,
        {
          paymentId: payment.id,
          stripePaymentIntentId: paymentIntent.id,
        }
      );

      return {
        payment: updatedPayment,
        clientSecret: paymentIntent.client_secret!,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown Stripe error';

      // ENTERPRISE: Mark payment as failed, don't lose tracking
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: 'FAILED',
          failureReason: `Stripe API error: ${errorMessage}`,
        },
      });

      logger.error(`[STRIPE] Payment intent creation failed for payment ${payment.id}`, {
        paymentId: payment.id,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Process a payment with a saved payment method
   */
  static async processPayment(options: ProcessPaymentOptions): Promise<any> {
    if (!options.paymentMethodId) {
      throw new Error('Payment method ID is required');
    }

    const stripeContext = await this.getStripeContextForPatient(options.patientId);

    // Create payment intent
    const { payment } = await this.createPaymentIntent(options, stripeContext);

    // Confirm the payment
    const paymentIntent = await stripeContext.stripe.paymentIntents.confirm(
      payment.stripePaymentIntentId!,
      {
        payment_method: options.paymentMethodId,
      },
      stripeRequestOptions(stripeContext)
    );

    // Update payment status
    await this.updatePaymentFromIntent(paymentIntent);

    return payment;
  }

  /**
   * Update payment from Stripe webhook
   * Uses a transaction to ensure payment and invoice updates are atomic
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

    const newStatus = this.mapStripeStatus(paymentIntent.status);
    const wasAlreadySucceeded = payment.status === 'SUCCEEDED';

    // Wrap payment and invoice updates in a transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Update payment
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
          stripeChargeId: paymentIntent.latest_charge?.toString(),
          paymentMethod: paymentIntent.payment_method?.toString(),
          failureReason: paymentIntent.last_payment_error?.message,
        },
      });

      // Only increment amountPaid when payment is TRANSITIONING to succeeded,
      // not when it was already created as SUCCEEDED (e.g. by paymentMatchingService).
      // This prevents double-counting when processStripePayment() already sets
      // amountPaid on the invoice and then this method is called from the webhook.
      if (
        paymentIntent.status === 'succeeded' &&
        payment.invoiceId &&
        !wasAlreadySucceeded
      ) {
        await tx.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: {
              increment: payment.amount,
            },
            status: 'PAID',
            paidAt: new Date(),
          },
        });
      } else if (paymentIntent.status === 'succeeded' && payment.invoiceId && wasAlreadySucceeded) {
        logger.debug(`[STRIPE] Skipping amountPaid increment for ${paymentIntent.id} - payment already SUCCEEDED (idempotent guard)`);
      }
    }, { timeout: 15000 });

    logger.debug(`[STRIPE] Updated payment ${paymentIntent.id} from webhook`);
  }

  /**
   * Refund a payment
   *
   * ENTERPRISE: Uses DB-first pattern and tracks refund before processing
   */
  static async refundPayment(
    paymentId: number,
    amount?: number,
    reason?: string
  ): Promise<Stripe.Refund> {
    // Get payment from database
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { patient: { select: { clinicId: true } } },
    });

    if (!payment) {
      throw new Error(`Payment with ID ${paymentId} not found`);
    }

    if (!payment.stripePaymentIntentId && !payment.stripeChargeId) {
      throw new Error('Payment has no Stripe ID for refund');
    }

    const clinicId = payment.clinicId ?? payment.patient?.clinicId;
    if (clinicId == null) {
      throw new Error(
        'Cannot resolve clinic for this payment; refund requires a linked clinic on the payment or patient.'
      );
    }

    const stripeContext = await getStripeForClinic(clinicId);

    const refundAmount = amount || payment.amount;
    const isPartialRefund = refundAmount < payment.amount;

    // 1. Track refund intent BEFORE processing
    logger.info(`[STRIPE] Initiating refund for payment ${paymentId}`, {
      paymentId,
      stripePaymentIntentId: payment.stripePaymentIntentId,
      amount: refundAmount,
      isPartialRefund,
    });

    // Mark payment as refund in progress
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'PROCESSING',
        metadata: {
          ...((payment.metadata as object) || {}),
          refundInitiatedAt: new Date().toISOString(),
          refundAmount,
          refundReason: reason,
        },
      },
    });

    try {
      // 2. Create refund in Stripe
      const refund = await stripeContext.stripe.refunds.create(
        {
          payment_intent: payment.stripePaymentIntentId || undefined,
          charge: payment.stripeChargeId || undefined,
          amount: refundAmount,
          reason: (reason as Stripe.RefundCreateParams.Reason) || 'requested_by_customer',
          metadata: {
            paymentId: paymentId.toString(),
            originalAmount: payment.amount.toString(),
          },
        },
        stripeRequestOptions(stripeContext)
      );

      // 3. Update payment status after successful refund
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: isPartialRefund ? 'PARTIALLY_REFUNDED' : 'REFUNDED',
          metadata: {
            ...((payment.metadata as object) || {}),
            stripeRefundId: refund.id,
            refundCompletedAt: new Date().toISOString(),
            refundAmount,
          },
        },
      });

      logger.info(`[STRIPE] Refund completed for payment ${paymentId}`, {
        paymentId,
        stripeRefundId: refund.id,
        amount: refundAmount,
      });

      return refund;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown refund error';

      // ENTERPRISE: Mark as failed but don't lose tracking
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'SUCCEEDED', // Revert to original status
          failureReason: `Refund failed: ${errorMessage}`,
          metadata: {
            ...((payment.metadata as object) || {}),
            refundFailedAt: new Date().toISOString(),
            refundError: errorMessage,
          },
        },
      });

      logger.error(`[STRIPE] Refund failed for payment ${paymentId}`, {
        paymentId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Get payment methods for a patient
   */
  static async getPaymentMethods(patientId: number): Promise<Stripe.PaymentMethod[]> {
    const stripeContext = await this.getStripeContextForPatient(patientId);

    // Get or create customer
    const customer = await StripeCustomerService.getOrCreateCustomer(patientId);

    // List payment methods
    const paymentMethods = await stripeContext.stripe.paymentMethods.list(
      {
        customer: customer.id,
        type: 'card',
      },
      stripeRequestOptions(stripeContext)
    );

    return paymentMethods.data;
  }

  /**
   * Save a payment method for future use
   */
  static async attachPaymentMethod(
    patientId: number,
    paymentMethodId: string
  ): Promise<Stripe.PaymentMethod> {
    const stripeContext = await this.getStripeContextForPatient(patientId);

    // Get or create customer
    const customer = await StripeCustomerService.getOrCreateCustomer(patientId);

    // Attach payment method to customer
    const paymentMethod = await stripeContext.stripe.paymentMethods.attach(
      paymentMethodId,
      {
        customer: customer.id,
      },
      stripeRequestOptions(stripeContext)
    );

    logger.debug(`[STRIPE] Attached payment method ${paymentMethodId} to customer ${customer.id}`);

    return paymentMethod;
  }

  /**
   * Remove a payment method
   */
  static async detachPaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    const row = await prisma.paymentMethod.findFirst({
      where: { stripePaymentMethodId: paymentMethodId },
      select: {
        clinicId: true,
        patient: { select: { clinicId: true } },
      },
    });
    const clinicId = row?.clinicId ?? row?.patient?.clinicId;
    if (clinicId == null) {
      throw new Error(
        'Cannot resolve clinic for this payment method; it must be linked to a saved patient payment method in this system.'
      );
    }

    const stripeContext = await getStripeForClinic(clinicId);

    const paymentMethod = await stripeContext.stripe.paymentMethods.detach(
      paymentMethodId,
      stripeRequestOptions(stripeContext)
    );

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
