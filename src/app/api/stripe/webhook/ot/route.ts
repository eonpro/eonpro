/**
 * Stripe Webhook Handler for OT (Overtime) Clinic
 * ================================================
 *
 * Dedicated webhook endpoint for OT's own Stripe account (ot.eonpro.io)
 *
 * CRITICAL PATH: Payment → Patient Match → Invoice → Affiliate Commission
 *
 * This webhook:
 * 1. Uses OT_STRIPE_WEBHOOK_SECRET for signature verification
 * 2. Routes payments to OT's clinic for patient matching
 * 3. Triggers affiliate conversion credits when applicable
 *
 * Configure in OT's Stripe Dashboard:
 * Webhook URL: https://app.eonpro.io/api/stripe/webhook/ot
 * Events: payment_intent.succeeded, charge.succeeded, checkout.session.completed, etc.
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { OT_STRIPE_CONFIG } from '@/lib/stripe/config';

// OT clinic subdomain for identification
const OT_SUBDOMAIN = 'ot';

// Critical payment event types that trigger patient matching and commissions
const CRITICAL_PAYMENT_EVENTS = [
  'payment_intent.succeeded',
  'charge.succeeded',
  'checkout.session.completed',
  'invoice.payment_succeeded',
];

// Events that can trigger commission reversals
const REVERSAL_EVENTS = ['charge.refunded', 'charge.dispute.created', 'payment_intent.canceled'];

/**
 * Get or create the OT Stripe client
 */
let otStripeClient: Stripe | null = null;

function getOTStripe(): Stripe {
  if (!otStripeClient) {
    const secretKey = OT_STRIPE_CONFIG.secretKey;
    if (!secretKey) {
      throw new Error('OT_STRIPE_SECRET_KEY not configured');
    }
    otStripeClient = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
      maxNetworkRetries: 3,
    });
  }
  return otStripeClient;
}

/**
 * Get the OT clinic ID from the database
 */
