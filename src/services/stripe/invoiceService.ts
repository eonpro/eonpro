import { stripe, getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import type { InvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { triggerAutomation, AutomationTrigger } from '@/lib/email/automations';
import { ensureSoapNoteExists } from '@/lib/soap-note-automation';
import { findPatientByEmail } from '@/services/stripe/paymentMatchingService';
import { decryptPHI } from '@/lib/security/phi-encryption';

function safeDecryptField(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parts = value.split(':');
    if (parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/]+=*$/.test(p) && p.length >= 2)) {
      return decryptPHI(value) || '';
    }
    return value;
  } catch {
    return '';
  }
}

export interface InvoiceLineItem {
  description: string;
  amount: number; // Total amount in cents for this line item (not per-unit)
  quantity?: number; // Optional: for display purposes only (e.g., "Item x2")
  metadata?: Record<string, string>;
}

export interface CreateInvoiceOptions {
  patientId: number;
  description?: string;
  lineItems: InvoiceLineItem[];
  dueInDays?: number;
  autoSend?: boolean;
  metadata?: Record<string, string>;
  orderId?: number;
}

/**
 * Service for managing Stripe invoices
 */
export class StripeInvoiceService {
  /**
   * Create an invoice for a patient
   */
  static async createInvoice(options: CreateInvoiceOptions): Promise<{
    invoice: any;
    stripeInvoice: Stripe.Invoice;
  }> {
    const stripeClient = getStripe();

    // Get or create Stripe customer
    const customer = await StripeCustomerService.getOrCreateCustomer(options.patientId);

    // Create invoice in Stripe
    const stripeInvoice = await stripeClient.invoices.create({
      customer: customer.id,
      description: options.description,
      collection_method: STRIPE_CONFIG.collectionMethod,
      days_until_due: options.dueInDays || STRIPE_CONFIG.invoiceDueDays,
      auto_advance: false, // Don't auto-finalize yet
      metadata: {
        patientId: options.patientId.toString(),
        orderId: options.orderId?.toString() || '',
        ...options.metadata,
      } as any,
    });

    // Add line items
    for (const item of options.lineItems) {
      // Stripe API: use 'amount' for total line item cost (cannot combine with 'quantity')
      // Our InvoiceLineItem.amount is the TOTAL cost, not per-unit price
      await stripeClient.invoiceItems.create({
        customer: customer.id,
        invoice: stripeInvoice.id,
        description:
          item.quantity && item.quantity > 1
            ? `${item.description} (x${item.quantity})`
            : item.description,
        amount: item.amount, // Total amount in cents for this line item
        currency: STRIPE_CONFIG.currency,
        metadata: item.metadata,
      });
    }

    // Finalize the invoice
    const finalizedInvoice = await stripeClient.invoices.finalizeInvoice(stripeInvoice.id);

    // Auto-send if requested
    if (options.autoSend) {
      await stripeClient.invoices.sendInvoice(finalizedInvoice.id);
    }

    // Calculate total amount (amount is already the total for each line item)
    const totalAmount = options.lineItems.reduce((sum, item) => sum + item.amount, 0);

    // Store invoice in database
    const dbInvoice = await prisma.invoice.create({
      data: {
        stripeInvoiceId: finalizedInvoice.id,
        stripeInvoiceNumber: finalizedInvoice.number || undefined,
        stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url || undefined,
        stripePdfUrl: finalizedInvoice.invoice_pdf || undefined,
        patientId: options.patientId,
        description: options.description || undefined,
        amountDue: totalAmount,
        currency: STRIPE_CONFIG.currency,
        status: this.mapStripeStatus(finalizedInvoice.status),
        dueDate: finalizedInvoice.due_date ? new Date(finalizedInvoice.due_date * 1000) : undefined,
        lineItems: JSON.parse(JSON.stringify(options.lineItems)),
        metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
        orderId: options.orderId,
      },
    });

    logger.debug(
      `[STRIPE] Created invoice ${finalizedInvoice.id} for patient ${options.patientId}`
    );

    return {
      invoice: dbInvoice,
      stripeInvoice: finalizedInvoice,
    };
  }

