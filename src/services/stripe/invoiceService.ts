import { stripe, getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { prisma } from '@/lib/db';
import { StripeCustomerService } from './customerService';
import type Stripe from 'stripe';
import type { InvoiceStatus } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface InvoiceLineItem {
  description: string;
  amount: number; // Amount in cents
  quantity?: number;
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
      // Stripe requires either 'amount' (total) OR 'unit_amount' with 'quantity', not both
      // Use unit_amount when quantity is specified, otherwise use amount directly
      const quantity = item.quantity || 1;

      await stripeClient.invoiceItems.create({
        customer: customer.id,
        invoice: stripeInvoice.id,
        description: item.description,
        unit_amount: item.amount, // Per-unit amount in cents
        currency: STRIPE_CONFIG.currency,
        quantity: quantity,
        metadata: item.metadata,
      });
    }
    
    // Finalize the invoice
    const finalizedInvoice = await stripeClient.invoices.finalizeInvoice(stripeInvoice.id);
    
    // Auto-send if requested
    if (options.autoSend) {
      await stripeClient.invoices.sendInvoice(finalizedInvoice.id);
    }
    
    // Calculate total amount
    const totalAmount = options.lineItems.reduce(
      (sum, item) => sum + (item.amount * (item.quantity || 1)),
      0
    );
    
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
        dueDate: finalizedInvoice.due_date 
          ? new Date(finalizedInvoice.due_date * 1000)
          : undefined,
        lineItems: JSON.parse(JSON.stringify(options.lineItems)),
        metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : undefined,
        orderId: options.orderId,
      },
    });
    
    logger.debug(`[STRIPE] Created invoice ${finalizedInvoice.id} for patient ${options.patientId}`);
    
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
    
    // Get invoice from database
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    
    if (!invoice) {
      throw new Error(`Invoice with ID ${invoiceId} not found`);
    }
    
    // Send via Stripe
    await stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId);
    
    logger.debug(`[STRIPE] Sent invoice ${invoice.stripeInvoiceId}`);
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
    });
    
    if (!invoice) {
      logger.warn(`[STRIPE] Invoice ${stripeInvoice.id} not found in database`);
      return;
    }
    
    // Update invoice
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: this.mapStripeStatus(stripeInvoice.status),
        amountDue: stripeInvoice.amount_due,
        amountPaid: stripeInvoice.amount_paid,
        stripeInvoiceUrl: stripeInvoice.hosted_invoice_url || undefined,
        stripePdfUrl: stripeInvoice.invoice_pdf || undefined,
        paidAt: stripeInvoice.status === 'paid' && stripeInvoice.status_transitions?.paid_at
          ? new Date(stripeInvoice.status_transitions.paid_at * 1000)
          : undefined,
      },
    });
    
    logger.debug(`[STRIPE] Updated invoice ${stripeInvoice.id} from webhook`);
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
      lineItems: [{
        description: 'Telehealth Consultation - Weight Management Program',
        amount,
      }],
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
