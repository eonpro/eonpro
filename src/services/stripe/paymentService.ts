import { prisma } from '@/lib/db';
import { getStripeForClinic, stripeRequestOptions, type StripeContext } from '@/lib/stripe/connect';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import { Prisma, type PaymentStatus } from '@prisma/client';
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
  private static isStripePaymentIntentUniqueConstraint(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;
    const target = (error.meta as { target?: string[] | string } | undefined)?.target;
    if (Array.isArray(target)) return target.includes('stripePaymentIntentId');
    if (typeof target === 'string') return target.includes('stripePaymentIntentId');
    return false;
  }

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
    const stripeContext =
      preResolvedStripe ?? (await this.getStripeContextForPatient(options.patientId));

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
      // Get or create Stripe customer on the clinic's Stripe account
      const customer = await StripeCustomerService.getOrCreateCustomerForContext(
        options.patientId,
        stripeContext.stripe,
        stripeRequestOptions(stripeContext)
      );

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
    // 1) Primary lookup: canonical Stripe payment intent ID
    let payment = await prisma.payment.findUnique({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    // 2) Fallback lookup: metadata.paymentId from DB-first process route
    // This recovers rows that were created as PENDING but did not yet get
    // stripePaymentIntentId due to a race/error before DB update.
    if (!payment) {
      const rawPaymentId = paymentIntent.metadata?.paymentId;
      const parsedPaymentId = rawPaymentId ? parseInt(rawPaymentId, 10) : NaN;
      if (!Number.isNaN(parsedPaymentId) && parsedPaymentId > 0) {
        const byMetadataId = await prisma.payment.findUnique({
          where: { id: parsedPaymentId },
        });
        if (byMetadataId) {
          payment = byMetadataId;
          logger.info('[STRIPE] Recovered payment via metadata.paymentId fallback', {
            stripePaymentIntentId: paymentIntent.id,
            paymentId: byMetadataId.id,
          });
        }
      }
    }

    if (!payment) {
      logger.warn(`[STRIPE] Payment intent ${paymentIntent.id} not found in database`);
      return;
    }

    const newStatus = this.mapStripeStatus(paymentIntent.status);
    const wasAlreadySucceeded = payment.status === 'SUCCEEDED';

    // Directional guard: never regress from a terminal/authoritative status.
    // The process route sets FAILED synchronously on decline; a late-arriving
    // webhook for the same PI must not overwrite it back to PENDING/PROCESSING.
    const TERMINAL_STATUSES: PaymentStatus[] = [
      'SUCCEEDED',
      'FAILED',
      'REFUNDED',
      'PARTIALLY_REFUNDED',
      'CANCELED',
    ];
    const isTerminal = TERMINAL_STATUSES.includes(payment.status as PaymentStatus);
    const newIsTerminal = TERMINAL_STATUSES.includes(newStatus);

    if (isTerminal && !newIsTerminal) {
      logger.info(
        `[STRIPE] Skipping webhook status update for payment ${payment.id}: would regress ${payment.status} → ${newStatus}`,
        {
          stripePaymentIntentId: paymentIntent.id,
          currentStatus: payment.status,
          webhookStatus: newStatus,
          stripeStatus: paymentIntent.status,
        }
      );
      // Still link the stripePaymentIntentId if missing
      if (!payment.stripePaymentIntentId) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { stripePaymentIntentId: paymentIntent.id },
        });
      }
      return;
    }

    // Never overwrite SUCCEEDED unless the new status is also terminal (e.g. refund)
    if (
      wasAlreadySucceeded &&
      newStatus !== 'SUCCEEDED' &&
      newStatus !== 'REFUNDED' &&
      newStatus !== 'PARTIALLY_REFUNDED'
    ) {
      logger.info(
        `[STRIPE] Skipping webhook status update for payment ${payment.id}: would overwrite SUCCEEDED → ${newStatus}`,
        { stripePaymentIntentId: paymentIntent.id }
      );
      return;
    }

    // Wrap payment and invoice updates in a transaction for atomicity
    try {
      await prisma.$transaction(
        async (tx) => {
          // Update payment
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: newStatus,
              stripePaymentIntentId: payment.stripePaymentIntentId ?? paymentIntent.id,
              stripeChargeId: paymentIntent.latest_charge?.toString(),
              paymentMethod: paymentIntent.payment_method?.toString(),
              failureReason: paymentIntent.last_payment_error?.message,
            },
          });

          // Only increment amountPaid when payment is TRANSITIONING to succeeded,
          // not when it was already created as SUCCEEDED (e.g. by paymentMatchingService).
          // This prevents double-counting when processStripePayment() already sets
          // amountPaid on the invoice and then this method is called from the webhook.
          if (paymentIntent.status === 'succeeded' && payment.invoiceId && !wasAlreadySucceeded) {
            // Safety: read current invoice to prevent amountPaid from exceeding amount
            const currentInvoice = await tx.invoice.findUnique({
              where: { id: payment.invoiceId },
              select: { amount: true, amountPaid: true },
            });

            if (currentInvoice && currentInvoice.amountPaid < (currentInvoice.amount ?? Infinity)) {
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
            } else {
              logger.warn(
                `[STRIPE] Skipping amountPaid increment for ${paymentIntent.id} — invoice already fully paid`,
                {
                  paymentId: payment.id,
                  invoiceId: payment.invoiceId,
                  invoiceAmount: currentInvoice?.amount,
                  invoiceAmountPaid: currentInvoice?.amountPaid,
                  paymentAmount: payment.amount,
                }
              );
            }
          } else if (
            paymentIntent.status === 'succeeded' &&
            payment.invoiceId &&
            wasAlreadySucceeded
          ) {
            logger.debug(
              `[STRIPE] Skipping amountPaid increment for ${paymentIntent.id} - payment already SUCCEEDED (idempotent guard)`
            );
          }
        },
        { timeout: 15000 }
      );
    } catch (error: unknown) {
      // If another row already owns this Stripe intent, mark this fallback row failed.
      if (this.isStripePaymentIntentUniqueConstraint(error)) {
        const canonical = await prisma.payment.findUnique({
          where: { stripePaymentIntentId: paymentIntent.id },
          select: { id: true, status: true },
        });
        if (canonical && canonical.id !== payment.id) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: 'FAILED',
              failureReason: `Duplicate Stripe PaymentIntent recorded as payment ${canonical.id}`,
            },
          });
          logger.warn(
            '[STRIPE] Duplicate payment intent race in webhook update; canonical payment preserved',
            {
              stripePaymentIntentId: paymentIntent.id,
              supersededPaymentId: payment.id,
              canonicalPaymentId: canonical.id,
            }
          );
          return;
        }
      }
      throw error;
    }

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

    const customer = await StripeCustomerService.getOrCreateCustomerForContext(
      patientId,
      stripeContext.stripe,
      stripeRequestOptions(stripeContext)
    );

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

    const customer = await StripeCustomerService.getOrCreateCustomerForContext(
      patientId,
      stripeContext.stripe,
      stripeRequestOptions(stripeContext)
    );

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
      {},
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
   * Map Stripe payment intent status to our enum.
   *
   * `requires_payment_method` means the card was declined (insufficient funds,
   * expired, etc.) — this must map to FAILED so webhooks don't regress a
   * correctly-FAILED payment back to PENDING.
   *
   * `requires_confirmation` / `requires_action` are genuine pre-charge states
   * that occur before the first confirm attempt (3DS, redirect).
   */
  private static mapStripeStatus(status: Stripe.PaymentIntent.Status): PaymentStatus {
    switch (status) {
      case 'requires_payment_method':
        return 'FAILED';
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
