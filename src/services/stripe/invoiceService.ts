import { stripe, getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import type { InvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';
import { triggerAutomation, AutomationTrigger } from '@/lib/email/automations';

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

    // Send via Stripe
    const sentInvoice = await stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId);

    logger.debug(`[STRIPE] Sent invoice ${invoice.stripeInvoiceId}`);

    // Send payment link email to patient
    if (invoice.patient?.email && sentInvoice.hosted_invoice_url) {
      try {
        await triggerAutomation({
          trigger: AutomationTrigger.INVOICE_SENT,
          recipientEmail: invoice.patient.email,
          data: {
            patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
            invoiceNumber: sentInvoice.number || invoice.stripeInvoiceId,
            amount: (invoice.amountDue / 100).toFixed(2),
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
    const invoice = await prisma.invoice.findUnique({
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

    if (!invoice) {
      logger.warn(`[STRIPE] Invoice ${stripeInvoice.id} not found in database`);
      return;
    }

    const wasPaid = stripeInvoice.status === 'paid';
    const wasNotPaidBefore = invoice.status !== 'PAID';

    // Update invoice
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

    // Send receipt email when invoice is paid
    if (wasPaid && wasNotPaidBefore && invoice.patient?.email) {
      try {
        await triggerAutomation({
          trigger: AutomationTrigger.PAYMENT_RECEIVED,
          recipientEmail: invoice.patient.email,
          data: {
            patientName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
            customerName: `${invoice.patient.firstName} ${invoice.patient.lastName}`,
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
  }

  /**
   * Create subscriptions from paid invoice items that have recurring products
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

      for (const item of recurringItems) {
        const product = item.product;

        try {
          // Create Stripe subscription
          const subscription = await stripeClient.subscriptions.create({
            customer: patient.stripeCustomerId,
            items: [{ price: product.stripePriceId }],
            trial_period_days: product.trialDays || undefined,
            metadata: {
              patientId: patient.id.toString(),
              productId: product.id.toString(),
              invoiceId: invoice.id.toString(),
              clinicId: invoice.clinicId?.toString() || '',
            },
          });

          // Create subscription record in database
          const intervalMap: Record<string, string> = {
            WEEKLY: 'week',
            MONTHLY: 'month',
            QUARTERLY: 'month',
            SEMI_ANNUAL: 'month',
            ANNUAL: 'year',
          };

          await prisma.subscription.create({
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

          logger.info(
            `[STRIPE] Created subscription ${subscription.id} for patient ${patient.id}, product ${product.name}`
          );
        } catch (subError: any) {
          logger.error(
            `[STRIPE] Failed to create subscription for product ${product.id}:`,
            subError.message
          );
        }
      }

      // Mark invoice as having created subscriptions
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { subscriptionCreated: true },
      });
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
