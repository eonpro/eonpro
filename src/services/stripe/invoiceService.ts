import { getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { getStripeForClinic, stripeRequestOptions } from '@/lib/stripe/connect';
import { prisma } from '@/lib/db';
import { StripeCustomerService } from './customerService';
import { decryptPatientPHI, DEFAULT_PHI_FIELDS } from '@/lib/security/phi-encryption';
import { deduplicateShipping } from '@/services/billing/shippingDedup';
import type Stripe from 'stripe';
import type { InvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { triggerAutomation, AutomationTrigger } from '@/lib/email/automations';
import { ensureSoapNoteExists } from '@/lib/soap-note-automation';
import { findPatientByEmail } from '@/services/stripe/paymentMatchingService';
import { decryptPHI } from '@/lib/security/phi-encryption';
import {
  shouldAutoCreateConnectInvoice,
  isRenewalBillingReason,
} from '@/services/stripe/connectInvoiceGuard';
import * as Sentry from '@sentry/nextjs';

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
  clinicId?: number;
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
   * Create an invoice for a patient.
   * When clinicId is provided, routes to the correct Stripe account
   * (Connected, Dedicated, or Platform) via getStripeForClinic().
   */
  static async createInvoice(options: CreateInvoiceOptions): Promise<{
    invoice: any;
    stripeInvoice: Stripe.Invoice;
  }> {
    // Resolve clinic from patient if not provided
    let clinicId = options.clinicId;
    if (!clinicId) {
      const patient = await prisma.patient.findUnique({
        where: { id: options.patientId },
        select: { clinicId: true },
      });
      clinicId = patient?.clinicId ?? undefined;
    }

    let stripeClient: Stripe;
    let stripeOpts: Stripe.RequestOptions | undefined;

    if (clinicId) {
      const ctx = await getStripeForClinic(clinicId);
      stripeClient = ctx.stripe;
      stripeOpts = stripeRequestOptions(ctx);
    } else {
      stripeClient = getStripe();
      stripeOpts = undefined;
    }

    // Get or create Stripe customer on the correct account
    let customer: Stripe.Customer;
    if (stripeOpts) {
      const patient = await prisma.patient.findUnique({ where: { id: options.patientId } });
      if (!patient) throw new Error('Patient not found');

      let decrypted: Record<string, unknown> = patient as Record<string, unknown>;
      try {
        decrypted = decryptPatientPHI(
          patient as Record<string, unknown>,
          DEFAULT_PHI_FIELDS as unknown as string[]
        );
      } catch {
        /* use raw */
      }

      const email = (decrypted.email as string) || '';
      const name = `${decrypted.firstName || ''} ${decrypted.lastName || ''}`.trim();

      if (email) {
        const existing = await stripeClient.customers.list({ email, limit: 1 }, stripeOpts);
        if (existing.data.length > 0) {
          customer = existing.data[0];
        } else {
          customer = await stripeClient.customers.create(
            {
              email,
              name: name || undefined,
              metadata: { patientId: options.patientId.toString() },
            },
            stripeOpts
          );
        }
      } else {
        customer = await stripeClient.customers.create(
          { name: name || undefined, metadata: { patientId: options.patientId.toString() } },
          stripeOpts
        );
      }
    } else {
      customer = await StripeCustomerService.getOrCreateCustomerForContext(
        options.patientId,
        stripeClient
      );
    }

    // Shipping dedup: strip duplicate shipping for same-day addon orders
    const { items: dedupedLineItems } = await deduplicateShipping(
      options.lineItems as any,
      options.patientId,
      clinicId
    );
    options = { ...options, lineItems: dedupedLineItems as unknown as InvoiceLineItem[] };

    const stripeInvoice = await stripeClient.invoices.create(
      {
        customer: customer.id,
        description: options.description,
        collection_method: STRIPE_CONFIG.collectionMethod,
        days_until_due: options.dueInDays || STRIPE_CONFIG.invoiceDueDays,
        auto_advance: false,
        metadata: {
          patientId: options.patientId.toString(),
          ...(clinicId ? { clinicId: clinicId.toString() } : {}),
          orderId: options.orderId?.toString() || '',
          ...options.metadata,
        } as any,
      },
      stripeOpts
    );

    for (const item of options.lineItems) {
      await stripeClient.invoiceItems.create(
        {
          customer: customer.id,
          invoice: stripeInvoice.id,
          description:
            item.quantity && item.quantity > 1
              ? `${item.description} (x${item.quantity})`
              : item.description,
          amount: item.amount,
          currency: STRIPE_CONFIG.currency,
          metadata: item.metadata,
        },
        stripeOpts
      );
    }

    const finalizedInvoice = await stripeClient.invoices.finalizeInvoice(
      stripeInvoice.id,
      {},
      stripeOpts
    );

    if (options.autoSend) {
      await stripeClient.invoices.sendInvoice(finalizedInvoice.id, {}, stripeOpts);
    }

    const totalAmount = options.lineItems.reduce((sum, item) => sum + item.amount, 0);

    const dbInvoice = await prisma.invoice.create({
      data: {
        stripeInvoiceId: finalizedInvoice.id,
        stripeInvoiceNumber: finalizedInvoice.number || undefined,
        stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url || undefined,
        stripePdfUrl: finalizedInvoice.invoice_pdf || undefined,
        patientId: options.patientId,
        clinicId: clinicId,
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
      `[STRIPE] Created invoice ${finalizedInvoice.id} for patient ${options.patientId} (clinic: ${clinicId || 'default'})`
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

    const clinicId = invoice.clinicId ?? invoice.patient?.clinicId ?? undefined;
    let stripeClient: Stripe;
    let stripeOpts: Stripe.RequestOptions | undefined;
    if (clinicId) {
      const ctx = await getStripeForClinic(clinicId);
      stripeClient = ctx.stripe;
      stripeOpts = stripeRequestOptions(ctx);
    } else {
      stripeClient = getStripe();
      stripeOpts = undefined;
    }

    // Send via Stripe
    const sentInvoice = stripeOpts
      ? await stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId, {}, stripeOpts)
      : await stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId);

    logger.debug(`[STRIPE] Sent invoice ${invoice.stripeInvoiceId}`);

    // Send payment link email to patient
    const decryptedEmail = safeDecryptField(invoice.patient?.email);
    if (decryptedEmail && sentInvoice.hosted_invoice_url) {
      try {
        await triggerAutomation({
          trigger: AutomationTrigger.INVOICE_SENT,
          recipientEmail: decryptedEmail,
          data: {
            patientName:
              `${safeDecryptField(invoice.patient?.firstName)} ${safeDecryptField(invoice.patient?.lastName)}`.trim(),
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
          error:
            emailError instanceof Error
              ? emailError instanceof Error
                ? emailError.message
                : String(emailError)
              : 'Unknown',
        });
      }
    }
  }

  /**
   * Void an invoice
   */
  static async voidInvoice(invoiceId: number): Promise<void> {
    // Get invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: { select: { clinicId: true } } },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    if (!invoice.stripeInvoiceId) {
      throw new Error(`Invoice ${invoiceId} has no Stripe invoice ID`);
    }

    const clinicId = invoice.clinicId ?? invoice.patient?.clinicId ?? undefined;
    let stripeClient: Stripe;
    let stripeOpts: Stripe.RequestOptions | undefined;
    if (clinicId) {
      const ctx = await getStripeForClinic(clinicId);
      stripeClient = ctx.stripe;
      stripeOpts = stripeRequestOptions(ctx);
    } else {
      stripeClient = getStripe();
      stripeOpts = undefined;
    }

    // Void in Stripe
    if (stripeOpts) {
      await stripeClient.invoices.voidInvoice(invoice.stripeInvoiceId, {}, stripeOpts);
    } else {
      await stripeClient.invoices.voidInvoice(invoice.stripeInvoiceId);
    }

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
    // Get invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: { select: { clinicId: true } } },
    });

    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }

    if (!invoice.stripeInvoiceId) {
      throw new Error(`Invoice ${invoiceId} has no Stripe invoice ID`);
    }

    const clinicId = invoice.clinicId ?? invoice.patient?.clinicId ?? undefined;
    let stripeClient: Stripe;
    let stripeOpts: Stripe.RequestOptions | undefined;
    if (clinicId) {
      const ctx = await getStripeForClinic(clinicId);
      stripeClient = ctx.stripe;
      stripeOpts = stripeRequestOptions(ctx);
    } else {
      stripeClient = getStripe();
      stripeOpts = undefined;
    }

    // Mark as uncollectible in Stripe
    if (stripeOpts) {
      await stripeClient.invoices.markUncollectible(invoice.stripeInvoiceId, {}, stripeOpts);
    } else {
      await stripeClient.invoices.markUncollectible(invoice.stripeInvoiceId);
    }

    // Update database
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'UNCOLLECTIBLE' },
    });

    logger.debug(`[STRIPE] Marked invoice ${invoice.stripeInvoiceId} as uncollectible`);
  }

  /**
   * Update invoice from Stripe webhook.
   *
   * @param stripeInvoice - The Stripe Invoice object from the webhook event
   * @param connectContext - Optional Connect account context for resolving customers
   *   on the correct Stripe account (required for WellMedR and other Connect clinics)
   */
  static async updateFromWebhook(
    stripeInvoice: Stripe.Invoice,
    connectContext?: { stripeAccountId?: string; clinicId?: number }
  ): Promise<void> {
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
    //
    // CONNECT EVENTS (WellMedR etc.): scoped by `billing_reason` (2026-04-22).
    //   • subscription_create / manual → owned by Airtable automation
    //     (/api/webhooks/wellmedr-invoice). Skip auto-create to avoid duplicates.
    //   • subscription_cycle / subscription_update / subscription_threshold →
    //     NO external automation fires. MUST auto-create or renewal invoices
    //     go missing from the patient profile and the provider Rx queue.
    // See `connectInvoiceGuard.ts` for the full decision matrix + unit tests.
    // ──────────────────────────────────────────────────────────────────────
    let wasAutoCreated = false;
    const isConnectInvoice = !!connectContext?.stripeAccountId;
    const connectShouldAutoCreate = shouldAutoCreateConnectInvoice(stripeInvoice, connectContext);

    if (!invoice && stripeInvoice.status === 'paid' && !isConnectInvoice) {
      const created = await this.createInvoiceFromStripeWebhook(stripeInvoice, connectContext);
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

    if (!invoice && stripeInvoice.status === 'paid' && isConnectInvoice && connectShouldAutoCreate) {
      // Belt-and-suspenders dedup: if Airtable (or any other path) already created
      // an Invoice for the same patient using the same Stripe PaymentMethod within
      // the last 24h, skip auto-create. The primary dedup is the stripeInvoiceId
      // unique index, but Airtable-created Invoices have stripeInvoiceId=null and
      // track the PaymentMethod in metadata.stripePaymentMethodId, so a secondary
      // check is required to avoid double-invoicing on the same charge.
      const airtableCreatedRecently = await this.findRecentConnectDuplicate(stripeInvoice);
      if (airtableCreatedRecently) {
        logger.info(
          '[STRIPE] Connect renewal matched a recent Airtable-created invoice — skipping auto-create',
          {
            stripeInvoiceId: stripeInvoice.id,
            existingInvoiceId: airtableCreatedRecently.id,
            billingReason: stripeInvoice.billing_reason,
          }
        );
        // Backfill stripeInvoiceId onto the existing record so future events resolve cleanly.
        try {
          await prisma.invoice.update({
            where: { id: airtableCreatedRecently.id },
            data: { stripeInvoiceId: stripeInvoice.id },
          });
        } catch (backfillErr) {
          // P2002 means another invoice already has this stripeInvoiceId — benign race.
          if ((backfillErr as { code?: string })?.code !== 'P2002') {
            logger.warn('[STRIPE] Failed to backfill stripeInvoiceId on deduped invoice', {
              invoiceId: airtableCreatedRecently.id,
              stripeInvoiceId: stripeInvoice.id,
              error: backfillErr instanceof Error ? backfillErr.message : 'Unknown',
            });
          }
        }
      } else {
        const created = await this.createInvoiceFromStripeWebhook(stripeInvoice, connectContext);
        if (created) {
          invoice = created;
          wasAutoCreated = true;
          logger.info('[STRIPE] Auto-created local invoice for Connect renewal', {
            invoiceId: created.id,
            stripeInvoiceId: stripeInvoice.id,
            patientId: created.patientId,
            amount: stripeInvoice.amount_paid,
            billingReason: stripeInvoice.billing_reason,
            connectAccountId: connectContext?.stripeAccountId?.substring(0, 12),
          });
        }
      }
    }

    if (!invoice && stripeInvoice.status === 'paid' && isConnectInvoice && !connectShouldAutoCreate) {
      // Expected skip (subscription_create / manual) — Airtable owns this path.
      // Log at DEBUG so production noise is minimal; unexpected skips (a renewal
      // reaching this branch) are impossible given the predicate, but the surprise
      // case below catches any future regression.
      logger.debug(
        '[STRIPE] Connect invoice skipped by design (owned by external automation)',
        {
          stripeInvoiceId: stripeInvoice.id,
          billingReason: stripeInvoice.billing_reason,
          connectAccountId: connectContext?.stripeAccountId?.substring(0, 12),
        }
      );

      // Regression tripwire: if billing_reason indicates a renewal but the
      // predicate returned false (e.g. someone narrowed RENEWAL_BILLING_REASONS
      // incorrectly), emit an ERROR + Sentry event so we find out instead of
      // silently losing data. This is the guardrail against repeating the
      // 2026-04-19 regression that dropped all WellMedR renewal invoices.
      if (isRenewalBillingReason(stripeInvoice.billing_reason)) {
        const tripwireContext = {
          stripeInvoiceId: stripeInvoice.id,
          billingReason: stripeInvoice.billing_reason,
          connectAccountId: connectContext?.stripeAccountId?.substring(0, 12),
        };
        logger.error(
          '[STRIPE] REGRESSION: Connect renewal reached skip branch — auto-create guard misconfigured',
          tripwireContext
        );
        try {
          Sentry.captureMessage(
            'Connect renewal invoice skipped by auto-create guard (regression)',
            {
              level: 'error',
              tags: {
                component: 'stripe-invoice-service',
                regression: 'connect-renewal-skip',
              },
              extra: tripwireContext,
            }
          );
        } catch {
          /* Sentry may not be initialized in some environments; don't crash */
        }
      }
    }

    if (!invoice) {
      logger.warn(`[STRIPE] Invoice ${stripeInvoice.id} not found and could not be auto-created`, {
        stripeInvoiceId: stripeInvoice.id,
        status: stripeInvoice.status,
        customerId:
          typeof stripeInvoice.customer === 'string'
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

    // Send receipt email when invoice is paid. Suppress for historical backfills
    // (tagged in metadata by `backfill-wellmedr-renewal-invoices.ts`) to avoid
    // spamming patients with receipts for months-old charges during a cleanup run.
    const invoiceMetadata = (invoice.metadata as Record<string, unknown> | null) || null;
    const isHistoricalBackfill = invoiceMetadata?.historicalBackfill === true;
    const receiptEmail = safeDecryptField(invoice.patient?.email);
    if (wasPaid && wasNotPaidBefore && receiptEmail && !isHistoricalBackfill) {
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
          error:
            emailError instanceof Error
              ? emailError instanceof Error
                ? emailError.message
                : String(emailError)
              : 'Unknown',
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
      } catch (soapError: unknown) {
        logger.warn(`[STRIPE] SOAP note generation failed for paid invoice`, {
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          error: (soapError as any).message,
        });
      }

      // Process affiliate commission (non-blocking)
      try {
        await this.processInvoiceCommission(invoice, stripeInvoice);
      } catch (commissionError) {
        logger.warn('[STRIPE] Affiliate commission processing failed for invoice (non-blocking)', {
          invoiceId: invoice.id,
          patientId: invoice.patientId,
          error:
            commissionError instanceof Error
              ? commissionError instanceof Error
                ? commissionError.message
                : String(commissionError)
              : 'Unknown',
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
            error:
              inviteErr instanceof Error
                ? inviteErr instanceof Error
                  ? inviteErr.message
                  : String(inviteErr)
                : 'Unknown',
          });
        }

        // Notify admins of the renewal payment (non-blocking)
        try {
          const { notificationEvents } = await import('@/services/notification/notificationEvents');
          const amountDollars = (stripeInvoice.amount_paid || 0) / 100;
          const patientName = invoice.patient
            ? `${safeDecryptField(invoice.patient.firstName)} ${safeDecryptField(invoice.patient.lastName)}`.trim() ||
              'Patient'
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
            error:
              notifErr instanceof Error
                ? notifErr instanceof Error
                  ? notifErr.message
                  : String(notifErr)
                : 'Unknown',
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
   * @param stripeInvoice - The Stripe Invoice object
   * @param connectContext - Optional Connect account context. When present, the
   *   customer lives on the connected account and must be retrieved using
   *   `stripeAccount` request options. Without this, Connect renewal invoices
   *   silently fail to resolve patients because the platform client cannot
   *   access Connect-scoped customers.
   *
   * Returns the created Invoice (with patient relation) or null if patient cannot be resolved.
   */
  /**
   * Belt-and-suspenders dedup for Connect renewals: find an Invoice created
   * in the last 24h by another path (typically Airtable) that corresponds to
   * the same underlying Stripe charge.
   *
   * Signal: `metadata.stripePaymentMethodId` — set by the WellMedR Airtable
   * webhook (`/api/webhooks/wellmedr-invoice`) on every Invoice it creates.
   * Matched against the payment method on the Stripe invoice's charge/PI.
   *
   * Only considers invoices with `stripeInvoiceId IS NULL` (not yet linked to
   * a Stripe invoice) to avoid false-positives with other Stripe-originated
   * invoices for the same patient.
   */
  private static async findRecentConnectDuplicate(
    stripeInvoice: Stripe.Invoice
  ): Promise<{ id: number; metadata: unknown } | null> {
    const charge = (stripeInvoice as Stripe.Invoice & { charge?: Stripe.Charge | string | null })
      .charge;
    const chargePaymentMethod =
      charge && typeof charge !== 'string' ? charge.payment_method : null;
    const pi = (
      stripeInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string | null }
    ).payment_intent;
    const piPaymentMethod =
      pi && typeof pi !== 'string' && pi.payment_method
        ? typeof pi.payment_method === 'string'
          ? pi.payment_method
          : pi.payment_method.id
        : null;
    const paymentMethodId =
      chargePaymentMethod && typeof chargePaymentMethod === 'string'
        ? chargePaymentMethod
        : piPaymentMethod;

    if (!paymentMethodId) return null;

    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const candidate = await prisma.invoice.findFirst({
        where: {
          stripeInvoiceId: null,
          createdAt: { gte: windowStart },
          metadata: { path: ['stripePaymentMethodId'], equals: paymentMethodId },
        },
        select: { id: true, metadata: true },
        orderBy: { createdAt: 'desc' },
      });
      return candidate;
    } catch (err) {
      logger.warn('[STRIPE] findRecentConnectDuplicate lookup failed (non-fatal)', {
        stripeInvoiceId: stripeInvoice.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return null;
    }
  }

  private static async createInvoiceFromStripeWebhook(
    stripeInvoice: Stripe.Invoice,
    connectContext?: { stripeAccountId?: string; clinicId?: number }
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

    // Email fallback: fetch Stripe customer email and match.
    // For Connect events (WellMedR etc.), the customer lives on the connected
    // Stripe account. We MUST use the Connect context to retrieve it; the
    // platform client will 404 on Connect-scoped customer IDs.
    if (!patient) {
      try {
        const metaClinicRaw = stripeInvoice.metadata?.clinicId;
        const metaClinicId =
          metaClinicRaw != null && metaClinicRaw !== '' ? parseInt(String(metaClinicRaw), 10) : NaN;

        // Determine the effective clinicId: metadata > connectContext > none
        const effectiveClinicId = Number.isFinite(metaClinicId) && metaClinicId > 0
          ? metaClinicId
          : connectContext?.clinicId && connectContext.clinicId > 0
            ? connectContext.clinicId
            : NaN;

        let stripeClient: Stripe;
        let stripeOpts: Stripe.RequestOptions | undefined;

        if (Number.isFinite(effectiveClinicId) && effectiveClinicId > 0) {
          const ctx = await getStripeForClinic(effectiveClinicId);
          stripeClient = ctx.stripe;
          stripeOpts = stripeRequestOptions(ctx);
        } else if (connectContext?.stripeAccountId) {
          // Connect event without resolved clinicId — use platform client
          // with explicit stripeAccount header so the customer retrieval
          // hits the correct connected account.
          stripeClient = getStripe();
          stripeOpts = { stripeAccount: connectContext.stripeAccountId };
        } else {
          stripeClient = getStripe();
          stripeOpts = undefined;
        }

        logger.debug('[STRIPE] Retrieving customer for invoice auto-create', {
          stripeInvoiceId: stripeInvoice.id,
          customerId,
          effectiveClinicId: Number.isFinite(effectiveClinicId) ? effectiveClinicId : 'none',
          hasConnectAccount: !!stripeOpts,
        });

        const stripeCustomer = stripeOpts
          ? await stripeClient.customers.retrieve(customerId, {}, stripeOpts)
          : await stripeClient.customers.retrieve(customerId);
        if (
          stripeCustomer &&
          !stripeCustomer.deleted &&
          'email' in stripeCustomer &&
          stripeCustomer.email
        ) {
          // Search within the correct clinic when context is available
          const searchClinicId = Number.isFinite(effectiveClinicId) ? effectiveClinicId : undefined;
          patient = await findPatientByEmail(
            stripeCustomer.email.trim().toLowerCase(),
            searchClinicId
          );
          if (patient) {
            // Link stripeCustomerId for fast-path on future events
            await prisma.patient.update({
              where: { id: patient.id },
              data: { stripeCustomerId: customerId },
            });
            logger.info(
              '[STRIPE] Linked stripeCustomerId via email fallback during invoice auto-create',
              {
                patientId: patient.id,
                stripeInvoiceId: stripeInvoice.id,
                clinicId: patient.clinicId,
              }
            );
          }
        }
      } catch (emailErr) {
        logger.warn('[STRIPE] Email fallback for invoice auto-create failed (non-blocking)', {
          stripeInvoiceId: stripeInvoice.id,
          connectAccountId: connectContext?.stripeAccountId?.substring(0, 12),
          error:
            emailErr instanceof Error
              ? emailErr.message
              : 'Unknown',
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

    const paidAt = stripeInvoice.status_transitions?.paid_at
      ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
      : new Date();

    const paymentIntentId =
      typeof (stripeInvoice as any).payment_intent === 'string'
        ? (stripeInvoice as any).payment_intent
        : (stripeInvoice as any).payment_intent?.id;

    // ──────────────────────────────────────────────────────────────────────
    // DEDUP: Multiple paths can create invoices for the same payment:
    //   1. WellMedR checkout webhook (processStripePayment on PI.succeeded)
    //   2. Airtable automation (/api/webhooks/wellmedr-invoice)
    //   3. This path (invoice.payment_succeeded → auto-create)
    //
    // Check in order of precision:
    //   a) Payment record with this PaymentIntent ID → its invoice
    //   b) Any recent unprocessed PAID invoice for this patient (72h window)
    //
    // When found, link the stripeInvoiceId to the existing invoice for
    // reconciliation and skip creating a duplicate.
    // ──────────────────────────────────────────────────────────────────────
    if (paymentIntentId) {
      const existingPayment = await prisma.payment.findUnique({
        where: { stripePaymentIntentId: paymentIntentId },
        include: {
          invoice: {
            include: { patient: true, items: { include: { product: true } } },
          },
        },
      });
      if (existingPayment?.invoice) {
        if (!existingPayment.invoice.stripeInvoiceId && stripeInvoice.id) {
          await prisma.invoice.update({
            where: { id: existingPayment.invoice.id },
            data: { stripeInvoiceId: stripeInvoice.id },
          }).catch(() => {});
        }
        logger.info(
          '[STRIPE] Skipping auto-create: Payment record already has invoice (PI dedup)',
          {
            existingInvoiceId: existingPayment.invoice.id,
            paymentIntentId,
            stripeInvoiceId: stripeInvoice.id,
            patientId: patient.id,
          }
        );
        return existingPayment.invoice;
      }
    }

    // Broader dedup: check for any recent PAID invoice for this patient
    // from Airtable or checkout webhook (catches race conditions and
    // cases where the Payment record doesn't have a PI match).
    {
      const recentExistingInvoice = await prisma.invoice.findFirst({
        where: {
          patientId: patient.id,
          clinicId: patient.clinicId,
          status: 'PAID',
          prescriptionProcessed: false,
          createdAt: { gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
          stripeInvoiceId: null,
        },
        include: { patient: true, items: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      });

      if (recentExistingInvoice) {
        await prisma.invoice.update({
          where: { id: recentExistingInvoice.id },
          data: { stripeInvoiceId: stripeInvoice.id },
        }).catch(() => {});

        logger.info(
          '[STRIPE] Skipping auto-create: recent PAID invoice exists (time-window dedup)',
          {
            existingInvoiceId: recentExistingInvoice.id,
            stripeInvoiceId: stripeInvoice.id,
            patientId: patient.id,
            existingSource: (recentExistingInvoice.metadata as any)?.source,
          }
        );

        return recentExistingInvoice;
      }
    }

    const subscriptionId =
      typeof (stripeInvoice as any).subscription === 'string'
        ? (stripeInvoice as any).subscription
        : (stripeInvoice as any).subscription?.id;

    // Compute refill month number for subscription renewals
    let renewalMonth: number | null = null;
    let localSubPlanDescription: string | null = null;
    if (subscriptionId) {
      try {
        const localSub = await prisma.subscription.findUnique({
          where: { stripeSubscriptionId: subscriptionId },
          select: { startDate: true, interval: true, intervalCount: true, planDescription: true },
        });
        if (localSub) {
          localSubPlanDescription = localSub.planDescription || null;

          if (stripeInvoice.billing_reason !== 'subscription_create') {
            const start = new Date(localSub.startDate);
            const totalMonths =
              localSub.interval === 'year' ? localSub.intervalCount * 12 : localSub.intervalCount;
            const monthsElapsed =
              (paidAt.getFullYear() - start.getFullYear()) * 12 +
              (paidAt.getMonth() - start.getMonth());
            renewalMonth = Math.max(2, Math.floor(monthsElapsed / totalMonths) + 1);
          }
        }
      } catch (err) {
        logger.warn(
          '[STRIPE] Could not compute renewal month / plan description for subscription invoice',
          {
            stripeInvoiceId: stripeInvoice.id,
            stripeSubscriptionId: subscriptionId,
            error: err instanceof Error ? err.message : String(err),
          }
        );
      }
    }

    // Build description from Stripe line items, enriched with refill month.
    // For trial invoices ($0 initial charge), Stripe auto-generates "Free trial for N × Product"
    // which is misleading — use the local subscription's plan description instead.
    const lines = stripeInvoice.lines?.data || [];
    const isTrialInvoice =
      stripeInvoice.billing_reason === 'subscription_create' &&
      (stripeInvoice.amount_paid === 0 || stripeInvoice.amount_due === 0);

    const rawDescription = (() => {
      if (isTrialInvoice && localSubPlanDescription) {
        return localSubPlanDescription;
      }
      return lines.length > 0
        ? lines.map((l) => l.description || 'Subscription').join(', ')
        : stripeInvoice.description || 'Subscription renewal';
    })();

    const description = renewalMonth
      ? `Subscription billed refill month ${renewalMonth}`
      : rawDescription;

    const lineItemDescription = (() => {
      if (renewalMonth) return `Subscription billed refill month ${renewalMonth}`;
      if (isTrialInvoice && localSubPlanDescription) return localSubPlanDescription;
      return null;
    })();

    const lineItemsJson = lines.map((l) => ({
      description: lineItemDescription || l.description || 'Subscription',
      amount: l.amount || 0,
      quantity: l.quantity || 1,
    }));

    try {
      const result = await prisma.$transaction(
        async (tx) => {
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
                ...(renewalMonth ? { renewalMonth } : {}),
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
        },
        { timeout: 15000 }
      );

      // Re-fetch with patient relation so downstream logic has full data
      const fullInvoice = await prisma.invoice.findUnique({
        where: { id: result.id },
        include: {
          patient: true,
          items: { include: { product: true } },
        },
      });

      return fullInvoice;
    } catch (createErr: unknown) {
      // P2002 = unique constraint violation — another process already created this invoice
      if ((createErr as any).code === 'P2002') {
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
        error: (createErr as any).message,
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
    invoice: {
      id: number;
      patientId: number;
      clinicId: number | null;
      stripeInvoiceId: string | null;
    },
    stripeInvoice: Stripe.Invoice
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
    const { processPaymentForCommission, checkIfFirstPayment } =
      await import('@/services/affiliate/affiliateCommissionService');

    const paymentIntentId =
      typeof (stripeInvoice as any).payment_intent === 'string'
        ? (stripeInvoice as any).payment_intent
        : (stripeInvoice as any).payment_intent?.id;

    const isFirstPayment = await checkIfFirstPayment(
      invoice.patientId,
      paymentIntentId || undefined
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
      const { patient } = invoice;
      const clinicId = invoice.clinicId ?? patient?.clinicId ?? undefined;
      let stripeClient: Stripe;
      let stripeOpts: Stripe.RequestOptions | undefined;
      if (clinicId) {
        const ctx = await getStripeForClinic(clinicId);
        stripeClient = ctx.stripe;
        stripeOpts = stripeRequestOptions(ctx);
      } else {
        stripeClient = getStripe();
        stripeOpts = undefined;
      }

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
          const subParams = {
            customer: patient.stripeCustomerId,
            items: [{ price: product.stripePriceId as string }],
            trial_period_days: product.trialDays || undefined,
            metadata: {
              patientId: patient.id.toString(),
              productId: product.id.toString(),
              invoiceId: invoice.id.toString(),
              clinicId: invoice.clinicId?.toString() || clinicId?.toString() || '',
            },
          };
          const subscription = stripeOpts
            ? await stripeClient.subscriptions.create(subParams, stripeOpts)
            : await stripeClient.subscriptions.create(subParams);

          stripeSubscriptions.push({ subscription, product });

          logger.info(
            `[STRIPE] Created Stripe subscription ${subscription.id} for patient ${patient.id}, product ${product.name}`
          );
        } catch (subError: unknown) {
          logger.error(
            `[STRIPE] Failed to create Stripe subscription for product ${product.id}:`,
            (subError as any).message
          );
        }
      }

      // Wrap all database operations in a transaction for atomicity
      if (stripeSubscriptions.length > 0) {
        await prisma.$transaction(
          async (tx) => {
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
          },
          { timeout: 15000 }
        );
      } else {
        // No subscriptions created, still mark invoice
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { subscriptionCreated: true },
        });
      }
    } catch (error: unknown) {
      logger.error(`[STRIPE] Error creating subscriptions from invoice:`, (error as any).message);
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