async function getOTClinicId(): Promise<number> {
  const clinic = await prisma.clinic.findFirst({
    where: { subdomain: OT_SUBDOMAIN },
    select: { id: true },
  });

  if (!clinic) {
    throw new Error(`OT clinic not found (subdomain: ${OT_SUBDOMAIN})`);
  }

  return clinic.id;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let eventId: string | null = null;
  let eventType: string | null = null;

  try {
    // Verify OT Stripe is configured
    if (!OT_STRIPE_CONFIG.isConfigured()) {
      logger.error('[OT STRIPE WEBHOOK] OT Stripe not configured');
      return NextResponse.json({ error: 'OT Stripe not configured' }, { status: 500 });
    }

    const webhookSecret = OT_STRIPE_CONFIG.webhookSecret;
    if (!webhookSecret) {
      logger.error('[OT STRIPE WEBHOOK] Webhook secret not configured');
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 });
    }

    const stripeClient = getOTStripe();
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      logger.error('[OT STRIPE WEBHOOK] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // Verify webhook signature using OT's webhook secret
    let event: Stripe.Event;

    try {
      event = stripeClient.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (error: any) {
      logger.error('[OT STRIPE WEBHOOK] Signature verification failed:', {
        error: error.message,
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    eventId = event.id;
    eventType = event.type;

    logger.info('[OT STRIPE WEBHOOK] Received event', {
      eventId,
      eventType,
      livemode: event.livemode,
    });

    // Get OT clinic ID for payment processing
    const clinicId = await getOTClinicId();

    // Dynamic imports to avoid build-time errors
    const {
      processStripePayment,
      extractPaymentDataFromCharge,
      extractPaymentDataFromPaymentIntent,
      extractPaymentDataFromCheckoutSession,
    } = await import('@/services/stripe/paymentMatchingService');

    const { processPaymentForCommission, reverseCommissionForRefund, checkIfFirstPayment } =
      await import('@/services/affiliate/affiliateCommissionService');

    const { autoMatchPendingRefillsForPatient } =
      await import('@/services/refill/refillQueueService');

    // Process the event
    const result = await processOTWebhookEvent(event, clinicId, {
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
      logger.info('[OT STRIPE WEBHOOK] Event processed successfully', {
        eventId,
        eventType,
        clinicId,
        duration,
        ...result.details,
      });
    } else {
      logger.error('[OT STRIPE WEBHOOK] Event processing failed', {
        eventId,
        eventType,
        clinicId,
        error: result.error,
        duration,
      });

      // Queue to DLQ for manual review
      await queueFailedEvent(event, result.error || 'Unknown error', body, clinicId);

      // Alert if this is a critical payment event
      if (CRITICAL_PAYMENT_EVENTS.includes(eventType)) {
        await alertPaymentFailure(event, result.error || 'Unknown error', clinicId);
      }
    }

    // ALWAYS return 200 to Stripe - we've logged and queued any failures
    return NextResponse.json({
      received: true,
      eventId,
      clinic: 'ot',
      processed: result.success,
      duration,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[OT STRIPE WEBHOOK] Catastrophic error', {
      eventId,
      eventType,
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
      duration,
    });

    // Still return 200 - we've done our best to log
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

async function processOTWebhookEvent(
  event: Stripe.Event,
  clinicId: number,
  services: ProcessingServices
): Promise<ProcessingResult> {
  const {
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
      // Payment Intent Events - CRITICAL for patient matching
      // ================================================================
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const piInvoice = (paymentIntent as Stripe.PaymentIntent & { invoice?: string | null })
          .invoice;

        // Skip if this is an invoice payment (handled by invoice.payment_succeeded)
        if (piInvoice) {
          return {
            success: true,
            details: { skipped: true, reason: 'Has associated invoice' },
          };
        }

        // Extract payment data and add OT clinic ID
        const intentPaymentData = extractPaymentDataFromPaymentIntent(paymentIntent);
        intentPaymentData.metadata = {
          ...intentPaymentData.metadata,
          clinicId: clinicId.toString(),
        };

        const result = await processStripePayment(intentPaymentData, event.id, event.type);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Payment processing failed',
            details: {
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount,
              clinicId,
            },
          };
        }

        // Process affiliate commission if patient was matched and has attribution
        let commissionResult = null;
        if (result.patient?.id && processPaymentForCommission) {
          try {
            const isFirstPayment = checkIfFirstPayment
              ? await checkIfFirstPayment(result.patient.id, paymentIntent.id)
              : true;

            commissionResult = await processPaymentForCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: paymentIntent.id,
              stripeEventType: event.type,
              amountCents: paymentIntent.amount,
              occurredAt: new Date(paymentIntent.created * 1000),
              isFirstPayment,
            });

            if (commissionResult?.commissionEventId) {
              logger.info('[OT STRIPE WEBHOOK] Affiliate commission created', {
                patientId: result.patient.id,
                commissionEventId: commissionResult.commissionEventId,
                amountCents: paymentIntent.amount,
              });
            }
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        // Auto-match pending refills for this patient
        let refillsMatched: number[] = [];
        if (result.patient?.id && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              clinicId,
              paymentIntent.id,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to auto-match refills', {
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
            matchedBy: result.matchResult?.matchedBy,
            commissionCreated: !!commissionResult?.commissionEventId,
            refillsMatched: refillsMatched.length,
            clinicId,
          },
        };
      }

      // ================================================================
      // Charge Events - CRITICAL for patient matching
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
        chargePaymentData.metadata = {
          ...chargePaymentData.metadata,
          clinicId: clinicId.toString(),
        };

        const result = await processStripePayment(chargePaymentData, event.id, event.type);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Charge processing failed',
            details: { chargeId: charge.id, amount: charge.amount, clinicId },
          };
        }

        // Process affiliate commission
        let commissionResult = null;
        if (result.patient?.id && processPaymentForCommission) {
          try {
            const isFirstPayment = checkIfFirstPayment
              ? await checkIfFirstPayment(result.patient.id, charge.id)
              : true;

            commissionResult = await processPaymentForCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: charge.id,
              stripeEventType: event.type,
              amountCents: charge.amount,
              occurredAt: new Date(charge.created * 1000),
              isFirstPayment,
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        // Auto-match pending refills
        let refillsMatched: number[] = [];
        if (result.patient?.id && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              clinicId,
              charge.id,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to auto-match refills', {
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
            matchedBy: result.matchResult?.matchedBy,
            commissionCreated: !!commissionResult?.commissionEventId,
            refillsMatched: refillsMatched.length,
            clinicId,
          },
        };
      }

      // ================================================================
      // Checkout Session Events - CRITICAL for patient matching
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
        sessionPaymentData.metadata = {
          ...sessionPaymentData.metadata,
          clinicId: clinicId.toString(),
        };

        const result = await processStripePayment(sessionPaymentData, event.id, event.type);

        if (!result.success) {
          return {
            success: false,
            error: result.error || 'Checkout processing failed',
            details: { sessionId: session.id, amount: session.amount_total, clinicId },
          };
        }

        // Process affiliate commission
        let commissionResult = null;
        if (result.patient?.id && processPaymentForCommission) {
          try {
            const isFirstPayment = checkIfFirstPayment
              ? await checkIfFirstPayment(result.patient.id)
              : true;

            commissionResult = await processPaymentForCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: session.id,
              stripeEventType: event.type,
              amountCents: session.amount_total || 0,
              occurredAt: new Date(session.created * 1000),
              isFirstPayment,
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              patientId: result.patient.id,
            });
          }
        }

        // Auto-match pending refills
        let refillsMatched: number[] = [];
        if (result.patient?.id && autoMatchPendingRefillsForPatient) {
          try {
            refillsMatched = await autoMatchPendingRefillsForPatient(
              result.patient.id,
              clinicId,
              (session.payment_intent as string) || undefined,
              result.invoice?.id
            );
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to auto-match refills', {
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
            matchedBy: result.matchResult?.matchedBy,
            commissionCreated: !!commissionResult?.commissionEventId,
            refillsMatched: refillsMatched.length,
            clinicId,
          },
        };
      }

      // ================================================================
      // Refund/Chargeback Events - Commission Reversal + Invoice Update
      // ================================================================
      case 'charge.refunded':
      case 'charge.dispute.created': {
        const eventObject = event.data.object as Stripe.Charge | Stripe.Dispute;
        const chargeId =
          'charge' in eventObject && typeof eventObject.charge === 'string'
            ? eventObject.charge
            : eventObject.id;

        logger.info('[OT STRIPE WEBHOOK] Processing refund/dispute', {
          eventType: event.type,
          chargeId,
          clinicId,
        });

        // Import refund handler
        const { handleStripeRefund, extractRefundDataFromCharge } =
          await import('@/services/stripe/paymentMatchingService');

        // Handle refund - update invoice and payment status
        if (event.type === 'charge.refunded') {
          const charge = eventObject as Stripe.Charge;
          const refundData = extractRefundDataFromCharge(charge);

          if (refundData) {
            const refundResult = await handleStripeRefund(refundData, event.id);
            if (!refundResult.success) {
              logger.warn('[OT STRIPE WEBHOOK] Failed to update invoice for refund', {
                error: refundResult.error,
                chargeId,
              });
            } else {
              logger.info('[OT STRIPE WEBHOOK] Invoice updated for refund', {
                invoiceId: refundResult.invoiceId,
                chargeId,
              });
            }
          }
        }

        // Reverse commission if applicable
        if (reverseCommissionForRefund) {
          try {
            const amountCents = 'amount' in eventObject ? eventObject.amount : 0;
            await reverseCommissionForRefund({
              clinicId,
              stripeEventId: event.id,
              stripeObjectId: chargeId,
              stripeEventType: event.type,
              amountCents,
              occurredAt: new Date(),
              reason: event.type === 'charge.dispute.created' ? 'chargeback' : 'refund',
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to reverse commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              chargeId,
            });
          }
        }

        return { success: true, details: { chargeId, eventType: event.type, clinicId } };
      }

      // ================================================================
      // Invoice Events
      // ================================================================
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
      case 'invoice.finalized':
      case 'invoice.sent': {
        const invoice = event.data.object as Stripe.Invoice;
        return {
          success: true,
          details: { invoiceId: invoice.id, status: invoice.status, clinicId },
        };
      }

      // ================================================================
      // Other Events
      // ================================================================
      default:
        return {
          success: true,
          details: { skipped: true, reason: 'Unhandled event type', clinicId },
        };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: errorMessage,
      details: { eventType: event.type, clinicId },
    };
  }
}

