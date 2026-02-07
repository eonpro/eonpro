/**
 * Stripe Webhook Handler
 * ======================
 * 
 * CRITICAL PATH: Payment → Invoice → Prescription
 * 
 * This webhook MUST be bulletproof:
 * 1. NEVER return 500 to Stripe (causes unnecessary retries)
 * 2. ALWAYS log payment events for audit trail
 * 3. Queue failures to DLQ for manual review
 * 4. Alert on any failures
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import type Stripe from 'stripe';
import { logger } from '@/lib/logger';

// Critical payment event types that trigger prescriptions
const CRITICAL_PAYMENT_EVENTS = [
  'payment_intent.succeeded',
  'charge.succeeded',
  'checkout.session.completed',
  'invoice.payment_succeeded',
];

// Events that can trigger commission reversals
const REVERSAL_EVENTS = [
  'charge.refunded',
  'charge.dispute.created',
  'payment_intent.canceled',
];

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let eventId: string | null = null;
  let eventType: string | null = null;

  try {
    // Dynamic imports to avoid build-time errors
    const { getStripe, STRIPE_CONFIG } = await import('@/lib/stripe');
    const { StripeInvoiceService } = await import('@/services/stripe/invoiceService');
    const { StripePaymentService } = await import('@/services/stripe/paymentService');
    const {
      processStripePayment,
      extractPaymentDataFromCharge,
      extractPaymentDataFromPaymentIntent,
      extractPaymentDataFromCheckoutSession,
    } = await import('@/services/stripe/paymentMatchingService');
    
    // Import affiliate commission service
    const {
      processPaymentForCommission,
      reverseCommissionForRefund,
      checkIfFirstPayment,
    } = await import('@/services/affiliate/affiliateCommissionService');
    
    // Import refill queue service for payment auto-matching
    const { autoMatchPendingRefillsForPatient } = await import('@/services/refill/refillQueueService');

    const stripeClient = getStripe();
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      logger.error('[STRIPE WEBHOOK] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
      event = stripeClient.webhooks.constructEvent(
        body,
        signature,
        STRIPE_CONFIG.webhookEndpointSecret
      );
    } catch (error: any) {
      logger.error('[STRIPE WEBHOOK] Signature verification failed:', error);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    eventId = event.id;
    eventType = event.type;

    logger.info(`[STRIPE WEBHOOK] Received event`, {
      eventId,
      eventType,
      livemode: event.livemode,
    });

    // Process the event with comprehensive error handling
    const result = await processWebhookEvent(event, {
      StripeInvoiceService,
      StripePaymentService,
      processStripePayment,
      extractPaymentDataFromCharge,
      extractPaymentDataFromPaymentIntent,
      extractPaymentDataFromCheckoutSession,
      processPaymentForCommission,
      reverseCommissionForRefund,
      checkIfFirstPayment,
      autoMatchPendingRefillsForPatient,
    });

    const duration = Date.now() - startTime;

    if (result.success) {
      logger.info(`[STRIPE WEBHOOK] Event processed successfully`, {
        eventId,
        eventType,
        duration,
        ...result.details,
      });
    } else {
      // Log failure but DON'T return 500 - queue for retry instead
      logger.error(`[STRIPE WEBHOOK] Event processing failed - queued for retry`, {
        eventId,
        eventType,
        error: result.error,
        duration,
      });

      // Queue to DLQ for manual review/retry
      await queueFailedEvent(event, result.error || 'Unknown error', body);

      // Alert if this is a critical payment event
      if (CRITICAL_PAYMENT_EVENTS.includes(eventType)) {
        await alertPaymentFailure(event, result.error || 'Unknown error');
      }
    }

    // ALWAYS return 200 to Stripe - we've logged and queued any failures
    return NextResponse.json({
      received: true,
      eventId,
      processed: result.success,
      duration,
    });

  } catch (error) {
    // Catastrophic error - still try to log and return 200
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[STRIPE WEBHOOK] Catastrophic error', {
      eventId,
      eventType,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    // Try to queue even catastrophic failures
    try {
      const body = await request.clone().text();
      await queueFailedEvent(
        { id: eventId || 'unknown', type: eventType || 'unknown' } as Pick<Stripe.Event, 'id' | 'type'>,
        `CATASTROPHIC: ${errorMessage}`,
        body
      );
    } catch (queueError) {
      logger.error('[STRIPE WEBHOOK] Failed to queue catastrophic error', queueError);
    }

    // Still return 200 - we've done our best to log/queue
    return NextResponse.json({
      received: true,
      error: 'Processing failed - queued for retry',
    });
  }
}

// ============================================================================
// Event Processing
// ============================================================================

interface ProcessingServices {
  StripeInvoiceService: any;
  StripePaymentService: any;
  processStripePayment: any;
  extractPaymentDataFromCharge: any;
  extractPaymentDataFromPaymentIntent: any;
  extractPaymentDataFromCheckoutSession: any;
  processPaymentForCommission?: any;
  reverseCommissionForRefund?: any;
  checkIfFirstPayment?: any;
  autoMatchPendingRefillsForPatient?: any;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

async function processWebhookEvent(
  event: Stripe.Event,
  services: ProcessingServices
): Promise<ProcessingResult> {
  const {
    StripeInvoiceService,
    StripePaymentService,
    processStripePayment,
    extractPaymentDataFromCharge,
    extractPaymentDataFromPaymentIntent,
    extractPaymentDataFromCheckoutSession,
    processPaymentForCommission,
    reverseCommissionForRefund,
    checkIfFirstPayment,
    autoMatchPendingRefillsForPatient,
  } = services;

  try {
    switch (event.type) {
      // ================================================================
      // Invoice Events
      // ================================================================
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.marked_uncollectible':
      case 'invoice.voided':
      case 'invoice.finalized':
      case 'invoice.sent': {
        const invoice = event.data.object as Stripe.Invoice;
        await StripeInvoiceService.updateFromWebhook(invoice);
        return {
          success: true,
          details: { invoiceId: invoice.id, status: invoice.status },
        };
      }

      // ================================================================
      // Payment Intent Events - CRITICAL for prescriptions
      // ================================================================
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const piInvoice = (paymentIntent as Stripe.PaymentIntent & { invoice?: string | null }).invoice;

        // Skip if this is an invoice payment (handled by invoice.payment_succeeded)
        if (piInvoice) {
          return {
            success: true,
            details: { skipped: true, reason: 'Has associated invoice' },
          };
        }

        const intentPaymentData = extractPaymentDataFromPaymentIntent(paymentIntent);
        const result = await processStripePayment(intentPaymentData, event.id, event.type);

        // Also update payment record
        try {
          await StripePaymentService.updatePaymentFromIntent(paymentIntent);
        } catch (e) {
          logger.warn('[STRIPE WEBHOOK] Failed to update payment record', {
            error: e instanceof Error ? e.message : 'Unknown error',
          });
        }

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Payment processing failed',
            details: {
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount,
            },
          };
        }

        // Process affiliate commission if patient was matched
        let commissionResult = null;
        if (result.patient?.id && result.patient?.clinicId && processPaymentForCommission) {
          try {
            const isFirstPayment = checkIfFirstPayment 
              ? await checkIfFirstPayment(result.patient.id, paymentIntent.id)
              : true;
            
            commissionResult = await processPaymentForCommission({
              clinicId: result.patient.clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: paymentIntent.id,
              stripeEventType: event.type,
              amountCents: paymentIntent.amount,
              occurredAt: new Date(paymentIntent.created * 1000),
              isFirstPayment,
            });
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to process affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        // Auto-match pending refills for this patient
        let refillsMatched: number[] = [];
        if (result.patient?.id && result.patient?.clinicId && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              result.patient.clinicId,
              paymentIntent.id,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to auto-match refills', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        return {
          success: true,
          details: {
            paymentIntentId: paymentIntent.id,
            patientId: result.patient?.id,
            invoiceId: result.invoice?.id,
            patientCreated: result.patientCreated,
            matchedBy: result.matchResult.matchedBy,
            commissionCreated: commissionResult?.commissionEventId ? true : false,
            refillsMatched: refillsMatched.length,
          },
        };
      }

      case 'payment_intent.payment_failed':
      case 'payment_intent.canceled':
      case 'payment_intent.processing': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await StripePaymentService.updatePaymentFromIntent(paymentIntent);
        return {
          success: true,
          details: { paymentIntentId: paymentIntent.id, status: paymentIntent.status },
        };
      }

      // ================================================================
      // Charge Events - CRITICAL for prescriptions
      // ================================================================
      case 'charge.succeeded': {
        const charge = event.data.object as Stripe.Charge;
        const chargeInvoice = (charge as Stripe.Charge & { invoice?: string | null }).invoice;

        // Skip if linked to payment intent or invoice
        if (charge.payment_intent || chargeInvoice) {
          return {
            success: true,
            details: { skipped: true, reason: 'Has payment_intent or invoice' },
          };
        }

        const chargePaymentData = extractPaymentDataFromCharge(charge);
        const result = await processStripePayment(chargePaymentData, event.id, event.type);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Charge processing failed',
            details: { chargeId: charge.id, amount: charge.amount },
          };
        }

        // Auto-match pending refills for this patient
        let refillsMatched: number[] = [];
        if (result.patient?.id && result.patient?.clinicId && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              result.patient.clinicId,
              charge.id,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to auto-match refills', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        return {
          success: true,
          details: {
            chargeId: charge.id,
            patientId: result.patient?.id,
            invoiceId: result.invoice?.id,
            patientCreated: result.patientCreated,
            matchedBy: result.matchResult.matchedBy,
            refillsMatched: refillsMatched.length,
          },
        };
      }

      case 'charge.failed': {
        const charge = event.data.object as Stripe.Charge;
        logger.info('[STRIPE WEBHOOK] Charge failed', {
          chargeId: charge.id,
          failureCode: charge.failure_code,
          failureMessage: charge.failure_message,
        });
        return { success: true, details: { chargeId: charge.id } };
      }

      // ================================================================
      // Refund/Chargeback Events - Commission Reversal
      // ================================================================
      case 'charge.refunded':
      case 'charge.dispute.created': {
        // Handle both Charge (refunded) and Dispute (created) objects
        const eventObject = event.data.object as Stripe.Charge | Stripe.Dispute;
        const chargeId = 'charge' in eventObject && typeof eventObject.charge === 'string'
          ? eventObject.charge
          : eventObject.id;
        
        logger.info('[STRIPE WEBHOOK] Processing refund/dispute for commission reversal', {
          eventType: event.type,
          chargeId,
        });

        // Reverse commission if applicable
        if (reverseCommissionForRefund) {
          try {
            // Get clinic ID from metadata or lookup
            const { prisma } = await import('@/lib/db');
            const payment = await prisma.payment.findFirst({
              where: { stripeChargeId: chargeId },
              select: { clinicId: true }
            });

            if (payment?.clinicId) {
              const amountCents = 'amount' in eventObject ? eventObject.amount : 0;
              await reverseCommissionForRefund({
                clinicId: payment.clinicId,
                stripeEventId: event.id,
                stripeObjectId: chargeId,
                stripeEventType: event.type,
                amountCents,
                occurredAt: new Date(),
                reason: event.type === 'charge.dispute.created' ? 'chargeback' : 'refund',
              });
            }
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to reverse commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              chargeId,
            });
          }
        }

        return { success: true, details: { chargeId, eventType: event.type } };
      }

      // ================================================================
      // Checkout Session Events - CRITICAL for prescriptions
      // ================================================================
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Skip if not paid or has invoice
        if (session.payment_status !== 'paid' || session.invoice) {
          return {
            success: true,
            details: {
              skipped: true,
              reason: session.payment_status !== 'paid' ? 'Not paid' : 'Has invoice',
            },
          };
        }

        const sessionPaymentData = extractPaymentDataFromCheckoutSession(session);
        const result = await processStripePayment(sessionPaymentData, event.id, event.type);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Checkout processing failed',
            details: { sessionId: session.id, amount: session.amount_total },
          };
        }

        // Process affiliate commission if patient was matched
        let commissionResult = null;
        if (result.patient?.id && result.patient?.clinicId && processPaymentForCommission) {
          try {
            const isFirstPayment = checkIfFirstPayment 
              ? await checkIfFirstPayment(result.patient.id)
              : true;
            
            commissionResult = await processPaymentForCommission({
              clinicId: result.patient.clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: session.id,
              stripeEventType: event.type,
              amountCents: session.amount_total || 0,
              occurredAt: new Date(session.created * 1000),
              isFirstPayment,
            });
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to process affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        // Auto-match pending refills for this patient
        let refillsMatched: number[] = [];
        if (result.patient?.id && result.patient?.clinicId && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              result.patient.clinicId,
              session.payment_intent as string || undefined,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to auto-match refills', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        return {
          success: true,
          details: {
            sessionId: session.id,
            patientId: result.patient?.id,
            invoiceId: result.invoice?.id,
            patientCreated: result.patientCreated,
            matchedBy: result.matchResult.matchedBy,
            commissionCreated: commissionResult?.commissionEventId ? true : false,
            refillsMatched: refillsMatched.length,
          },
        };
      }

      // ================================================================
      // Subscription Events - sync to local Subscription for MRR/ARR
      // ================================================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const { syncSubscriptionFromStripe } = await import('@/services/stripe/subscriptionSyncService');
        const result = await syncSubscriptionFromStripe(subscription, event.id);
        if (!result.success) {
          return {
            success: false,
            error: result.error ?? 'Subscription sync failed',
            details: { stripeSubscriptionId: subscription.id, subscriptionId: result.subscriptionId },
          };
        }
        return {
          success: true,
          details: {
            stripeSubscriptionId: subscription.id,
            subscriptionId: result.subscriptionId,
            skipped: result.skipped,
            reason: result.reason,
          },
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const { cancelSubscriptionFromStripe } = await import('@/services/stripe/subscriptionSyncService');
        const canceledAt = subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : new Date();
        const result = await cancelSubscriptionFromStripe(subscription.id, canceledAt);
        if (!result.success) {
          return {
            success: false,
            error: result.error ?? 'Subscription cancel sync failed',
            details: { stripeSubscriptionId: subscription.id },
          };
        }
        return {
          success: true,
          details: {
            stripeSubscriptionId: subscription.id,
            subscriptionId: result.subscriptionId,
            skipped: result.skipped,
          },
        };
      }

      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
      case 'customer.subscription.trial_will_end': {
        // Paused/resumed: re-sync to update status; trial_will_end: no DB change, just for notifications
        if (event.type === 'customer.subscription.paused' || event.type === 'customer.subscription.resumed') {
          const subscription = event.data.object as Stripe.Subscription;
          const { syncSubscriptionFromStripe } = await import('@/services/stripe/subscriptionSyncService');
          const result = await syncSubscriptionFromStripe(subscription, event.id);
          if (!result.success) {
            return {
              success: false,
              error: result.error ?? 'Subscription sync failed',
              details: { stripeSubscriptionId: subscription.id },
            };
          }
        }
        return { success: true, details: { eventType: event.type } };
      }

      // ================================================================
      // Customer Events
      // ================================================================
      case 'customer.created':
      case 'customer.updated': {
        const customer = event.data.object as Stripe.Customer;
        return { success: true, details: { customerId: customer.id } };
      }

      default:
        return { success: true, details: { skipped: true, reason: 'Unhandled event type' } };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      details: { eventType: event.type },
    };
  }
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

async function queueFailedEvent(
  event: Stripe.Event | { id: string; type: string },
  error: string,
  rawBody: string
): Promise<void> {
  try {
    const { prisma } = await import('@/lib/db');

    // Store in WebhookLog table as failed event
    await prisma.webhookLog.create({
      data: {
        source: 'stripe',
        eventId: event.id,
        eventType: event.type,
        status: 'FAILED',
        errorMessage: error,
        payload: rawBody ? JSON.parse(rawBody) : null,
        retryCount: 0,
        processedAt: null,
        metadata: {
          queuedAt: new Date().toISOString(),
          requiresManualReview: true,
        },
      },
    });

    logger.info('[STRIPE WEBHOOK] Failed event queued to DLQ', {
      eventId: event.id,
      eventType: event.type,
      error,
    });
  } catch (queueError) {
    // Last resort - log to console/monitoring
    logger.error('[STRIPE WEBHOOK] CRITICAL: Failed to queue to DLQ', {
      eventId: event.id,
      eventType: event.type,
      originalError: error,
      queueError: queueError instanceof Error ? queueError.message : 'Unknown',
    });
  }
}

// ============================================================================
// Alerting
// ============================================================================

async function alertPaymentFailure(
  event: Stripe.Event,
  error: string
): Promise<void> {
  // Extract payment-related data from various Stripe event object types
  const paymentData = event.data.object;
  
  // Helper to safely extract amount from different Stripe object types
  const getAmount = (): number | undefined => {
    if ('amount' in paymentData) return paymentData.amount as number;
    if ('amount_total' in paymentData) return paymentData.amount_total as number;
    return undefined;
  };
  
  // Helper to safely extract email from different Stripe object types
  const getEmail = (): string | undefined => {
    if ('billing_details' in paymentData && paymentData.billing_details?.email) {
      return paymentData.billing_details.email;
    }
    if ('customer_details' in paymentData && paymentData.customer_details?.email) {
      return paymentData.customer_details.email;
    }
    if ('receipt_email' in paymentData) return paymentData.receipt_email as string | undefined;
    return undefined;
  };

  const alertPayload = {
    severity: 'CRITICAL',
    title: 'Payment Processing Failed',
    message: `Failed to process ${event.type} - patient may not receive prescription`,
    eventId: event.id,
    eventType: event.type,
    amount: getAmount(),
    customerEmail: getEmail(),
    error,
    timestamp: new Date().toISOString(),
    actionRequired: 'Manual review required in Admin > Payment Reconciliation',
  };

  // Log with CRITICAL level
  logger.error('[PAYMENT ALERT] CRITICAL: Payment processing failure', alertPayload);

  // Optional: Send to external alerting service (Slack, PagerDuty, etc.)
  try {
    const alertWebhookUrl = process.env.PAYMENT_ALERT_WEBHOOK_URL;
    if (alertWebhookUrl) {
      await fetch(alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alertPayload),
      });
    }
  } catch (alertError) {
    logger.error('[STRIPE WEBHOOK] Failed to send alert', alertError);
  }
}