  /**
   * Send an invoice to a patient
   */
  static async sendInvoice(invoiceId: number): Promise<void> {
    const stripeClient = getStripe();

    // Get invoice from database with patient info
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: true },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    if (!invoice.stripeInvoiceId) {
      throw new Error(`Invoice ${invoiceId} has no Stripe invoice ID`);
    }

    // Send via Stripe
    const sentInvoice = await stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId);

    logger.debug(`[STRIPE] Sent invoice ${invoice.stripeInvoiceId}`);

    // Send payment link email to patient
    const decryptedEmail = safeDecryptField(invoice.patient?.email);
    if (decryptedEmail && sentInvoice.hosted_invoice_url) {
      try {
        await triggerAutomation({
          trigger: AutomationTrigger.INVOICE_SENT,
          recipientEmail: decryptedEmail,
          data: {
            patientName: `${safeDecryptField(invoice.patient?.firstName)} ${safeDecryptField(invoice.patient?.lastName)}`.trim(),
            invoiceNumber: sentInvoice.number || invoice.stripeInvoiceId,
            amount: ((invoice.amountDue || 0) / 100).toFixed(2),
            currency: invoice.currency?.toUpperCase() || 'USD',
            dueDate: invoice.dueDate
              ? new Date(invoice.dueDate).toLocaleDateString()
              : 'Upon receipt',
            paymentLink: sentInvoice.hosted_invoice_url,
            description: invoice.description || 'Medical Services',
          },
        });
        logger.info(`[STRIPE] Payment link email sent for invoice ${invoice.stripeInvoiceId}`);
      } catch (emailError) {
        logger.warn(`[STRIPE] Failed to send payment link email`, {
          invoiceId,
          error: emailError instanceof Error ? emailError.message : 'Unknown',
        });
      }
    }
  }

  /**
   * Void an invoice
   */
  static async voidInvoice(invoiceId: number): Promise<void> {
    const stripeClient = getStripe();

    // Get invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    if (!invoice.stripeInvoiceId) {
      throw new Error(`Invoice ${invoiceId} has no Stripe invoice ID`);
    }

    // Void in Stripe
    await stripeClient.invoices.voidInvoice(invoice.stripeInvoiceId);

    // Update database
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'VOID' },
    });

    logger.debug(`[STRIPE] Voided invoice ${invoice.stripeInvoiceId}`);
  }

  /**
   * Mark invoice as uncollectible
   */
  static async markUncollectible(invoiceId: number): Promise<void> {
    const stripeClient = getStripe();

    // Get invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    if (!invoice.stripeInvoiceId) {
      throw new Error(`Invoice ${invoiceId} has no Stripe invoice ID`);
    }

    // Mark as uncollectible in Stripe
    await stripeClient.invoices.markUncollectible(invoice.stripeInvoiceId);

    // Update database
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'UNCOLLECTIBLE' },
    });

    logger.debug(`[STRIPE] Marked invoice ${invoice.stripeInvoiceId} as uncollectible`);
  }

  /**
   * Update invoice from Stripe webhook
   */
  static async updateFromWebhook(stripeInvoice: Stripe.Invoice): Promise<void> {
    // Find invoice in database
    let invoice = await prisma.invoice.findUnique({
      where: { stripeInvoiceId: stripeInvoice.id },
      include: {
        patient: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });

    // ──────────────────────────────────────────────────────────────────────
    // AUTO-CREATE: When Stripe creates an invoice (subscription renewals,
    // Payment Links, etc.) there is no local record. Create one so that:
    //   • The payment appears on the patient's billing profile
    //   • Receipt email is sent
    //   • SOAP note is auto-generated
    //   • Affiliate commission is processed
    //   • Portal invite triggers
    // Idempotent: gated by stripeInvoiceId unique index.
    // ──────────────────────────────────────────────────────────────────────
    let wasAutoCreated = false;

    if (!invoice && stripeInvoice.status === 'paid') {
      const created = await this.createInvoiceFromStripeWebhook(stripeInvoice);
      if (created) {
        invoice = created;
        wasAutoCreated = true;
        logger.info('[STRIPE] Auto-created local invoice from Stripe webhook', {
          invoiceId: created.id,
          stripeInvoiceId: stripeInvoice.id,
          patientId: created.patientId,
          amount: stripeInvoice.amount_paid,
          billingReason: stripeInvoice.billing_reason,
        });
      }
    }

    if (!invoice) {
      logger.warn(`[STRIPE] Invoice ${stripeInvoice.id} not found and could not be auto-created`, {
        stripeInvoiceId: stripeInvoice.id,
        status: stripeInvoice.status,
        customerId: typeof stripeInvoice.customer === 'string'
          ? stripeInvoice.customer
          : stripeInvoice.customer?.id,
      });
      return;
    }

    const wasPaid = stripeInvoice.status === 'paid';
    // Auto-created invoices are born as PAID; treat them as newly paid
    const wasNotPaidBefore = wasAutoCreated || invoice.status !== 'PAID';

    // Update invoice (skip full update for just-created records to avoid redundant write)
    if (!wasAutoCreated) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: this.mapStripeStatus(stripeInvoice.status),
          amountDue: stripeInvoice.amount_due,
          amountPaid: stripeInvoice.amount_paid,
          stripeInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
          stripePdfUrl: stripeInvoice.invoice_pdf || undefined,
          paidAt:
            stripeInvoice.status === 'paid' && stripeInvoice.status_transitions?.paid_at
              ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
              : undefined,
        },
      });

      logger.debug(`[STRIPE] Updated invoice ${stripeInvoice.id} from webhook`);
    }

    // Send receipt email when invoice is paid
    const receiptEmail = safeDecryptField(invoice.patient?.email);
    if (wasPaid && wasNotPaidBefore && receiptEmail) {
      try {
        const decFirstName = safeDecryptField(invoice.patient?.firstName);
        const decLastName = safeDecryptField(invoice.patient?.lastName);
        const fullName = `${decFirstName} ${decLastName}`.trim();
        await triggerAutomation({
          trigger: AutomationTrigger.PAYMENT_RECEIVED,
          recipientEmail: receiptEmail,
          data: {
            patientName: fullName,
            customerName: fullName,
            invoiceNumber: stripeInvoice.number || stripeInvoice.id,
            amount: ((stripeInvoice.amount_paid || 0) / 100).toFixed(2),
            currency: (stripeInvoice.currency || 'usd').toUpperCase(),
            paidAt: new Date().toLocaleDateString(),
            receiptUrl: stripeInvoice.invoice_pdf || stripeInvoice.hosted_invoice_url,
            description: invoice.description || 'Medical Services',
          },
        });
        logger.info(`[STRIPE] Receipt email sent for invoice ${stripeInvoice.id}`);
      } catch (emailError) {
        logger.warn(`[STRIPE] Failed to send receipt email`, {
          invoiceId: invoice.id,
          error: emailError instanceof Error ? emailError.message : 'Unknown',
        });
      }
    }

    // If invoice just became paid, check if we need to create subscriptions
    if (wasPaid && wasNotPaidBefore && invoice.createSubscription && !invoice.subscriptionCreated) {
      await this.createSubscriptionsFromInvoice(invoice);
    }

    // CRITICAL: Ensure SOAP note exists for paid invoices ready for prescription
    if (wasPaid && wasNotPaidBefore) {
      try {
        const soapResult = await ensureSoapNoteExists(invoice.patientId, invoice.id);
        logger.info(`[STRIPE] SOAP note check for paid invoice`, {
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          soapAction: soapResult.action,
          soapNoteId: soapResult.soapNoteId,
        });
      } catch (soapError: any) {
        logger.warn(`[STRIPE] SOAP note generation failed for paid invoice`, {
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          error: soapError.message,
        });
      }

      // Process affiliate commission (non-blocking)
      try {
        await this.processInvoiceCommission(
          invoice,
          stripeInvoice,
        );
      } catch (commissionError) {
        logger.warn('[STRIPE] Affiliate commission processing failed for invoice (non-blocking)', {
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          error: commissionError instanceof Error ? commissionError.message : 'Unknown',
        });
      }

      // Auto-send portal invite on payment (always-on, all brands, non-blocking)
      if (wasAutoCreated) {
        try {
          const { triggerPortalInviteOnPayment } = await import('@/lib/portal-invite/service');
          await triggerPortalInviteOnPayment(invoice.patientId);
        } catch (inviteErr) {
          logger.warn('[STRIPE] Portal invite on renewal payment failed (non-fatal)', {
            invoiceId: invoice.id,
            patientId: invoice.patientId,
            error: inviteErr instanceof Error ? inviteErr.message : 'Unknown',
          });
        }

        // Notify admins of the renewal payment (non-blocking)
        try {
          const { notificationEvents } = await import('@/services/notification/notificationEvents');
          const amountDollars = (stripeInvoice.amount_paid || 0) / 100;
          const patientName = invoice.patient
            ? `${safeDecryptField(invoice.patient.firstName)} ${safeDecryptField(invoice.patient.lastName)}`.trim() || 'Patient'
            : 'Patient';
          await notificationEvents.paymentReceived({
            clinicId: invoice.clinicId || 0,
            patientId: invoice.patientId,
            patientName,
            amount: amountDollars,
            invoiceNumber: stripeInvoice.number || undefined,
          });
        } catch (notifErr) {
          logger.warn('[STRIPE] Payment notification for renewal failed (non-fatal)', {
            invoiceId: invoice.id,
            error: notifErr instanceof Error ? notifErr.message : 'Unknown',
          });
        }
      }
    }
  }

  /**
   * Create a local Invoice + Payment record from a Stripe-originated invoice.
   * Used for subscription renewals, Payment Links, and any Stripe-created invoice
   * that does not have a platform-created counterpart.
   *
   * Patient resolution: stripeCustomerId → email fallback (with Stripe Customer fetch).
   * Idempotent: protected by the stripeInvoiceId unique index.
   *
   * Returns the created Invoice (with patient relation) or null if patient cannot be resolved.
   */
  private static async createInvoiceFromStripeWebhook(
    stripeInvoice: Stripe.Invoice
  ): Promise<(any & { patient: any; items: any[] }) | null> {
    const customerId =
      typeof stripeInvoice.customer === 'string'
        ? stripeInvoice.customer
        : stripeInvoice.customer?.id;

    if (!customerId) {
      logger.warn('[STRIPE] Cannot auto-create invoice: no customer on Stripe invoice', {
        stripeInvoiceId: stripeInvoice.id,
      });
      return null;
    }

    // Resolve patient from Stripe customer
    let patient = await prisma.patient.findFirst({
      where: { stripeCustomerId: customerId },
    });

    // Email fallback: fetch Stripe customer email and match
    if (!patient) {
      try {
        const stripeClient = getStripe();
        const stripeCustomer = await stripeClient.customers.retrieve(customerId);
        if (stripeCustomer && !stripeCustomer.deleted && 'email' in stripeCustomer && stripeCustomer.email) {
          patient = await findPatientByEmail(stripeCustomer.email.trim().toLowerCase());
          if (patient) {
            // Link stripeCustomerId for fast-path on future events
            await prisma.patient.update({
              where: { id: patient.id },
              data: { stripeCustomerId: customerId },
            });
            logger.info('[STRIPE] Linked stripeCustomerId via email fallback during invoice auto-create', {
              patientId: patient.id,
              stripeInvoiceId: stripeInvoice.id,
            });
          }
        }
      } catch (emailErr) {
        logger.warn('[STRIPE] Email fallback for invoice auto-create failed (non-blocking)', {
          stripeInvoiceId: stripeInvoice.id,
          error: emailErr instanceof Error ? emailErr.message : 'Unknown',
        });
      }
    }

    if (!patient) {
      logger.info('[STRIPE] Cannot auto-create invoice: no patient matched for Stripe customer', {
        stripeInvoiceId: stripeInvoice.id,
        stripeCustomerId: customerId,
      });
      return null;
    }

    // Build description from Stripe line items
    const lines = stripeInvoice.lines?.data || [];
    const description = lines.length > 0
      ? lines.map((l) => l.description || 'Subscription').join(', ')
      : stripeInvoice.description || 'Subscription renewal';

    const lineItemsJson = lines.map((l) => ({
      description: l.description || 'Subscription',
      amount: l.amount || 0,
      quantity: l.quantity || 1,
    }));

    const paidAt = stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : new Date();

    const paymentIntentId =
      typeof (stripeInvoice as any).payment_intent === 'string'
        ? (stripeInvoice as any).payment_intent
        : (stripeInvoice as any).payment_intent?.id;

    const subscriptionId =
      typeof (stripeInvoice as any).subscription === 'string'
        ? (stripeInvoice as any).subscription
        : (stripeInvoice as any).subscription?.id;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const newInvoice = await tx.invoice.create({
          data: {
            patientId: patient!.id,
            clinicId: patient!.clinicId,
            stripeInvoiceId: stripeInvoice.id,
            stripeInvoiceNumber: stripeInvoice.number || undefined,
            stripeInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
            stripePdfUrl: stripeInvoice.invoice_pdf || undefined,
            description,
            amount: stripeInvoice.amount_paid || stripeInvoice.amount_due || 0,
            amountDue: 0,
            amountPaid: stripeInvoice.amount_paid || 0,
            currency: stripeInvoice.currency || 'usd',
            status: 'PAID' as InvoiceStatus,
            paidAt,
            lineItems: lineItemsJson as any,
            metadata: {
              source: 'stripe_webhook_auto_create',
              billingReason: stripeInvoice.billing_reason,
              stripeSubscriptionId: subscriptionId || undefined,
              paymentIntentId: paymentIntentId || undefined,
            } as any,
          },
        });

        // Create associated Payment record for full billing trail
        if (paymentIntentId) {
          // Guard: skip if payment record already exists (idempotent)
          const existingPayment = await tx.payment.findUnique({
            where: { stripePaymentIntentId: paymentIntentId },
          });
          if (!existingPayment) {
            await tx.payment.create({
              data: {
                patientId: patient!.id,
                clinicId: patient!.clinicId,
                invoiceId: newInvoice.id,
                stripePaymentIntentId: paymentIntentId,
                amount: stripeInvoice.amount_paid || 0,
                currency: stripeInvoice.currency || 'usd',
                status: 'SUCCEEDED',
                paidAt,
                description: `Auto-recorded: ${description}`,
              },
            });
          }
        }

        return newInvoice;
      }, { timeout: 15000 });

      // Re-fetch with patient relation so downstream logic has full data
      const fullInvoice = await prisma.invoice.findUnique({
        where: { id: result.id },
        include: {
          patient: true,
          items: { include: { product: true } },
        },
      });

      return fullInvoice;
    } catch (createErr: any) {
      // P2002 = unique constraint violation — another process already created this invoice
      if (createErr.code === 'P2002') {
        logger.info('[STRIPE] Invoice auto-create race: already exists (idempotent)', {
          stripeInvoiceId: stripeInvoice.id,
        });
        return await prisma.invoice.findUnique({
          where: { stripeInvoiceId: stripeInvoice.id },
          include: { patient: true, items: { include: { product: true } } },
        });
      }
      logger.error('[STRIPE] Failed to auto-create invoice from Stripe webhook', {
        stripeInvoiceId: stripeInvoice.id,
        patientId: patient.id,
        error: createErr.message,
      });
      return null;
    }
  }

  /**
   * Process affiliate commission when an invoice is paid.
   * Matches the invoice payment amount to the attributed affiliate's commission plan.
   * HIPAA-COMPLIANT: Only passes IDs and amounts, never patient data.
   */
  private static async processInvoiceCommission(
    invoice: { id: number; patientId: number; clinicId: number | null; stripeInvoiceId: string | null },
    stripeInvoice: Stripe.Invoice,
  ): Promise<void> {
    const clinicId = invoice.clinicId;
    if (!clinicId) {
      logger.debug('[STRIPE] Skipping commission - invoice has no clinicId', {
        invoiceId: invoice.id,
      });
      return;
    }

    // Check if patient has affiliate attribution
    const patient = await prisma.patient.findUnique({
      where: { id: invoice.patientId },
      select: {
        id: true,
        attributionAffiliateId: true,
      },
    });

    if (!patient?.attributionAffiliateId) {
      logger.debug('[STRIPE] Skipping commission - patient has no affiliate attribution', {
        invoiceId: invoice.id,
        patientId: invoice.patientId,
      });
      return;
    }

    const amountPaidCents = stripeInvoice.amount_paid || 0;
    if (amountPaidCents <= 0) {
      logger.debug('[STRIPE] Skipping commission - zero amount paid', {
        invoiceId: invoice.id,
      });
      return;
    }

    // Determine if this is the patient's first successful payment
    const { processPaymentForCommission, checkIfFirstPayment } = await import(
      '@/services/affiliate/affiliateCommissionService'
    );

    const paymentIntentId =
      typeof (stripeInvoice as any).payment_intent === 'string'
        ? (stripeInvoice as any).payment_intent
        : (stripeInvoice as any).payment_intent?.id;

    const isFirstPayment = await checkIfFirstPayment(
      invoice.patientId,
      paymentIntentId || undefined,
    );

    // Use the Stripe event ID derived from the invoice for idempotency
    const stripeEventId = `invoice_paid_${stripeInvoice.id}`;

    const commissionResult = await processPaymentForCommission({
      clinicId,
      patientId: invoice.patientId,
      stripeEventId,
      stripeObjectId: stripeInvoice.id,
      stripeEventType: 'invoice.payment_succeeded',
      amountCents: amountPaidCents,
      occurredAt: stripeInvoice.status_transitions?.paid_at
        ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
        : new Date(),
      isFirstPayment,
      isRecurring: false,
    });

    if (commissionResult.success && !commissionResult.skipped) {
      logger.info('[STRIPE] Affiliate commission created from invoice payment', {
        invoiceId: invoice.id,
        patientId: invoice.patientId,
        commissionEventId: commissionResult.commissionEventId,
        commissionAmountCents: commissionResult.commissionAmountCents,
        amountPaidCents,
      });
    } else if (commissionResult.skipped) {
      logger.debug('[STRIPE] Affiliate commission skipped for invoice', {
        invoiceId: invoice.id,
        reason: commissionResult.skipReason,
      });
    }
  }

  /**
   * Create subscriptions from paid invoice items that have recurring products
   * Uses a transaction to ensure all subscription records and invoice update are atomic
   */
  static async createSubscriptionsFromInvoice(invoice: any): Promise<void> {
    try {
      const stripeClient = getStripe();
      const { patient } = invoice;

      if (!patient?.stripeCustomerId) {
        logger.warn(`[STRIPE] Cannot create subscription - patient has no Stripe customer ID`);
        return;
      }

      // Find recurring products in invoice items
      const recurringItems =
        invoice.items?.filter(
          (item: any) => item.product?.billingType === 'RECURRING' && item.product?.stripePriceId
        ) || [];

      // Also check legacy lineItems JSON for product references
      const lineItems = invoice.lineItems || [];

      // Collect all Stripe subscriptions to create
      const stripeSubscriptions: Array<{ subscription: any; product: any }> = [];

      for (const item of recurringItems) {
        const product = item.product;

        try {
          if (!product.stripePriceId) {
            logger.warn(`[STRIPE] Skipping product ${product.id} - no Stripe price ID`);
            continue;
          }

          // Create Stripe subscription first (external API call)
          const subscription = await stripeClient.subscriptions.create({
            customer: patient.stripeCustomerId,
            items: [{ price: product.stripePriceId as string }],
            trial_period_days: product.trialDays || undefined,
            metadata: {
              patientId: patient.id.toString(),
              productId: product.id.toString(),
              invoiceId: invoice.id.toString(),
              clinicId: invoice.clinicId?.toString() || '',
            },
          });

          stripeSubscriptions.push({ subscription, product });

          logger.info(
            `[STRIPE] Created Stripe subscription ${subscription.id} for patient ${patient.id}, product ${product.name}`
          );
        } catch (subError: any) {
          logger.error(
            `[STRIPE] Failed to create Stripe subscription for product ${product.id}:`,
            subError.message
          );
        }
      }

      // Wrap all database operations in a transaction for atomicity
      if (stripeSubscriptions.length > 0) {
        await prisma.$transaction(async (tx) => {
          const intervalMap: Record<string, string> = {
            WEEKLY: 'week',
            MONTHLY: 'month',
            QUARTERLY: 'month',
            SEMI_ANNUAL: 'month',
            ANNUAL: 'year',
          };

          for (const { subscription, product } of stripeSubscriptions) {
            // Create subscription record in database
            await tx.subscription.create({
              data: {
                clinicId: invoice.clinicId,
                patientId: patient.id,
                planId: product.id.toString(),
                planName: product.name,
                planDescription: product.description || product.shortDescription || '',
                status: 'ACTIVE',
                amount: product.price,
                currency: product.currency || 'usd',
                interval: intervalMap[product.billingInterval || 'MONTHLY'] || 'month',
                intervalCount: product.billingIntervalCount || 1,
                startDate: new Date(),
                currentPeriodStart: new Date(),
                currentPeriodEnd: new Date(
                  (subscription as unknown as { current_period_end: number }).current_period_end *
                    1000
                ),
                nextBillingDate: new Date(
                  (subscription as unknown as { current_period_end: number }).current_period_end *
                    1000
                ),
                stripeSubscriptionId: subscription.id,
                metadata: { productId: product.id, invoiceId: invoice.id },
              },
            });
          }

          // Mark invoice as having created subscriptions
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { subscriptionCreated: true },
          });
        }, { timeout: 15000 });
      } else {
        // No subscriptions created, still mark invoice
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { subscriptionCreated: true },
        });
      }
    } catch (error: any) {
      logger.error(`[STRIPE] Error creating subscriptions from invoice:`, error.message);
    }
  }

  /**
   * Get invoices for a patient
   */
  static async getPatientInvoices(patientId: number) {
    return await prisma.invoice.findMany({
      where: { patientId },
      include: {
        payments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /**
   * Get invoice by ID
   */
  static async getInvoice(invoiceId: number) {
    return await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        patient: true,
        payments: true,
      },
    });
  }

  /**
   * Create common invoice types
   */
  static async createConsultationInvoice(
    patientId: number,
    amount: number,
    options?: Partial<CreateInvoiceOptions>
  ) {
    return await this.createInvoice({
      patientId,
      description: 'Medical Consultation',
      lineItems: [
        {
          description: 'Telehealth Consultation - Weight Management Program',
          amount,
        },
      ],
      autoSend: true,
      ...options,
    });
  }

  static async createPrescriptionInvoice(
    patientId: number,
    orderId: number,
    medications: Array<{ name: string; amount: number }>
  ) {
    const lineItems = medications.map((med: any) => ({
      description: `Prescription: ${med.name}`,
      amount: med.amount,
    }));

    return await this.createInvoice({
      patientId,
      orderId,
      description: 'Prescription Medications',
      lineItems,
      autoSend: true,
    });
  }

  static async createLabWorkInvoice(
    patientId: number,
    tests: Array<{ name: string; amount: number }>
  ) {
    const lineItems = tests.map((test: any) => ({
      description: `Lab Test: ${test.name}`,
      amount: test.amount,
    }));

    return await this.createInvoice({
      patientId,
      description: 'Laboratory Testing',
      lineItems,
      autoSend: true,
    });
  }

  /**
   * Map Stripe status to our enum
   */
  private static mapStripeStatus(stripeStatus: Stripe.Invoice.Status | null): InvoiceStatus {
    switch (stripeStatus) {
      case 'draft':
        return 'DRAFT';
      case 'open':
        return 'OPEN';
      case 'paid':
        return 'PAID';
      case 'void':
        return 'VOID';
      case 'uncollectible':
        return 'UNCOLLECTIBLE';
      default:
        return 'DRAFT';
    }
  }
}
