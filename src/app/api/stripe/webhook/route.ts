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
import { WebhookStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { prisma, runWithClinicContext } from '@/lib/db';

// Critical payment event types that trigger prescriptions
const CRITICAL_PAYMENT_EVENTS = [
  'payment_intent.succeeded',
  'charge.succeeded',
  'checkout.session.completed',
  'invoice.payment_succeeded',
];

// Events that can trigger commission reversals
const REVERSAL_EVENTS = ['charge.refunded', 'charge.dispute.created', 'payment_intent.canceled'];

/** Tenant-safe idempotency key: same event for different clinics is processed separately. */
const STRIPE_IDEMPOTENCY_RESOURCE = 'stripe_webhook';

/**
 * Resolve clinicId from Stripe event before any DB writes.
 * Uses metadata.clinicId on the event's data.object (payment_intent, charge, invoice, checkout.session).
 * Returns 0 when unknown so idempotency key is always tenant-scoped.
 */
function getClinicIdFromStripeEvent(event: Stripe.Event): number {
  const obj = event.data?.object as { metadata?: Record<string, string> } | undefined;
  const raw = obj?.metadata?.clinicId;
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

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
    const { processPaymentForCommission, reverseCommissionForRefund, checkIfFirstPayment } =
      await import('@/services/affiliate/affiliateCommissionService');

    // Import sales rep commission service
    const { processPaymentForSalesRepCommission, reverseSalesRepCommission, checkIfFirstPaymentForSalesRep } =
      await import('@/services/sales-rep/salesRepCommissionService');

    // Import refill queue service for payment auto-matching
    const { autoMatchPendingRefillsForPatient } =
      await import('@/services/refill/refillQueueService');

    const stripeClient = getStripe();
    const body = await request.text();
    const headersList = await headers();
    const signature = headersList.get('stripe-signature');

    if (!signature) {
      logger.error('[STRIPE WEBHOOK] Missing signature');
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event!: Stripe.Event;

    // Try primary secret (EonMeds clinic account), then Connect platform secret (Wellmedr etc.)
    const secrets = [
      STRIPE_CONFIG.webhookEndpointSecret,
      process.env.STRIPE_CONNECT_PLATFORM_WEBHOOK_SECRET,
    ].filter(Boolean) as string[];

    let verified = false;
    for (const secret of secrets) {
      try {
        event = stripeClient.webhooks.constructEvent(body, signature, secret);
        verified = true;
        break;
      } catch {
        // Try next secret
      }
    }

    if (!verified) {
      logger.error('[STRIPE WEBHOOK] Signature verification failed (all secrets exhausted)');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    eventId = event.id;
    eventType = event.type;

    // Tenant-safe idempotency: resolve clinic before any DB writes; key = stripe:${clinicId}:${eventId}
    let clinicId = getClinicIdFromStripeEvent(event);

    // Stripe Connect: events from connected accounts (e.g. Wellmedr) include event.account.
    // Resolve clinic by Clinic.stripeAccountId FIRST — this MUST run before DEFAULT_CLINIC_ID
    // so Connect events are attributed to the correct clinic, not the platform default.
    // BUG FIX: Previously DEFAULT_CLINIC_ID ran first, causing WellMedR Connect payments
    // (which lack metadata.clinicId) to be incorrectly assigned to EONMeds, creating
    // duplicate patients in the wrong clinic.
    const connectAccountId = (event as Stripe.Event & { account?: string }).account;
    const isConnectEvent = !!connectAccountId && typeof connectAccountId === 'string';

    if (clinicId === 0 && isConnectEvent) {
      const clinicByAccount = await prisma.clinic.findFirst({
        where: { stripeAccountId: connectAccountId },
        select: { id: true },
      });
      if (clinicByAccount) {
        clinicId = clinicByAccount.id;
        logger.info('[STRIPE WEBHOOK] Resolved clinic from Connect account', {
          eventId: event.id,
          eventType: event.type,
          clinicId,
          accountId: connectAccountId.substring(0, 12) + '…',
        });
      } else {
        logger.warn('[STRIPE WEBHOOK] Connect event has unrecognized account — cannot resolve clinic', {
          eventId: event.id,
          eventType: event.type,
          accountId: connectAccountId.substring(0, 12) + '…',
        });
      }
    }

    // Platform-direct fallback: only for non-Connect events (platform's own Stripe account).
    // When metadata.clinicId is missing (Payment Links from Dashboard, external checkouts), default to
    // DEFAULT_CLINIC_ID so payments are processed instead of dropped.
    // CRITICAL: Never apply this fallback for Connect events — those must be resolved via
    // event.account above. Applying DEFAULT_CLINIC_ID to Connect events causes cross-clinic
    // data leakage (patients created in the wrong clinic).
    if (clinicId === 0 && !isConnectEvent && process.env.DEFAULT_CLINIC_ID) {
      const fallback = parseInt(process.env.DEFAULT_CLINIC_ID, 10);
      if (!Number.isNaN(fallback) && fallback > 0) {
        clinicId = fallback;
        logger.info('[STRIPE WEBHOOK] Using DEFAULT_CLINIC_ID fallback (platform-direct event, no metadata)', {
          eventId: event.id,
          eventType: event.type,
          clinicId: fallback,
        });
      }
    }

    const idempotencyKey = `stripe:${clinicId}:${event.id}`;
    const existingIdem = await prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });
    if (existingIdem) {
      logger.info('[STRIPE WEBHOOK] Duplicate event ignored (tenant-safe idempotency)', {
        eventId: event.id,
        eventType: event.type,
        clinicId,
      });
      return NextResponse.json({
        received: true,
        eventId: event.id,
        processed: true,
        duplicate: true,
      });
    }

    // Enterprise rule: when clinic cannot be resolved and event impacts tenant data, do not write tenant-scoped records
    if (clinicId === 0 && CRITICAL_PAYMENT_EVENTS.includes(event.type)) {
      logger.warn('[STRIPE WEBHOOK] Event would impact tenant data but clinicId unresolved — no-op + 200', {
        eventId: event.id,
        eventType: event.type,
      });
      await queueFailedEvent(event, 'CLINIC_UNRESOLVED: metadata.clinicId missing; no tenant write', body);
      return NextResponse.json({
        received: true,
        eventId: event.id,
        processed: false,
        reason: 'clinic_unresolved',
      });
    }

    logger.info(`[STRIPE WEBHOOK] Received event`, {
      eventId,
      eventType,
      livemode: event.livemode,
    });

    // Process the event with comprehensive error handling (pass clinicId so payment data gets it for matching)
    // Wrap in clinic context for tenant-isolated model access (invoice, payment, etc.)
    const result = await runWithClinicContext(clinicId > 0 ? clinicId : undefined, () =>
      processWebhookEvent(event, clinicId, {
        StripeInvoiceService,
        StripePaymentService,
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
        isConnectEvent,
      })
    );

    const duration = Date.now() - startTime;

    if (result.success) {
      logger.info(`[STRIPE WEBHOOK] Event processed successfully`, {
        eventId,
        eventType,
        duration,
        clinicId,
        ...result.details,
      });
      // Tenant-safe idempotency: record so same event for same clinic returns 200 on retry
      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          resource: STRIPE_IDEMPOTENCY_RESOURCE,
          responseStatus: 200,
          responseBody: { received: true, eventId: event.id, processed: true },
        },
      });
      // Audit log with clinic for observability
      await prisma.webhookLog.create({
        data: {
          source: 'stripe',
          eventId: event.id,
          eventType: event.type,
          clinicId: clinicId > 0 ? clinicId : null,
          endpoint: '/api/stripe/webhook',
          method: 'POST',
          status: WebhookStatus.SUCCESS,
          statusCode: 200,
          processingTimeMs: duration,
          processedAt: new Date(),
        },
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
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
      duration,
    });

    // Try to queue even catastrophic failures
    try {
      const body = await request.clone().text();
      await queueFailedEvent(
        { id: eventId || 'unknown', type: eventType || 'unknown' } as Pick<
          Stripe.Event,
          'id' | 'type'
        >,
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
  StripeInvoiceService: {
    updateFromWebhook(stripeInvoice: Stripe.Invoice): Promise<void>;
  };
  StripePaymentService: {
    updatePaymentFromIntent(paymentIntent: Stripe.PaymentIntent): Promise<void>;
  };
  processStripePayment: (
    paymentData: import('@/services/stripe/paymentMatchingService').StripePaymentData,
    stripeEventId?: string,
    stripeEventType?: string,
  ) => Promise<import('@/services/stripe/paymentMatchingService').PaymentProcessingResult>;
  extractPaymentDataFromCharge: (charge: Stripe.Charge) => import('@/services/stripe/paymentMatchingService').StripePaymentData;
  extractPaymentDataFromPaymentIntent: (paymentIntent: Stripe.PaymentIntent) => Promise<import('@/services/stripe/paymentMatchingService').StripePaymentData>;
  extractPaymentDataFromCheckoutSession: (session: Stripe.Checkout.Session) => import('@/services/stripe/paymentMatchingService').StripePaymentData;
  processPaymentForCommission?: (data: import('@/services/affiliate/affiliateCommissionService').PaymentEventData) => Promise<import('@/services/affiliate/affiliateCommissionService').CommissionResult>;
  reverseCommissionForRefund?: (data: import('@/services/affiliate/affiliateCommissionService').RefundEventData) => Promise<import('@/services/affiliate/affiliateCommissionService').CommissionResult>;
  checkIfFirstPayment?: (patientId: number, currentPaymentId?: string) => Promise<boolean>;
  processPaymentForSalesRepCommission?: (data: import('@/services/sales-rep/salesRepCommissionService').SalesRepPaymentEventData) => Promise<import('@/services/sales-rep/salesRepCommissionService').SalesRepCommissionResult>;
  reverseSalesRepCommission?: (data: import('@/services/sales-rep/salesRepCommissionService').SalesRepRefundEventData) => Promise<import('@/services/sales-rep/salesRepCommissionService').SalesRepCommissionResult>;
  checkIfFirstPaymentForSalesRep?: (patientId: number, currentPaymentId?: string) => Promise<boolean>;
  autoMatchPendingRefillsForPatient?: (patientId: number, clinicId: number, stripePaymentId?: string, invoiceId?: number) => Promise<number[]>;
  isConnectEvent?: boolean;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
  details?: Record<string, any>;
}

async function processWebhookEvent(
  event: Stripe.Event,
  resolvedClinicId: number,
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
    processPaymentForSalesRepCommission,
    reverseSalesRepCommission,
    checkIfFirstPaymentForSalesRep,
    autoMatchPendingRefillsForPatient,
    isConnectEvent,
  } = services;

  // Connect events (e.g. WellMedR) have their own invoice creation flow
  // (Airtable automation → /api/webhooks/wellmedr-invoice). The Stripe webhook
  // must NOT also create invoices via processStripePayment, or every payment
  // generates 3 duplicate invoices (stripe_webhook + stripe_webhook_auto_create + wellmedr-airtable).
  const skipInvoiceCreation = !!isConnectEvent;

  try {
    switch (event.type) {
      // ================================================================
      // Invoice Events
      // ================================================================
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await StripeInvoiceService.updateFromWebhook(invoice);

        // If this invoice is for a subscription renewal, trigger Rx refill
        const invoiceSubscriptionId = typeof (invoice as any).subscription === 'string'
          ? (invoice as any).subscription
          : (invoice as any).subscription?.id;

        let refillTriggered = false;

        if (invoiceSubscriptionId && invoice.billing_reason !== 'subscription_create') {
          try {
            const { triggerRefillForSubscriptionPayment } =
              await import('@/services/refill/refillQueueService');

            let localSub = await prisma.subscription.findUnique({
              where: { stripeSubscriptionId: invoiceSubscriptionId },
              select: { id: true, patientId: true, clinicId: true },
            });

            // ────────────────────────────────────────────────────────────
            // RESILIENCE: If no local subscription exists, attempt on-demand
            // sync from Stripe. This covers missed customer.subscription.created
            // webhooks, subscriptions created via Stripe Dashboard, or sync
            // script gaps. Without this, the refill would silently not trigger.
            // ────────────────────────────────────────────────────────────
            if (!localSub) {
              logger.warn('[STRIPE WEBHOOK] Local subscription missing for renewal — attempting on-demand sync', {
                stripeSubscriptionId: invoiceSubscriptionId,
              });
              try {
                const { getStripeClient } = await import('@/lib/stripe/config');
                const stripeForSync = getStripeClient();
                if (stripeForSync) {
                  const connectAcct = (event as Stripe.Event & { account?: string }).account;
                  const requestOpts: import('stripe').default.RequestOptions | undefined = connectAcct
                    ? { stripeAccount: connectAcct }
                    : undefined;
                  const stripeSub = await stripeForSync.subscriptions.retrieve(
                    invoiceSubscriptionId,
                    { expand: ['items.data.price.product'] },
                    requestOpts
                  );

                  const { syncSubscriptionFromStripe } =
                    await import('@/services/stripe/subscriptionSyncService');
                  const syncResult = await syncSubscriptionFromStripe(stripeSub, event.id, {
                    clinicId: resolvedClinicId > 0 ? resolvedClinicId : undefined,
                    stripeAccountId: connectAcct || undefined,
                  });

                  if (syncResult.success && syncResult.subscriptionId) {
                    localSub = await prisma.subscription.findUnique({
                      where: { id: syncResult.subscriptionId },
                      select: { id: true, patientId: true, clinicId: true },
                    });
                    logger.info('[STRIPE WEBHOOK] On-demand subscription sync succeeded', {
                      stripeSubscriptionId: invoiceSubscriptionId,
                      subscriptionId: syncResult.subscriptionId,
                    });
                  } else {
                    logger.warn('[STRIPE WEBHOOK] On-demand subscription sync did not yield a local record', {
                      stripeSubscriptionId: invoiceSubscriptionId,
                      skipped: syncResult.skipped,
                      reason: syncResult.reason,
                    });
                  }
                }
              } catch (syncErr) {
                logger.error('[STRIPE WEBHOOK] On-demand subscription sync failed', {
                  stripeSubscriptionId: invoiceSubscriptionId,
                  error: syncErr instanceof Error ? syncErr.message : 'Unknown',
                });
              }
            }

            if (localSub) {
              const refill = await triggerRefillForSubscriptionPayment(
                localSub.id,
                undefined,
                undefined
              );
              refillTriggered = true;

              logger.info('[STRIPE WEBHOOK] Triggered refill for subscription renewal', {
                subscriptionId: localSub.id,
                stripeSubscriptionId: invoiceSubscriptionId,
                refillId: refill?.id,
                patientId: localSub.patientId,
              });
            } else {
              logger.error('[STRIPE WEBHOOK] Cannot trigger refill: local subscription not found even after on-demand sync', {
                stripeSubscriptionId: invoiceSubscriptionId,
                billingReason: invoice.billing_reason,
              });
            }
          } catch (refillErr) {
            logger.error('[STRIPE WEBHOOK] Failed to trigger refill for subscription renewal', {
              stripeSubscriptionId: invoiceSubscriptionId,
              error: refillErr instanceof Error ? refillErr.message : 'Unknown',
            });
          }
        }

        // ────────────────────────────────────────────────────────────
        // ADDON SUBSCRIPTIONS (Connect): Create a local Invoice so addon
        // medications appear in the Rx queue for provider approval.
        // The normal GLP-1 path relies on Airtable automation (wellmedr-invoice),
        // but standalone addon subscriptions (Elite+ Bundle) have no Airtable
        // record and were previously invisible to the prescription pipeline.
        // ────────────────────────────────────────────────────────────
        let addonInvoiceCreated = false;
        if (isConnectEvent && invoiceSubscriptionId && invoice.status === 'paid') {
          try {
            const { isWellMedrAddonPriceId, getAddonPlanByStripePriceId } =
              await import('@/config/billingPlans');
            const { getStripeClient } = await import('@/lib/stripe/config');
            const { findPatientByEmail } = await import('@/services/stripe/paymentMatchingService');

            const connectAcct = (event as Stripe.Event & { account?: string }).account;
            const stripeForAddon = getStripeClient();
            if (stripeForAddon) {
              const requestOpts: import('stripe').default.RequestOptions | undefined = connectAcct
                ? { stripeAccount: connectAcct }
                : undefined;

              const stripeSub = await stripeForAddon.subscriptions.retrieve(
                invoiceSubscriptionId,
                { expand: ['items.data.price.product'] },
                requestOpts,
              );

              const priceId = stripeSub.items?.data?.[0]?.price?.id;
              if (priceId && isWellMedrAddonPriceId(priceId)) {
                const addonPlan = getAddonPlanByStripePriceId(priceId);
                const addonName = addonPlan?.name || 'Add-on';

                const customerId =
                  typeof stripeSub.customer === 'string'
                    ? stripeSub.customer
                    : stripeSub.customer?.id;

                let patientId: number | undefined;
                let clinicId: number | undefined;

                if (customerId) {
                  const patientByCust = await prisma.patient.findFirst({
                    where: { stripeCustomerId: customerId },
                    select: { id: true, clinicId: true },
                  });
                  if (patientByCust?.clinicId) {
                    patientId = patientByCust.id;
                    clinicId = patientByCust.clinicId;
                  }
                }

                if (!patientId && customerId) {
                  try {
                    const customer = await stripeForAddon.customers.retrieve(customerId, {}, requestOpts as any);
                    if (customer && !customer.deleted && 'email' in customer && customer.email) {
                      const patient = await findPatientByEmail(
                        customer.email.trim().toLowerCase(),
                        resolvedClinicId > 0 ? resolvedClinicId : undefined,
                      );
                      if (patient?.clinicId) {
                        patientId = patient.id;
                        clinicId = patient.clinicId;
                      }
                    }
                  } catch (emailErr) {
                    logger.warn('[STRIPE WEBHOOK] Addon invoice: email fallback failed', {
                      error: emailErr instanceof Error ? emailErr.message : 'Unknown',
                    });
                  }
                }

                if (!clinicId && resolvedClinicId > 0) {
                  clinicId = resolvedClinicId;
                }

                if (patientId && clinicId) {
                  const addonIds = addonPlan?.id === 'wm_addon_elite_bundle'
                    ? ['elite_bundle']
                    : addonPlan?.id === 'wm_addon_nad' ? ['nad_plus']
                    : addonPlan?.id === 'wm_addon_sermorelin' ? ['sermorelin']
                    : addonPlan?.id === 'wm_addon_b12' ? ['b12']
                    : [];

                  const amountCents = invoice.amount_paid || addonPlan?.price || 0;
                  const invoiceNumber = `WM-ADDON-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

                  const existingAddonInvoice = await prisma.invoice.findFirst({
                    where: {
                      patientId,
                      clinicId,
                      metadata: { path: ['stripeInvoiceId'], equals: invoice.id },
                    },
                  });

                  if (!existingAddonInvoice) {
                    await prisma.invoice.create({
                      data: {
                        patientId,
                        clinicId,
                        stripeInvoiceId: invoice.id,
                        amount: amountCents,
                        amountDue: 0,
                        amountPaid: amountCents,
                        currency: 'usd',
                        status: 'PAID',
                        paidAt: new Date(),
                        description: `${addonName} - Payment received`,
                        dueDate: new Date(),
                        prescriptionProcessed: false,
                        lineItems: [{
                          description: addonName,
                          quantity: 1,
                          unitPrice: amountCents,
                          product: addonName,
                          medicationType: 'add-on',
                          plan: '',
                        }],
                        metadata: {
                          invoiceNumber,
                          source: 'stripe-connect-addon',
                          stripeInvoiceId: invoice.id,
                          stripeSubscriptionId: invoiceSubscriptionId,
                          product: addonName,
                          medicationType: 'add-on',
                          ...(addonIds.length > 0 ? { selectedAddons: addonIds } : {}),
                        },
                      },
                    });
                    addonInvoiceCreated = true;

                    logger.info('[STRIPE WEBHOOK] Created addon Invoice for Rx queue', {
                      patientId,
                      clinicId,
                      addonName,
                      addonIds,
                      stripeInvoiceId: invoice.id,
                      stripeSubscriptionId: invoiceSubscriptionId,
                      amountCents,
                    });
                  } else {
                    logger.info('[STRIPE WEBHOOK] Addon Invoice already exists, skipping', {
                      existingInvoiceId: existingAddonInvoice.id,
                      stripeInvoiceId: invoice.id,
                    });
                  }
                } else {
                  logger.warn('[STRIPE WEBHOOK] Addon subscription detected but no patient found — cron will retry', {
                    stripeSubscriptionId: invoiceSubscriptionId,
                    addonName,
                    priceId,
                    customerId,
                    resolvedClinicId,
                  });
                }
              }
            }
          } catch (addonErr) {
            logger.error('[STRIPE WEBHOOK] Failed to process addon subscription invoice', {
              stripeSubscriptionId: invoiceSubscriptionId,
              error: addonErr instanceof Error ? addonErr.message : 'Unknown',
            });
          }
        }

        // Process sales rep commission for paid invoices
        let salesRepCommResult = null;
        if (invoice.status === 'paid' && processPaymentForSalesRepCommission) {
          try {
            const amountPaidCents = invoice.amount_paid || 0;
            if (amountPaidCents > 0) {
              // Resolve patient from subscription or invoice customer
              let invPatientId: number | undefined;
              let invClinicId: number | undefined;

              if (invoiceSubscriptionId) {
                const sub = await prisma.subscription.findUnique({
                  where: { stripeSubscriptionId: invoiceSubscriptionId },
                  select: { patientId: true, clinicId: true },
                });
                invPatientId = sub?.patientId;
                invClinicId = sub?.clinicId ?? undefined;
              }
              if (!invClinicId && resolvedClinicId > 0) {
                invClinicId = resolvedClinicId;
              }

              if (invPatientId && invClinicId) {
                const paymentIntentId =
                  typeof (invoice as any).payment_intent === 'string'
                    ? (invoice as any).payment_intent
                    : (invoice as any).payment_intent?.id;
                const isFirst = checkIfFirstPaymentForSalesRep
                  ? await checkIfFirstPaymentForSalesRep(invPatientId, paymentIntentId || undefined)
                  : true;

                const billingReason = (invoice as any).billing_reason as string | undefined;
                const isRecurringInvoice =
                  billingReason === 'subscription_cycle' ||
                  billingReason === 'subscription_update';

                salesRepCommResult = await processPaymentForSalesRepCommission({
                  clinicId: invClinicId,
                  patientId: invPatientId,
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
            }
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to process sales rep commission for invoice', {
              error: e instanceof Error ? e.message : 'Unknown error',
              invoiceId: invoice.id,
            });
          }
        }

        return {
          success: true,
          details: {
            invoiceId: invoice.id,
            status: invoice.status,
            subscriptionRefillTriggered: refillTriggered,
            addonInvoiceCreated,
            billingReason: invoice.billing_reason,
            salesRepCommission: salesRepCommResult ? 'processed' : 'skipped',
          },
        };
      }

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
        const piInvoice = (paymentIntent as Stripe.PaymentIntent & { invoice?: string | null })
          .invoice;

        // Skip if this is an invoice payment (handled by invoice.payment_succeeded)
        if (piInvoice) {
          return {
            success: true,
            details: { skipped: true, reason: 'Has associated invoice' },
          };
        }

        // Connect clinics handle invoice creation via their own automation (e.g. Airtable)
        if (skipInvoiceCreation) {
          logger.info('[STRIPE WEBHOOK] Skipping invoice creation for Connect event (handled by external automation)', {
            eventId: event.id,
            paymentIntentId: paymentIntent.id,
            clinicId: resolvedClinicId,
          });
          try {
            await StripePaymentService.updatePaymentFromIntent(paymentIntent);
          } catch (updateErr) {
            logger.error('[STRIPE WEBHOOK] Failed to update payment from intent', {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
              error: updateErr instanceof Error ? updateErr.message : 'Unknown error',
            });
          }
          return {
            success: true,
            details: { skipped: true, reason: 'Connect event — invoice created by external automation' },
          };
        }

        // PaymentIntents created by the Process Payment form (process/confirm routes)
        // include metadata.paymentId. Those routes handle their own invoice creation,
        // so the webhook must only update the payment status — calling processStripePayment
        // would create a duplicate payment + invoice record (race condition).
        const isProcessFormPayment = !!paymentIntent.metadata?.paymentId;
        if (isProcessFormPayment) {
          logger.info('[STRIPE WEBHOOK] PaymentIntent from Process Payment form — updating status only', {
            eventId: event.id,
            paymentIntentId: paymentIntent.id,
            paymentId: paymentIntent.metadata.paymentId,
          });
          try {
            await StripePaymentService.updatePaymentFromIntent(paymentIntent);
          } catch (updateErr) {
            logger.error('[STRIPE WEBHOOK] Failed to update process-form payment from intent', {
              eventId: event.id,
              paymentIntentId: paymentIntent.id,
              error: updateErr instanceof Error ? updateErr.message : 'Unknown error',
            });
          }

          // Still process commissions for the matched patient
          let commissionResult = null;
          const rawPaymentId = parseInt(paymentIntent.metadata.paymentId, 10);
          const rawPatientId = paymentIntent.metadata.patientId
            ? parseInt(paymentIntent.metadata.patientId, 10)
            : NaN;
          if (!Number.isNaN(rawPatientId) && rawPatientId > 0) {
            const patientForComm = await prisma.patient.findUnique({
              where: { id: rawPatientId },
              select: { id: true, clinicId: true },
            });
            if (patientForComm?.clinicId && processPaymentForCommission) {
              try {
                const isFirstPayment = checkIfFirstPayment
                  ? await checkIfFirstPayment(patientForComm.id, paymentIntent.id)
                  : true;
                commissionResult = await processPaymentForCommission({
                  clinicId: patientForComm.clinicId,
                  patientId: patientForComm.id,
                  stripeEventId: event.id,
                  stripeObjectId: paymentIntent.id,
                  stripeEventType: event.type,
                  amountCents: paymentIntent.amount,
                  occurredAt: new Date(paymentIntent.created * 1000),
                  isFirstPayment,
                });
              } catch (e) {
                logger.warn('[STRIPE WEBHOOK] Failed to process commission for process-form payment', {
                  error: e instanceof Error ? e.message : 'Unknown error',
                  patientId: patientForComm.id,
                });
              }
            }
            if (patientForComm?.clinicId && processPaymentForSalesRepCommission) {
              try {
                const isFirst = checkIfFirstPaymentForSalesRep
                  ? await checkIfFirstPaymentForSalesRep(patientForComm.id, paymentIntent.id)
                  : true;
                await processPaymentForSalesRepCommission({
                  clinicId: patientForComm.clinicId,
                  patientId: patientForComm.id,
                  stripeEventId: event.id,
                  stripeObjectId: paymentIntent.id,
                  stripeEventType: event.type,
                  amountCents: paymentIntent.amount,
                  occurredAt: new Date(paymentIntent.created * 1000),
                  isFirstPayment: isFirst,
                });
              } catch (e) {
                logger.warn('[STRIPE WEBHOOK] Failed to process sales rep commission for process-form payment', {
                  error: e instanceof Error ? e.message : 'Unknown error',
                  patientId: patientForComm.id,
                });
              }
            }

            if (patientForComm?.clinicId && autoMatchPendingRefillsForPatient) {
              try {
                await autoMatchPendingRefillsForPatient(
                  patientForComm.id,
                  patientForComm.clinicId,
                  paymentIntent.id,
                );
              } catch (e) {
                logger.warn('[STRIPE WEBHOOK] Failed to auto-match refills for process-form payment', {
                  error: e instanceof Error ? e.message : 'Unknown error',
                  patientId: patientForComm.id,
                });
              }
            }
          }

          return {
            success: true,
            details: {
              paymentIntentId: paymentIntent.id,
              processFormPayment: true,
              paymentId: rawPaymentId,
              commissionCreated: commissionResult?.commissionEventId ? true : false,
            },
          };
        }

        const intentPaymentData = await extractPaymentDataFromPaymentIntent(paymentIntent);
        if (resolvedClinicId > 0 && !intentPaymentData.metadata?.clinicId) {
          intentPaymentData.metadata = { ...intentPaymentData.metadata, clinicId: String(resolvedClinicId) };
        }
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

        if (result.patient?.id && result.patient?.clinicId && processPaymentForSalesRepCommission) {
          try {
            const isFirst = checkIfFirstPaymentForSalesRep
              ? await checkIfFirstPaymentForSalesRep(result.patient.id, paymentIntent.id)
              : true;
            await processPaymentForSalesRepCommission({
              clinicId: result.patient.clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: paymentIntent.id,
              stripeEventType: event.type,
              amountCents: paymentIntent.amount,
              occurredAt: new Date(paymentIntent.created * 1000),
              isFirstPayment: isFirst,
            });
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to process sales rep commission', {
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

        // Connect clinics handle invoice creation via their own automation (e.g. Airtable)
        if (skipInvoiceCreation) {
          logger.info('[STRIPE WEBHOOK] Skipping invoice creation for Connect charge event', {
            eventId: event.id,
            chargeId: charge.id,
            clinicId: resolvedClinicId,
          });
          return {
            success: true,
            details: { skipped: true, reason: 'Connect event — invoice created by external automation' },
          };
        }

        const chargePaymentData = extractPaymentDataFromCharge(charge);
        if (resolvedClinicId > 0 && !chargePaymentData.metadata?.clinicId) {
          chargePaymentData.metadata = { ...chargePaymentData.metadata, clinicId: String(resolvedClinicId) };
        }
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
        const chargeId =
          'charge' in eventObject && typeof eventObject.charge === 'string'
            ? eventObject.charge
            : eventObject.id;

        logger.info('[STRIPE WEBHOOK] Processing refund/dispute for commission reversal', {
          eventType: event.type,
          chargeId,
        });

        // Reverse affiliate commission if applicable
        if (reverseCommissionForRefund) {
          try {
            const { prisma } = await import('@/lib/db');
            const payment = await prisma.payment.findFirst({
              where: { stripeChargeId: chargeId },
              select: { clinicId: true },
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

              // Reverse sales rep commission too
              if (reverseSalesRepCommission) {
                await reverseSalesRepCommission({
                  clinicId: payment.clinicId,
                  stripeEventId: event.id,
                  stripeObjectId: chargeId,
                  stripeEventType: event.type,
                  amountCents,
                  occurredAt: new Date(),
                  reason: event.type === 'charge.dispute.created' ? 'chargeback' : 'refund',
                });
              }
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

        // Connect clinics handle invoice creation via their own automation (e.g. Airtable)
        if (skipInvoiceCreation) {
          logger.info('[STRIPE WEBHOOK] Skipping invoice creation for Connect checkout session', {
            eventId: event.id,
            sessionId: session.id,
            clinicId: resolvedClinicId,
          });
          return {
            success: true,
            details: { skipped: true, reason: 'Connect event — invoice created by external automation' },
          };
        }

        const sessionPaymentData = extractPaymentDataFromCheckoutSession(session);
        if (resolvedClinicId > 0 && !sessionPaymentData.metadata?.clinicId) {
          sessionPaymentData.metadata = { ...sessionPaymentData.metadata, clinicId: String(resolvedClinicId) };
        }
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

        if (result.patient?.id && result.patient?.clinicId && processPaymentForSalesRepCommission) {
          try {
            const isFirst = checkIfFirstPaymentForSalesRep
              ? await checkIfFirstPaymentForSalesRep(result.patient.id)
              : true;
            await processPaymentForSalesRepCommission({
              clinicId: result.patient.clinicId,
              patientId: result.patient.id,
              stripeEventId: event.id,
              stripeObjectId: session.id,
              stripeEventType: event.type,
              amountCents: session.amount_total || 0,
              occurredAt: new Date(session.created * 1000),
              isFirstPayment: isFirst,
            });
          } catch (e) {
            logger.warn('[STRIPE WEBHOOK] Failed to process sales rep commission', {
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
              (session.payment_intent as string) || undefined,
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
        const { syncSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const connectAcct = (event as Stripe.Event & { account?: string }).account;
        const result = await syncSubscriptionFromStripe(subscription, event.id, {
          clinicId: resolvedClinicId > 0 ? resolvedClinicId : undefined,
          stripeAccountId: connectAcct || undefined,
        });
        if (!result.success) {
          return {
            success: false,
            error: result.error ?? 'Subscription sync failed',
            details: {
              stripeSubscriptionId: subscription.id,
              subscriptionId: result.subscriptionId,
            },
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
        const { cancelSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const canceledAt = subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : new Date();
        const result = await cancelSubscriptionFromStripe(subscription.id, canceledAt);

        // Cancel all active refills for this subscription
        let refillsCanceled = 0;
        if (result.subscriptionId) {
          try {
            const { cancelRefillsForSubscription } =
              await import('@/services/refill/refillQueueService');
            refillsCanceled = await cancelRefillsForSubscription(
              result.subscriptionId,
              'Subscription deleted in Stripe'
            );
          } catch (refillErr) {
            logger.error('[STRIPE WEBHOOK] Failed to cancel refills for deleted subscription', {
              subscriptionId: result.subscriptionId,
              error: refillErr instanceof Error ? refillErr.message : 'Unknown',
            });
          }
        }

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
            refillsCanceled,
          },
        };
      }

      case 'customer.subscription.paused': {
        const subscription = event.data.object as Stripe.Subscription;
        const { syncSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const connectAcctP = (event as Stripe.Event & { account?: string }).account;
        const syncResult = await syncSubscriptionFromStripe(subscription, event.id, {
          clinicId: resolvedClinicId > 0 ? resolvedClinicId : undefined,
          stripeAccountId: connectAcctP || undefined,
        });
        if (!syncResult.success) {
          return {
            success: false,
            error: syncResult.error ?? 'Subscription sync failed',
            details: { stripeSubscriptionId: subscription.id },
          };
        }

        // Hold all active refills
        let refillsHeld = 0;
        if (syncResult.subscriptionId) {
          try {
            const { holdRefillsForSubscription } =
              await import('@/services/refill/refillQueueService');
            refillsHeld = await holdRefillsForSubscription(
              syncResult.subscriptionId,
              'Subscription paused'
            );
          } catch (refillErr) {
            logger.error('[STRIPE WEBHOOK] Failed to hold refills for paused subscription', {
              subscriptionId: syncResult.subscriptionId,
              error: refillErr instanceof Error ? refillErr.message : 'Unknown',
            });
          }
        }

        return {
          success: true,
          details: {
            eventType: event.type,
            subscriptionId: syncResult.subscriptionId,
            refillsHeld,
          },
        };
      }

      case 'customer.subscription.resumed': {
        const subscription = event.data.object as Stripe.Subscription;
        const { syncSubscriptionFromStripe } =
          await import('@/services/stripe/subscriptionSyncService');
        const connectAcctR = (event as Stripe.Event & { account?: string }).account;
        const syncResult = await syncSubscriptionFromStripe(subscription, event.id, {
          clinicId: resolvedClinicId > 0 ? resolvedClinicId : undefined,
          stripeAccountId: connectAcctR || undefined,
        });
        if (!syncResult.success) {
          return {
            success: false,
            error: syncResult.error ?? 'Subscription sync failed',
            details: { stripeSubscriptionId: subscription.id },
          };
        }

        // Schedule a new refill for the resumed subscription
        let refillTriggered = false;
        if (syncResult.subscriptionId) {
          try {
            const { triggerRefillForSubscriptionPayment } =
              await import('@/services/refill/refillQueueService');
            const refill = await triggerRefillForSubscriptionPayment(syncResult.subscriptionId);
            refillTriggered = !!refill;
          } catch (refillErr) {
            logger.error('[STRIPE WEBHOOK] Failed to trigger refill for resumed subscription', {
              subscriptionId: syncResult.subscriptionId,
              error: refillErr instanceof Error ? refillErr.message : 'Unknown',
            });
          }
        }

        return {
          success: true,
          details: {
            eventType: event.type,
            subscriptionId: syncResult.subscriptionId,
            refillTriggered,
          },
        };
      }

      case 'customer.subscription.trial_will_end': {
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

      // ================================================================
      // Payment Method Events — sync saved cards to patient profiles
      // ================================================================
      case 'payment_method.attached': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodAttached } =
          await import('@/services/stripe/cardSyncService');
        const attachResult = await handlePaymentMethodAttached(pm, resolvedClinicId);
        if (!attachResult.success) {
          return { success: false, error: attachResult.error, details: { paymentMethodId: pm.id } };
        }
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: attachResult.action },
        };
      }

      case 'payment_method.detached': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodDetached } =
          await import('@/services/stripe/cardSyncService');
        const detachResult = await handlePaymentMethodDetached(pm);
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: detachResult.action },
        };
      }

      case 'payment_method.updated': {
        const pm = event.data.object as Stripe.PaymentMethod;
        const { handlePaymentMethodUpdated } =
          await import('@/services/stripe/cardSyncService');
        const updateResult = await handlePaymentMethodUpdated(pm);
        return {
          success: true,
          details: { paymentMethodId: pm.id, action: updateResult.action },
        };
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

    // Store in WebhookLog table as failed event (parse payload safely to avoid double throw)
    const { safeParseJsonString } = await import('@/lib/utils/safe-json');
    const payload: unknown = rawBody ? safeParseJsonString<Record<string, unknown>>(rawBody) : null;
    await prisma.webhookLog.create({
      data: {
        source: 'stripe',
        eventId: event.id,
        eventType: event.type,
        status: 'ERROR',
        errorMessage: error,
        payload: payload as any,
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

async function alertPaymentFailure(event: Stripe.Event, error: string): Promise<void> {
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
