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
import { prisma, runWithClinicContext } from '@/lib/db';
import { OT_STRIPE_CONFIG } from '@/lib/stripe/config';
import { StripePaymentService } from '@/services/stripe/paymentService';

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
      apiVersion: '2026-03-25.dahlia',
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
    } catch (error: unknown) {
      logger.error('[OT STRIPE WEBHOOK] Signature verification failed:', {
        error: error instanceof Error ? error.message : String(error),
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

    const {
      processPaymentForSalesRepCommission,
      reverseSalesRepCommission,
      checkIfFirstPaymentForSalesRep,
    } = await import('@/services/sales-rep/salesRepCommissionService');

    const { autoMatchPendingRefillsForPatient } =
      await import('@/services/refill/refillQueueService');

    // Process the event within the OT clinic context so tenant-isolated
    // queries (patient, invoice, etc.) resolve correctly.
    const result = await runWithClinicContext(clinicId, () =>
      processOTWebhookEvent(event, clinicId, {
        processStripePayment,
        extractPaymentDataFromCharge,
        extractPaymentDataFromPaymentIntent,
        extractPaymentDataFromCheckoutSession,
        processPaymentForCommission,
        reverseCommissionForRefund,
        checkIfFirstPayment,
        processPaymentForSalesRepCommission,
        reverseSalesRepCommission,
        checkIfFirstPaymentForSalesRep,
        autoMatchPendingRefillsForPatient,
      })
    );

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
    const errorMessage =
      error instanceof Error
        ? error instanceof Error
          ? error.message
          : String(error)
        : 'Unknown error';
    const duration = Date.now() - startTime;

    logger.error('[OT STRIPE WEBHOOK] Catastrophic error', {
      eventId,
      eventType,
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && {
        stack: error instanceof Error ? error.stack : undefined,
      }),
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
  processPaymentForSalesRepCommission?: any;
  reverseSalesRepCommission?: any;
  checkIfFirstPaymentForSalesRep?: any;
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
    processPaymentForSalesRepCommission,
    reverseSalesRepCommission,
    checkIfFirstPaymentForSalesRep,
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

        // PaymentIntents created by the Process Payment form include metadata.paymentId.
        // Those routes handle their own invoice creation, so the webhook must only update
        // the payment status — calling processStripePayment would create a duplicate record.
        const isProcessFormPayment = !!paymentIntent.metadata?.paymentId;
        if (isProcessFormPayment) {
          logger.info(
            '[OT STRIPE WEBHOOK] PaymentIntent from Process Payment form — updating status only',
            {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
              paymentId: paymentIntent.metadata.paymentId,
              clinicId,
            }
          );
          try {
            await StripePaymentService.updatePaymentFromIntent(paymentIntent);
          } catch (updateErr) {
            logger.error('[OT STRIPE WEBHOOK] Failed to update process-form payment from intent', {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
              error: updateErr instanceof Error ? updateErr.message : 'Unknown error',
            });
          }

          // Still process commissions for the matched patient
          const rawPatientId = paymentIntent.metadata.patientId
            ? parseInt(paymentIntent.metadata.patientId, 10)
            : NaN;
          if (!Number.isNaN(rawPatientId) && rawPatientId > 0) {
            if (processPaymentForCommission) {
              try {
                const isFirstPayment = checkIfFirstPayment
                  ? await checkIfFirstPayment(rawPatientId, paymentIntent.id)
                  : true;
                await processPaymentForCommission({
                  clinicId,
                  patientId: rawPatientId,
                  stripeEventId: event.id,
                  stripeObjectId: paymentIntent.id,
                  stripeEventType: event.type,
                  amountCents: paymentIntent.amount,
                  occurredAt: new Date(paymentIntent.created * 1000),
                  isFirstPayment,
                });
              } catch (e) {
                logger.warn(
                  '[OT STRIPE WEBHOOK] Failed to process commission for process-form payment',
                  {
                    error: e instanceof Error ? e.message : 'Unknown error',
                    patientId: rawPatientId,
                  }
                );
              }
            }
            if (processPaymentForSalesRepCommission) {
              try {
                const isFirst = checkIfFirstPaymentForSalesRep
                  ? await checkIfFirstPaymentForSalesRep(rawPatientId, paymentIntent.id)
                  : true;
                await processPaymentForSalesRepCommission({
                  clinicId,
                  patientId: rawPatientId,
                  stripeEventId: event.id,
                  stripeObjectId: paymentIntent.id,
                  stripeEventType: event.type,
                  amountCents: paymentIntent.amount,
                  occurredAt: new Date(paymentIntent.created * 1000),
                  isFirstPayment: isFirst,
                });
              } catch (e) {
                logger.warn(
                  '[OT STRIPE WEBHOOK] Failed to process sales rep commission for process-form payment',
                  {
                    error: e instanceof Error ? e.message : 'Unknown error',
                    patientId: rawPatientId,
                  }
                );
              }
            }
            if (autoMatchPendingRefillsForPatient) {
              try {
                await autoMatchPendingRefillsForPatient(rawPatientId, clinicId, paymentIntent.id);
              } catch (e) {
                logger.warn(
                  '[OT STRIPE WEBHOOK] Failed to auto-match refills for process-form payment',
                  {
                    error: e instanceof Error ? e.message : 'Unknown error',
                    patientId: rawPatientId,
                  }
                );
              }
            }
          }

          return {
            success: true,
            details: {
              paymentIntentId: paymentIntent.id,
              processFormPayment: true,
              paymentId: parseInt(paymentIntent.metadata.paymentId, 10),
              clinicId,
            },
          };
        }

        // Extract payment data and add OT clinic ID
        // Pass OT Stripe client so charge expansion uses OT's account (not legacy EonMeds)
        const otStripeForExtract = getOTStripe();
        const intentPaymentData = await extractPaymentDataFromPaymentIntent(paymentIntent, otStripeForExtract);
        intentPaymentData.metadata = {
          ...intentPaymentData.metadata,
          clinicId: clinicId.toString(),
        };

        // If description is missing/generic, try to find product name from the
        // associated checkout session's line items (payment link flow)
        const isGenericDesc =
          !intentPaymentData.description ||
          intentPaymentData.description === 'Checkout payment' ||
          intentPaymentData.description === 'Payment received via Stripe';

        if (isGenericDesc) {
          try {
            const otStripe = getOTStripe();
            // Look up checkout sessions linked to this payment intent
            const sessions = await otStripe.checkout.sessions.list({
              payment_intent: paymentIntent.id,
              limit: 1,
            });

            if (sessions.data.length > 0) {
              const expandedLineItems = await otStripe.checkout.sessions.listLineItems(
                sessions.data[0].id,
                { limit: 20, expand: ['data.price.product'] }
              );

              if (expandedLineItems.data.length > 0) {
                intentPaymentData.lineItemDetails = expandedLineItems.data.map((li) => {
                  const product = li.price?.product;
                  const productName =
                    typeof product === 'object' && product && 'name' in product
                      ? (product as Stripe.Product).name
                      : null;
                  return {
                    description: li.description || productName || 'Line item',
                    productName: productName || li.description || undefined,
                    amount: li.amount_total || 0,
                    quantity: li.quantity || 1,
                  };
                });

                const firstProductName = intentPaymentData.lineItemDetails[0]?.productName;
                if (firstProductName) {
                  intentPaymentData.description = firstProductName;
                }

                logger.info('[OT STRIPE WEBHOOK] Enriched PI with checkout line items', {
                  paymentIntentId: paymentIntent.id,
                  sessionId: sessions.data[0].id,
                  firstProduct: firstProductName,
                });
              }
            }
          } catch (enrichErr) {
            logger.warn('[OT STRIPE WEBHOOK] Could not enrich PI with checkout line items', {
              paymentIntentId: paymentIntent.id,
              error: enrichErr instanceof Error ? enrichErr.message : 'Unknown',
            });
          }
        }

        const result = await processStripePayment(intentPaymentData, event.id, event.type);

        // Also update any existing payment record (e.g. from a payment link checkout
        // where a Payment row was pre-created, or a race with the process route).
        try {
          await StripePaymentService.updatePaymentFromIntent(paymentIntent);
        } catch (e) {
          logger.warn('[OT STRIPE WEBHOOK] Failed to update payment record from intent', {
            error: e instanceof Error ? e.message : 'Unknown error',
            paymentIntentId: paymentIntent.id,
          });
        }

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

        if (result.patient?.id && processPaymentForSalesRepCommission) {
          try {
            const isFirst = checkIfFirstPaymentForSalesRep
              ? await checkIfFirstPaymentForSalesRep(result.patient.id, paymentIntent.id)
              : true;
            await processPaymentForSalesRepCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: paymentIntent.id,
              stripeEventType: event.type,
              amountCents: paymentIntent.amount,
              occurredAt: new Date(paymentIntent.created * 1000),
              isFirstPayment: isFirst,
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process sales rep commission', {
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

        if (result.patient?.id && processPaymentForSalesRepCommission) {
          try {
            const isFirst = checkIfFirstPaymentForSalesRep
              ? await checkIfFirstPaymentForSalesRep(result.patient.id, charge.id)
              : true;
            await processPaymentForSalesRepCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: charge.id,
              stripeEventType: event.type,
              amountCents: charge.amount,
              occurredAt: new Date(charge.created * 1000),
              isFirstPayment: isFirst,
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process sales rep commission', {
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

        // Expand checkout session line items to get actual product names
        // (not included in webhook payload by default)
        try {
          const otStripe = getOTStripe();
          const expandedLineItems = await otStripe.checkout.sessions.listLineItems(session.id, {
            limit: 20,
            expand: ['data.price.product'],
          });

          if (expandedLineItems.data.length > 0) {
            sessionPaymentData.lineItemDetails = expandedLineItems.data.map((li) => {
              const product = li.price?.product;
              const productName =
                typeof product === 'object' && product && 'name' in product
                  ? (product as Stripe.Product).name
                  : null;
              return {
                description: li.description || productName || 'Line item',
                productName: productName || li.description || undefined,
                amount: li.amount_total || 0,
                quantity: li.quantity || 1,
              };
            });

            // Also set the description to the first product name if currently generic
            const firstProductName = sessionPaymentData.lineItemDetails[0]?.productName;
            if (
              firstProductName &&
              (!sessionPaymentData.description ||
                sessionPaymentData.description === 'Checkout payment')
            ) {
              sessionPaymentData.description = firstProductName;
            }

            logger.info('[OT STRIPE WEBHOOK] Enriched checkout with line item details', {
              sessionId: session.id,
              lineItemCount: expandedLineItems.data.length,
              firstProduct: firstProductName,
            });
          }
        } catch (lineItemErr) {
          logger.warn('[OT STRIPE WEBHOOK] Could not expand checkout line items', {
            sessionId: session.id,
            error: lineItemErr instanceof Error ? lineItemErr.message : 'Unknown',
          });
        }

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

        if (result.patient?.id && processPaymentForSalesRepCommission) {
          try {
            const isFirst = checkIfFirstPaymentForSalesRep
              ? await checkIfFirstPaymentForSalesRep(result.patient.id)
              : true;
            await processPaymentForSalesRepCommission({
              clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: session.id,
              stripeEventType: event.type,
              amountCents: session.amount_total || 0,
              occurredAt: new Date(session.created * 1000),
              isFirstPayment: isFirst,
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process sales rep commission', {
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

        // Reverse affiliate commission if applicable
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
            logger.warn('[OT STRIPE WEBHOOK] Failed to reverse affiliate commission', {
              error: e instanceof Error ? e.message : 'Unknown error',
              chargeId,
            });
          }
        }

        // Reverse sales rep commission if applicable
        if (reverseSalesRepCommission) {
          try {
            const amountCents = 'amount' in eventObject ? eventObject.amount : 0;
            await reverseSalesRepCommission({
              clinicId,
              stripeEventId: event.id,
              stripeObjectId: chargeId,
              stripeEventType: event.type,
              amountCents,
              occurredAt: new Date(),
              reason: event.type === 'charge.dispute.created' ? 'chargeback' : 'refund',
            });
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to reverse sales rep commission', {
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
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;

        // Find the matching invoice in our database to get the patient
        let dbInvoice = await prisma.invoice.findUnique({
          where: { stripeInvoiceId: invoice.id },
          select: { id: true, patientId: true, clinicId: true, status: true },
        });

        // For Stripe Subscription payments, the payment_intent.succeeded handler
        // skips when the PI has an invoice (to avoid double-processing). That means
        // processStripePayment is never called for subscription payments. If we don't
        // have a local invoice yet, extract payment data from the PI and run the
        // full matching pipeline so the invoice appears in the provider Rx queue.
        if (!dbInvoice && invoice.status === 'paid') {
          const rawPi = (invoice as unknown as Record<string, unknown>).payment_intent;
          const piId =
            typeof rawPi === 'string' ? rawPi : (rawPi as Stripe.PaymentIntent | null)?.id;

          if (piId) {
            logger.info(
              '[OT STRIPE WEBHOOK] No local invoice for paid Stripe invoice — running processStripePayment via PI',
              {
                stripeInvoiceId: invoice.id,
                paymentIntentId: piId,
                clinicId,
              }
            );

            try {
              const otStripeForSub = getOTStripe();
              const pi = await otStripeForSub.paymentIntents.retrieve(piId);
              const piPaymentData = await extractPaymentDataFromPaymentIntent(pi, otStripeForSub);
              piPaymentData.stripeInvoiceId = invoice.id;
              piPaymentData.metadata = {
                ...piPaymentData.metadata,
                clinicId: clinicId.toString(),
              };

              // Enrich description from invoice line items when PI description is generic
              if (
                !piPaymentData.description ||
                piPaymentData.description === 'Payment received via Stripe'
              ) {
                const firstLine = invoice.lines?.data?.[0];
                if (firstLine?.description) {
                  piPaymentData.description = firstLine.description;
                }
              }

              // Enrich line item details from invoice lines
              if (invoice.lines?.data?.length) {
                piPaymentData.lineItemDetails = invoice.lines.data.map((li) => ({
                  description: li.description || 'Line item',
                  productName: li.description || undefined,
                  amount: li.amount || 0,
                  quantity: li.quantity || 1,
                }));
              }

              const matchResult = await processStripePayment(piPaymentData, event.id, event.type);

              if (matchResult.invoice) {
                dbInvoice = {
                  id: matchResult.invoice.id,
                  patientId: matchResult.invoice.patientId,
                  clinicId: matchResult.invoice.clinicId,
                  status: matchResult.invoice.status,
                };
                logger.info('[OT STRIPE WEBHOOK] Created local invoice from subscription payment', {
                  invoiceId: dbInvoice.id,
                  patientId: dbInvoice.patientId,
                  stripeInvoiceId: invoice.id,
                  paymentIntentId: piId,
                });
              }

              // Process commissions and refills for the matched patient
              if (matchResult.patient?.id) {
                try {
                  if (processPaymentForCommission) {
                    const isFirstPayment = checkIfFirstPayment
                      ? await checkIfFirstPayment(matchResult.patient.id, piId)
                      : true;
                    await processPaymentForCommission({
                      clinicId,
                      patientId: matchResult.patient.id,
                      stripeEventId: event.id,
                      stripeObjectId: invoice.id,
                      stripeEventType: event.type,
                      amountCents: invoice.amount_paid || 0,
                      occurredAt: invoice.status_transitions?.paid_at
                        ? new Date(invoice.status_transitions.paid_at * 1000)
                        : new Date(),
                      isFirstPayment,
                      isRecurring: invoice.billing_reason === 'subscription_cycle',
                    });
                  }
                } catch (commErr) {
                  logger.warn('[OT STRIPE WEBHOOK] Commission failed for subscription invoice', {
                    error: commErr instanceof Error ? commErr.message : 'Unknown',
                    patientId: matchResult.patient.id,
                  });
                }

                if (autoMatchPendingRefillsForPatient) {
                  try {
                    await autoMatchPendingRefillsForPatient(matchResult.patient.id);
                  } catch {
                    // non-blocking
                  }
                }
              }

              return {
                success: true,
                details: {
                  invoiceId: invoice.id,
                  localInvoiceId: dbInvoice?.id,
                  patientId: matchResult.patient?.id,
                  patientCreated: matchResult.patientCreated,
                  clinicId,
                  createdFromSubscriptionPI: true,
                },
              };
            } catch (processErr) {
              logger.error('[OT STRIPE WEBHOOK] Failed to process subscription invoice payment', {
                stripeInvoiceId: invoice.id,
                paymentIntentId: piId,
                error: processErr instanceof Error ? processErr.message : 'Unknown',
              });
              // Fall through — still return success to Stripe to avoid retries
            }
          }
        }

        if (!dbInvoice) {
          logger.warn(
            '[OT STRIPE WEBHOOK] Invoice not found in database and could not be created',
            {
              stripeInvoiceId: invoice.id,
              clinicId,
            }
          );
          return {
            success: true,
            details: {
              invoiceId: invoice.id,
              status: invoice.status,
              clinicId,
              skipped: true,
              reason: 'Invoice not in DB',
            },
          };
        }

        // Update invoice status
        const wasPaid = invoice.status === 'paid';
        const wasNotPaidBefore = dbInvoice.status !== 'PAID';

        if (wasPaid) {
          await prisma.invoice.update({
            where: { id: dbInvoice.id },
            data: {
              status: 'PAID',
              amountDue: invoice.amount_due,
              amountPaid: invoice.amount_paid,
              stripeInvoiceUrl: invoice.hosted_invoice_url || undefined,
              stripePdfUrl: invoice.invoice_pdf || undefined,
              paidAt: invoice.status_transitions?.paid_at
                ? new Date(invoice.status_transitions.paid_at * 1000)
                : new Date(),
            },
          });
        }

        // Process affiliate commission if invoice just became paid
        let commissionResult = null;
        if (wasPaid && wasNotPaidBefore && dbInvoice.patientId && processPaymentForCommission) {
          try {
            const amountPaidCents = invoice.amount_paid || 0;

            if (amountPaidCents > 0) {
              const paymentIntentId =
                typeof (invoice as any).payment_intent === 'string'
                  ? (invoice as any).payment_intent
                  : (invoice as any).payment_intent?.id;

              const isFirstPayment = checkIfFirstPayment
                ? await checkIfFirstPayment(dbInvoice.patientId, paymentIntentId || undefined)
                : true;

              commissionResult = await processPaymentForCommission({
                clinicId,
                patientId: dbInvoice.patientId,
                stripeEventId: event.id,
                stripeObjectId: invoice.id,
                stripeEventType: event.type,
                amountCents: amountPaidCents,
                occurredAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000)
                  : new Date(),
                isFirstPayment,
                isRecurring: false,
              });

              if (commissionResult?.commissionEventId) {
                logger.info('[OT STRIPE WEBHOOK] Affiliate commission created from invoice', {
                  invoiceId: dbInvoice.id,
                  patientId: dbInvoice.patientId,
                  commissionEventId: commissionResult.commissionEventId,
                  commissionAmountCents: commissionResult.commissionAmountCents,
                  amountPaidCents,
                });
              }
            }
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process affiliate commission for invoice', {
              error: e instanceof Error ? e.message : 'Unknown error',
              invoiceId: dbInvoice.id,
              patientId: dbInvoice.patientId,
            });
          }
        }

        let salesRepCommResult = null;
        if (
          wasPaid &&
          wasNotPaidBefore &&
          dbInvoice.patientId &&
          processPaymentForSalesRepCommission
        ) {
          try {
            const amountPaidCents = invoice.amount_paid || 0;
            if (amountPaidCents > 0) {
              const paymentIntentId =
                typeof (invoice as any).payment_intent === 'string'
                  ? (invoice as any).payment_intent
                  : (invoice as any).payment_intent?.id;
              const isFirst = checkIfFirstPaymentForSalesRep
                ? await checkIfFirstPaymentForSalesRep(
                    dbInvoice.patientId,
                    paymentIntentId || undefined
                  )
                : true;

              // Derive isRecurring from Stripe's billing_reason (authoritative signal)
              const billingReason = (invoice as any).billing_reason as string | undefined;
              const isRecurringInvoice =
                billingReason === 'subscription_cycle' || billingReason === 'subscription_update';

              salesRepCommResult = await processPaymentForSalesRepCommission({
                clinicId,
                patientId: dbInvoice.patientId,
                stripeEventId: event.id,
                stripeObjectId: invoice.id,
                stripeEventType: event.type,
                amountCents: amountPaidCents,
                occurredAt: invoice.status_transitions?.paid_at
                  ? new Date(invoice.status_transitions.paid_at * 1000)
                  : new Date(),
                isFirstPayment: isFirst,
                isRecurring: isRecurringInvoice,
              });
            }
          } catch (e) {
            logger.warn('[OT STRIPE WEBHOOK] Failed to process sales rep commission for invoice', {
              error: e instanceof Error ? e.message : 'Unknown error',
              invoiceId: dbInvoice.id,
              patientId: dbInvoice.patientId,
            });
          }
        }

        return {
          success: true,
          details: {
            invoiceId: invoice.id,
            dbInvoiceId: dbInvoice.id,
            status: invoice.status,
            clinicId,
            commissionCreated: !!commissionResult?.commissionEventId,
            salesRepCommissionCreated: !!salesRepCommResult?.commissionEventId,
          },
        };
      }

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
      // Subscription Events — sync to local Subscription for MRR/ARR
      // ================================================================
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const { syncSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const syncResult = await syncSubscriptionFromStripe(subscription, event.id, {
          clinicId,
          stripeAccountId: undefined,
        });
        logger.info('[OT STRIPE WEBHOOK] Subscription synced', {
          stripeSubscriptionId: subscription.id,
          eventType: event.type,
          clinicId,
          success: syncResult.success,
          skipped: syncResult.skipped,
          reason: syncResult.reason,
        });
        return {
          success: syncResult.success || syncResult.skipped === true,
          details: {
            stripeSubscriptionId: subscription.id,
            localId: syncResult.subscriptionId,
            skipped: syncResult.skipped,
            reason: syncResult.reason,
          },
        };
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const { cancelSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const canceledAt = subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : undefined;
        const cancelResult = await cancelSubscriptionFromStripe(subscription.id, canceledAt);
        logger.info('[OT STRIPE WEBHOOK] Subscription canceled', {
          stripeSubscriptionId: subscription.id,
          clinicId,
          success: cancelResult.success,
          skipped: cancelResult.skipped,
        });
        return {
          success: cancelResult.success || cancelResult.skipped === true,
          details: {
            stripeSubscriptionId: subscription.id,
            localId: cancelResult.subscriptionId,
            skipped: cancelResult.skipped,
          },
        };
      }

      // ================================================================
      // Payment Method Events — sync saved cards to patient profiles
      // ================================================================
      case 'payment_method.attached': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodAttached } = await import('@/services/stripe/cardSyncService');
        const attachResult = await handlePaymentMethodAttached(pm, clinicId);
        if (!attachResult.success) {
          return {
            success: false,
            error: attachResult.error,
            details: { paymentMethodId: pm.id, clinicId },
          };
        }
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: attachResult.action, clinicId },
        };
      }

      case 'payment_method.detached': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodDetached } = await import('@/services/stripe/cardSyncService');
        const detachResult = await handlePaymentMethodDetached(pm);
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: detachResult.action, clinicId },
        };
      }

      case 'payment_method.updated': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodUpdated } = await import('@/services/stripe/cardSyncService');
        const updateResult = await handlePaymentMethodUpdated(pm);
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: updateResult.action, clinicId },
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
    const errorMessage =
      error instanceof Error
        ? error instanceof Error
          ? error.message
          : String(error)
        : 'Unknown error';
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
    const payload: unknown = rawBody ? safeParseJsonString<Record<string, unknown>>(rawBody) : null;
    await prisma.webhookLog.create({
      data: {
        source: 'stripe-ot',
        eventId: event.id,
        eventType: event.type,
        status: 'FAILED' as any,
        errorMessage: error,
        payload: payload as any,
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