// ============================================================================
// Dead Letter Queue
// ============================================================================

async function queueFailedEvent(
  event: Stripe.Event,
  error: string,
  rawBody: string,
  clinicId: number
): Promise<void> {
  try {
    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const payload: unknown = rawBody ? safeParseJsonString(rawBody) : null;
    await prisma.webhookLog.create({
      data: {
        source: 'stripe-ot',
        eventId: event.id,
        eventType: event.type,
        status: 'FAILED',
        errorMessage: error,
        payload: payload as object | null,
        retryCount: 0,
        processedAt: null,
        metadata: {
          queuedAt: new Date().toISOString(),
          requiresManualReview: true,
          clinicId,
          clinicSubdomain: OT_SUBDOMAIN,
        },
      },
    });

    logger.info('[OT STRIPE WEBHOOK] Failed event queued to DLQ', {
      eventId: event.id,
      eventType: event.type,
      clinicId,
      error,
    });
  } catch (queueError) {
    logger.error('[OT STRIPE WEBHOOK] CRITICAL: Failed to queue to DLQ', {
      eventId: event.id,
      eventType: event.type,
      clinicId,
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
  error: string,
  clinicId: number
): Promise<void> {
  const paymentData = event.data.object;

  const getAmount = (): number | undefined => {
    if ('amount' in paymentData) return paymentData.amount as number;
    if ('amount_total' in paymentData) return paymentData.amount_total as number;
    return undefined;
  };

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
    title: 'OT Payment Processing Failed',
    message: `Failed to process ${event.type} for OT clinic - patient may not receive service`,
    eventId: event.id,
    eventType: event.type,
    clinicId,
    clinicSubdomain: OT_SUBDOMAIN,
    amount: getAmount(),
    customerEmail: getEmail(),
    error,
    timestamp: new Date().toISOString(),
    actionRequired: 'Manual review required in Admin > Payment Reconciliation',
  };

  logger.error('[OT PAYMENT ALERT] CRITICAL: Payment processing failure', alertPayload);

  // Send to external alerting service if configured
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
    logger.error('[OT STRIPE WEBHOOK] Failed to send alert', alertError);
  }
}
