/**
 * COMPREHENSIVE INVOICE MANAGER
 * =============================
 * Stripe-level invoice management capabilities
 * 
 * Features:
 * - Full invoice lifecycle management (draft → open → paid/void/uncollectible)
 * - Line items with quantities, unit prices, discounts
 * - Tax calculations
 * - Partial payments & payment plans
 * - Credits and refunds
 * - Automated reminders
 * - Invoice templates
 * - Multi-currency support
 * - Comprehensive reporting
 */

import { prisma, basePrisma } from '@/lib/db';
import { getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { StripeCustomerService } from '@/services/stripe/customerService';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import type Stripe from 'stripe';
import type { InvoiceStatus, Prisma } from '@prisma/client';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number; // In cents
  discount?: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  taxRate?: number; // Percentage (e.g., 8.5 for 8.5%)
  metadata?: Record<string, string>;
}

export interface InvoiceDiscount {
  type: 'percentage' | 'fixed';
  value: number;
  description?: string;
  couponCode?: string;
}

export interface InvoiceTax {
  name: string;
  rate: number; // Percentage
  inclusive?: boolean;
}

export interface CreateInvoiceOptions {
  patientId: number;
  clinicId?: number;
  lineItems: LineItem[];
  
  // Optional fields
  description?: string;
  memo?: string;
  footer?: string;
  dueInDays?: number;
  dueDate?: Date;
  
  // Discounts & taxes
  discount?: InvoiceDiscount;
  taxes?: InvoiceTax[];
  
  // Settings
  autoSend?: boolean;
  autoCharge?: boolean;
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  
  // Custom fields
  customFields?: Record<string, string>;
  invoiceNumber?: string;
  poNumber?: string;
  
  // Related entities
  orderId?: number;
  subscriptionId?: number;
  
  // Payment terms
  paymentTerms?: string;
  lateFeesEnabled?: boolean;
  lateFeePercentage?: number;
  
  metadata?: Record<string, string>;
}

export interface UpdateInvoiceOptions {
  description?: string;
  memo?: string;
  footer?: string;
  dueDate?: Date;
  discount?: InvoiceDiscount;
  customFields?: Record<string, string>;
  metadata?: Record<string, string>;
}

export interface PaymentPlan {
  totalAmount: number;
  numberOfPayments: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  startDate: Date;
  downPayment?: number;
}

export interface InvoiceReminder {
  type: 'before_due' | 'on_due' | 'after_due';
  daysOffset: number;
  channel: 'email' | 'sms' | 'both';
  message?: string;
}

export interface InvoiceSummary {
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  amountDue: number;
  credits: number;
}

// ============================================================================
// INVOICE MANAGER SERVICE
// ============================================================================

export class InvoiceManager {
  private stripeClient: Stripe | null = null;
  private clinicId?: number;
  
  constructor(clinicId?: number) {
    this.clinicId = clinicId;
    try {
      this.stripeClient = getStripe();
    } catch {
      logger.warn('Stripe not configured - running in demo mode');
    }
  }
  
  // --------------------------------------------------------------------------
  // INVOICE CREATION
  // --------------------------------------------------------------------------
  
  /**
   * Create a new invoice
   */
  async createInvoice(options: CreateInvoiceOptions): Promise<{
    invoice: any;
    stripeInvoice?: Stripe.Invoice;
    summary: InvoiceSummary;
  }> {
    // Calculate totals
    const summary = this.calculateInvoiceSummary(options.lineItems, options.discount, options.taxes);
    
    // Get patient
    const patient = await basePrisma.patient.findUnique({
      where: { id: options.patientId },
    });
    
    if (!patient) {
      throw new Error('Patient not found');
    }
    
    // Generate invoice number if not provided
    const invoiceNumber = options.invoiceNumber || await this.generateInvoiceNumber();
    
    // Calculate due date
    const dueDate = options.dueDate || new Date(Date.now() + (options.dueInDays || 30) * 24 * 60 * 60 * 1000);
    
    let stripeInvoice: Stripe.Invoice | undefined;
    let stripeInvoiceId: string | undefined;
    let stripeInvoiceUrl: string | undefined;
    let stripePdfUrl: string | undefined;
    
    // Create in Stripe if configured
    if (this.stripeClient) {
      try {
        // Get or create Stripe customer
        const customer = await StripeCustomerService.getOrCreateCustomer(options.patientId);
        
        // Create Stripe invoice
        stripeInvoice = await this.stripeClient.invoices.create({
          customer: customer.id,
          description: options.description,
          collection_method: options.collectionMethod || STRIPE_CONFIG.collectionMethod,
          days_until_due: options.dueInDays || STRIPE_CONFIG.invoiceDueDays,
          auto_advance: false,
          footer: options.footer,
          custom_fields: options.customFields ? 
            Object.entries(options.customFields).slice(0, 4).map(([name, value]) => ({ name, value })) : 
            undefined,
          metadata: {
            patientId: options.patientId.toString(),
            clinicId: (options.clinicId || this.clinicId || '').toString(),
            orderId: options.orderId?.toString() || '',
            invoiceNumber,
            ...options.metadata,
          },
        });
        
        // Add line items
        for (const item of options.lineItems) {
          const itemTotal = this.calculateLineItemTotal(item);
          await this.stripeClient.invoiceItems.create({
            customer: customer.id,
            invoice: stripeInvoice.id,
            description: item.quantity > 1 ? `${item.description} (x${item.quantity})` : item.description,
            amount: itemTotal,
            currency: STRIPE_CONFIG.currency,
            metadata: item.metadata,
          });
        }
        
        // Apply discount if provided
        if (options.discount && options.discount.value > 0) {
          // Create a coupon for this invoice
          const coupon = await this.stripeClient.coupons.create({
            ...(options.discount.type === 'percentage' 
              ? { percent_off: options.discount.value }
              : { amount_off: options.discount.value, currency: STRIPE_CONFIG.currency }
            ),
            duration: 'once',
            name: options.discount.description || 'Invoice Discount',
          });
          
          await this.stripeClient.invoices.update(stripeInvoice.id, {
            discounts: [{ coupon: coupon.id }],
          });
        }
        
        // Finalize the invoice
        const finalizedInvoice = await this.stripeClient.invoices.finalizeInvoice(stripeInvoice.id);
        
        stripeInvoiceId = finalizedInvoice.id;
        stripeInvoiceUrl = finalizedInvoice.hosted_invoice_url || undefined;
        stripePdfUrl = finalizedInvoice.invoice_pdf || undefined;
        stripeInvoice = finalizedInvoice;
        
        // Auto-send if requested
        if (options.autoSend) {
          await this.stripeClient.invoices.sendInvoice(finalizedInvoice.id);
        }
        
        // Auto-charge if requested and payment method available
        if (options.autoCharge) {
          try {
            await this.stripeClient.invoices.pay(finalizedInvoice.id);
          } catch (payError) {
            logger.warn('Auto-charge failed', { invoiceId: finalizedInvoice.id, error: payError });
          }
        }
        
      } catch (stripeError: any) {
        logger.error('Stripe invoice creation failed', stripeError);
        // Continue without Stripe - create local invoice only
      }
    }
    
    // Create invoice in database
    const dbInvoice = await basePrisma.invoice.create({
      data: {
        patientId: options.patientId,
        clinicId: options.clinicId || this.clinicId,
        orderId: options.orderId,
        
        // Stripe IDs
        stripeInvoiceId,
        stripeInvoiceNumber: stripeInvoice?.number || undefined,
        stripeInvoiceUrl,
        stripePdfUrl,
        
        // Amounts
        amount: summary.total,
        amountDue: summary.amountDue,
        amountPaid: 0,
        currency: STRIPE_CONFIG.currency,
        
        // Status
        status: stripeInvoiceId ? 'OPEN' : 'DRAFT',
        
        // Details
        description: options.description,
        dueDate,
        
        // Store line items and calculations
        lineItems: options.lineItems as any,
        metadata: {
          invoiceNumber,
          memo: options.memo,
          footer: options.footer,
          discount: options.discount,
          taxes: options.taxes,
          customFields: options.customFields,
          poNumber: options.poNumber,
          paymentTerms: options.paymentTerms,
          summary,
          ...options.metadata,
        },
      },
      include: {
        patient: true,
        clinic: true,
      },
    });
    
    logger.info('Invoice created', {
      invoiceId: dbInvoice.id,
      patientId: options.patientId,
      amount: summary.total,
      stripeId: stripeInvoiceId,
    });
    
    return {
      invoice: dbInvoice,
      stripeInvoice,
      summary,
    };
  }
  
  /**
   * Create a draft invoice (not finalized)
   */
  async createDraftInvoice(options: CreateInvoiceOptions): Promise<any> {
    const summary = this.calculateInvoiceSummary(options.lineItems, options.discount, options.taxes);
    const invoiceNumber = options.invoiceNumber || await this.generateInvoiceNumber();
    const dueDate = options.dueDate || new Date(Date.now() + (options.dueInDays || 30) * 24 * 60 * 60 * 1000);
    
    const dbInvoice = await basePrisma.invoice.create({
      data: {
        patientId: options.patientId,
        clinicId: options.clinicId || this.clinicId,
        orderId: options.orderId,
        amount: summary.total,
        amountDue: summary.amountDue,
        amountPaid: 0,
        currency: STRIPE_CONFIG.currency,
        status: 'DRAFT',
        description: options.description,
        dueDate,
        lineItems: options.lineItems as any,
        metadata: {
          invoiceNumber,
          memo: options.memo,
          footer: options.footer,
          discount: options.discount,
          taxes: options.taxes,
          customFields: options.customFields,
          summary,
          isDraft: true,
          ...options.metadata,
        },
      },
      include: { patient: true, clinic: true },
    });
    
    return dbInvoice;
  }
  
  /**
   * Finalize a draft invoice
   */
  async finalizeInvoice(invoiceId: number): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: true },
    });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status !== 'DRAFT') {
      throw new Error('Only draft invoices can be finalized');
    }
    
    // Create in Stripe if configured
    if (this.stripeClient && !invoice.stripeInvoiceId) {
      const lineItems = (invoice.lineItems as any[]) || [];
      const result = await this.createInvoice({
        patientId: invoice.patientId,
        clinicId: invoice.clinicId || undefined,
        lineItems: lineItems.map((item: any) => ({
          description: item.description,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || item.amount,
        })),
        description: invoice.description || undefined,
        dueDate: invoice.dueDate || undefined,
        orderId: invoice.orderId || undefined,
        metadata: invoice.metadata as any,
      });
      
      // Delete the draft and return the new invoice
      await basePrisma.invoice.delete({ where: { id: invoiceId } });
      return result.invoice;
    }
    
    // Just update status if no Stripe
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'OPEN',
        metadata: {
          ...(invoice.metadata as any || {}),
          isDraft: false,
          finalizedAt: new Date().toISOString(),
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  // --------------------------------------------------------------------------
  // INVOICE UPDATES
  // --------------------------------------------------------------------------
  
  /**
   * Update an invoice (only drafts can be fully edited)
   */
  async updateInvoice(invoiceId: number, updates: UpdateInvoiceOptions): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const currentMetadata = (invoice.metadata as any) || {};
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        description: updates.description,
        dueDate: updates.dueDate,
        metadata: {
          ...currentMetadata,
          memo: updates.memo ?? currentMetadata.memo,
          footer: updates.footer ?? currentMetadata.footer,
          discount: updates.discount ?? currentMetadata.discount,
          customFields: updates.customFields ?? currentMetadata.customFields,
          ...updates.metadata,
          updatedAt: new Date().toISOString(),
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  /**
   * Add line items to a draft invoice
   */
  async addLineItems(invoiceId: number, items: LineItem[]): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status !== 'DRAFT') {
      throw new Error('Can only add items to draft invoices');
    }
    
    const existingItems = (invoice.lineItems as any[]) || [];
    const allItems = [...existingItems, ...items];
    const summary = this.calculateInvoiceSummary(allItems);
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        lineItems: allItems as any,
        amount: summary.total,
        amountDue: summary.amountDue,
        metadata: {
          ...(invoice.metadata as any || {}),
          summary,
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  /**
   * Remove a line item from a draft invoice
   */
  async removeLineItem(invoiceId: number, itemIndex: number): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status !== 'DRAFT') {
      throw new Error('Can only remove items from draft invoices');
    }
    
    const existingItems = (invoice.lineItems as any[]) || [];
    existingItems.splice(itemIndex, 1);
    const summary = this.calculateInvoiceSummary(existingItems);
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        lineItems: existingItems as any,
        amount: summary.total,
        amountDue: summary.amountDue,
        metadata: {
          ...(invoice.metadata as any || {}),
          summary,
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  // --------------------------------------------------------------------------
  // INVOICE STATUS MANAGEMENT
  // --------------------------------------------------------------------------
  
  /**
   * Send an invoice to the patient
   */
  async sendInvoice(invoiceId: number, options?: {
    channel?: 'email' | 'sms' | 'both';
    customMessage?: string;
  }): Promise<{ success: boolean; delivery: any[] }> {
    const invoice = await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: true, clinic: true },
    });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const channel = options?.channel || 'email';
    const delivery: any[] = [];
    
    // Get payment URL
    const paymentUrl = invoice.stripeInvoiceUrl || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'https://eonpro-kappa.vercel.app'}/pay/${invoice.id}`;
    
    const clinicName = invoice.clinic?.name || 'EON Medical';
    const amount = '$' + (invoice.amount / 100).toFixed(2);
    
    // Send via Stripe if available
    if (this.stripeClient && invoice.stripeInvoiceId && invoice.status === 'OPEN') {
      try {
        await this.stripeClient.invoices.sendInvoice(invoice.stripeInvoiceId);
        delivery.push({ method: 'stripe_email', success: true });
      } catch (stripeError: any) {
        delivery.push({ method: 'stripe_email', success: false, error: stripeError.message });
      }
    }
    
    // Send via email
    if (channel === 'email' || channel === 'both') {
      if (invoice.patient.email) {
        try {
          await sendEmail({
            to: invoice.patient.email,
            subject: `${clinicName} - Invoice for ${amount}`,
            html: this.generateInvoiceEmailHtml(invoice, paymentUrl, options?.customMessage),
            text: this.generateInvoiceEmailText(invoice, paymentUrl, options?.customMessage),
          });
          delivery.push({ method: 'email', success: true });
        } catch (emailError: any) {
          delivery.push({ method: 'email', success: false, error: emailError.message });
        }
      }
    }
    
    // Send via SMS
    if (channel === 'sms' || channel === 'both') {
      if (invoice.patient.phone) {
        try {
          const smsMessage = options?.customMessage
            ? `${clinicName}: ${options.customMessage}\n\nInvoice: ${amount}\nPay: ${paymentUrl}`
            : `${clinicName}: Your invoice for ${amount} is ready. Pay securely: ${paymentUrl}`;
          
          await sendSMS({
            to: formatPhoneNumber(invoice.patient.phone),
            body: smsMessage,
          });
          delivery.push({ method: 'sms', success: true });
        } catch (smsError: any) {
          delivery.push({ method: 'sms', success: false, error: smsError.message });
        }
      }
    }
    
    // Update invoice metadata
    await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        metadata: {
          ...(invoice.metadata as any || {}),
          lastSentAt: new Date().toISOString(),
          sendCount: ((invoice.metadata as any)?.sendCount || 0) + 1,
          lastDelivery: delivery,
        },
      },
    });
    
    return {
      success: delivery.some(d => d.success),
      delivery,
    };
  }
  
  /**
   * Void an invoice
   */
  async voidInvoice(invoiceId: number, reason?: string): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status === 'PAID') {
      throw new Error('Cannot void a paid invoice. Issue a refund instead.');
    }
    
    // Void in Stripe
    if (this.stripeClient && invoice.stripeInvoiceId) {
      try {
        await this.stripeClient.invoices.voidInvoice(invoice.stripeInvoiceId);
      } catch (stripeError: any) {
        logger.warn('Stripe void failed', { error: stripeError.message });
      }
    }
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'VOID',
        metadata: {
          ...(invoice.metadata as any || {}),
          voidedAt: new Date().toISOString(),
          voidReason: reason,
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  /**
   * Mark invoice as uncollectible
   */
  async markUncollectible(invoiceId: number, reason?: string): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    // Mark in Stripe
    if (this.stripeClient && invoice.stripeInvoiceId) {
      try {
        await this.stripeClient.invoices.markUncollectible(invoice.stripeInvoiceId);
      } catch (stripeError: any) {
        logger.warn('Stripe mark uncollectible failed', { error: stripeError.message });
      }
    }
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'UNCOLLECTIBLE',
        metadata: {
          ...(invoice.metadata as any || {}),
          markedUncollectibleAt: new Date().toISOString(),
          uncollectibleReason: reason,
        },
      },
      include: { patient: true, clinic: true },
    });
  }
  
  // --------------------------------------------------------------------------
  // PAYMENTS
  // --------------------------------------------------------------------------
  
  /**
   * Record a payment against an invoice
   */
  async recordPayment(invoiceId: number, options: {
    amount: number;
    paymentMethod: string;
    stripePaymentIntentId?: string;
    notes?: string;
  }): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      throw new Error(`Cannot record payment on ${invoice.status} invoice`);
    }
    
    const totalPaid = (invoice.amountPaid || 0) + options.amount;
    const newAmountDue = Math.max(0, invoice.amount - totalPaid);
    const isPaid = newAmountDue === 0;
    
    // Create payment record
    const payment = await basePrisma.payment.create({
      data: {
        patientId: invoice.patientId,
        clinicId: invoice.clinicId,
        invoiceId: invoice.id,
        amount: options.amount,
        status: 'SUCCEEDED',
        paymentMethod: options.paymentMethod,
        stripePaymentIntentId: options.stripePaymentIntentId,
        metadata: {
          notes: options.notes,
          isPartialPayment: !isPaid,
        },
      },
    });
    
    // Update invoice
    const updatedInvoice = await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: totalPaid,
        amountDue: newAmountDue,
        status: isPaid ? 'PAID' : 'OPEN',
        paidAt: isPaid ? new Date() : undefined,
        metadata: {
          ...(invoice.metadata as any || {}),
          lastPaymentAt: new Date().toISOString(),
          paymentHistory: [
            ...((invoice.metadata as any)?.paymentHistory || []),
            {
              paymentId: payment.id,
              amount: options.amount,
              date: new Date().toISOString(),
              method: options.paymentMethod,
            },
          ],
        },
      },
      include: { patient: true, payments: true },
    });
    
    logger.info('Payment recorded', {
      invoiceId,
      paymentId: payment.id,
      amount: options.amount,
      totalPaid,
      isPaid,
    });
    
    return {
      invoice: updatedInvoice,
      payment,
      isPaid,
      remainingBalance: newAmountDue,
    };
  }
  
  /**
   * Create a payment plan for an invoice
   */
  async createPaymentPlan(invoiceId: number, plan: PaymentPlan): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const remainingAmount = plan.totalAmount - (plan.downPayment || 0);
    const installmentAmount = Math.ceil(remainingAmount / plan.numberOfPayments);
    
    // Generate schedule
    const schedule: any[] = [];
    let currentDate = new Date(plan.startDate);
    
    // Add down payment if exists
    if (plan.downPayment && plan.downPayment > 0) {
      schedule.push({
        number: 0,
        amount: plan.downPayment,
        dueDate: plan.startDate,
        status: 'pending',
        type: 'down_payment',
      });
    }
    
    // Add installments
    for (let i = 0; i < plan.numberOfPayments; i++) {
      const isLast = i === plan.numberOfPayments - 1;
      const amount = isLast 
        ? remainingAmount - (installmentAmount * (plan.numberOfPayments - 1))
        : installmentAmount;
      
      schedule.push({
        number: i + 1,
        amount,
        dueDate: new Date(currentDate),
        status: 'pending',
        type: 'installment',
      });
      
      // Advance date
      switch (plan.frequency) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
      }
    }
    
    // Update invoice with payment plan
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        metadata: {
          ...(invoice.metadata as any || {}),
          paymentPlan: {
            ...plan,
            schedule,
            createdAt: new Date().toISOString(),
          },
        },
      },
      include: { patient: true },
    });
  }
  
  // --------------------------------------------------------------------------
  // CREDITS & REFUNDS
  // --------------------------------------------------------------------------
  
  /**
   * Apply a credit to an invoice
   */
  async applyCredit(invoiceId: number, amount: number, description?: string): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    const newAmountDue = Math.max(0, (invoice.amountDue || invoice.amount) - amount);
    const isPaid = newAmountDue === 0;
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountDue: newAmountDue,
        status: isPaid ? 'PAID' : invoice.status,
        paidAt: isPaid ? new Date() : undefined,
        metadata: {
          ...(invoice.metadata as any || {}),
          credits: [
            ...((invoice.metadata as any)?.credits || []),
            {
              amount,
              description,
              appliedAt: new Date().toISOString(),
            },
          ],
        },
      },
      include: { patient: true },
    });
  }
  
  /**
   * Issue a refund for a paid invoice
   */
  async issueRefund(invoiceId: number, options: {
    amount?: number; // Partial refund amount, or full if not specified
    reason?: string;
    refundToPaymentMethod?: boolean;
  }): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { payments: true },
    });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    if (invoice.status !== 'PAID') {
      throw new Error('Can only refund paid invoices');
    }
    
    const refundAmount = options.amount || invoice.amountPaid || invoice.amount;
    
    // Process refund in Stripe if applicable
    if (this.stripeClient && options.refundToPaymentMethod) {
      const stripePayment = invoice.payments.find(p => p.stripePaymentIntentId);
      if (stripePayment?.stripePaymentIntentId) {
        try {
          await this.stripeClient.refunds.create({
            payment_intent: stripePayment.stripePaymentIntentId,
            amount: refundAmount,
            reason: 'requested_by_customer',
          });
        } catch (stripeError: any) {
          logger.error('Stripe refund failed', stripeError);
          throw new Error(`Stripe refund failed: ${stripeError.message}`);
        }
      }
    }
    
    // Update invoice
    const newAmountPaid = (invoice.amountPaid || 0) - refundAmount;
    const isFullRefund = newAmountPaid <= 0;
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: Math.max(0, newAmountPaid),
        amountDue: isFullRefund ? invoice.amount : invoice.amount - newAmountPaid,
        status: isFullRefund ? 'VOID' : 'OPEN',
        paidAt: isFullRefund ? null : invoice.paidAt,
        metadata: {
          ...(invoice.metadata as any || {}),
          refunds: [
            ...((invoice.metadata as any)?.refunds || []),
            {
              amount: refundAmount,
              reason: options.reason,
              issuedAt: new Date().toISOString(),
              isFullRefund,
            },
          ],
        },
      },
      include: { patient: true },
    });
  }
  
  // --------------------------------------------------------------------------
  // QUERIES
  // --------------------------------------------------------------------------
  
  /**
   * Get invoice by ID
   */
  async getInvoice(invoiceId: number): Promise<any> {
    return await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        patient: true,
        clinic: true,
        payments: true,
      },
    });
  }
  
  /**
   * Get invoices with filters
   */
  async getInvoices(filters: {
    patientId?: number;
    clinicId?: number;
    status?: InvoiceStatus | InvoiceStatus[];
    fromDate?: Date;
    toDate?: Date;
    minAmount?: number;
    maxAmount?: number;
    overdue?: boolean;
    search?: string;
    page?: number;
    limit?: number;
    orderBy?: 'createdAt' | 'dueDate' | 'amount';
    orderDir?: 'asc' | 'desc';
  }): Promise<{ invoices: any[]; total: number; page: number; totalPages: number }> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;
    
    const where: Prisma.InvoiceWhereInput = {};
    
    if (this.clinicId) {
      where.clinicId = this.clinicId;
    }
    if (filters.patientId) {
      where.patientId = filters.patientId;
    }
    if (filters.clinicId) {
      where.clinicId = filters.clinicId;
    }
    if (filters.status) {
      where.status = Array.isArray(filters.status) ? { in: filters.status } : filters.status;
    }
    if (filters.fromDate || filters.toDate) {
      where.createdAt = {
        ...(filters.fromDate && { gte: filters.fromDate }),
        ...(filters.toDate && { lte: filters.toDate }),
      };
    }
    if (filters.minAmount || filters.maxAmount) {
      where.amount = {
        ...(filters.minAmount && { gte: filters.minAmount }),
        ...(filters.maxAmount && { lte: filters.maxAmount }),
      };
    }
    if (filters.overdue) {
      where.status = 'OPEN';
      where.dueDate = { lt: new Date() };
    }
    
    const [invoices, total] = await Promise.all([
      basePrisma.invoice.findMany({
        where,
        include: {
          patient: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          clinic: { select: { id: true, name: true } },
          payments: true,
        },
        orderBy: { [filters.orderBy || 'createdAt']: filters.orderDir || 'desc' },
        skip,
        take: limit,
      }),
      basePrisma.invoice.count({ where }),
    ]);
    
    return {
      invoices,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }
  
  /**
   * Get patient's invoice summary
   */
  async getPatientInvoiceSummary(patientId: number): Promise<{
    totalInvoiced: number;
    totalPaid: number;
    totalOutstanding: number;
    overdueAmount: number;
    invoiceCount: number;
    paidCount: number;
    openCount: number;
    overdueCount: number;
  }> {
    const invoices = await basePrisma.invoice.findMany({
      where: { 
        patientId,
        ...(this.clinicId && { clinicId: this.clinicId }),
      },
    });
    
    const now = new Date();
    let totalInvoiced = 0;
    let totalPaid = 0;
    let totalOutstanding = 0;
    let overdueAmount = 0;
    let paidCount = 0;
    let openCount = 0;
    let overdueCount = 0;
    
    for (const inv of invoices) {
      totalInvoiced += inv.amount;
      totalPaid += inv.amountPaid || 0;
      
      if (inv.status === 'PAID') {
        paidCount++;
      } else if (inv.status === 'OPEN') {
        openCount++;
        totalOutstanding += inv.amountDue || inv.amount;
        
        if (inv.dueDate && inv.dueDate < now) {
          overdueCount++;
          overdueAmount += inv.amountDue || inv.amount;
        }
      }
    }
    
    return {
      totalInvoiced,
      totalPaid,
      totalOutstanding,
      overdueAmount,
      invoiceCount: invoices.length,
      paidCount,
      openCount,
      overdueCount,
    };
  }
  
  // --------------------------------------------------------------------------
  // REMINDERS
  // --------------------------------------------------------------------------
  
  /**
   * Schedule payment reminders for an invoice
   */
  async scheduleReminders(invoiceId: number, reminders: InvoiceReminder[]): Promise<any> {
    const invoice = await basePrisma.invoice.findUnique({ where: { id: invoiceId } });
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    return await basePrisma.invoice.update({
      where: { id: invoiceId },
      data: {
        metadata: {
          ...(invoice.metadata as any || {}),
          reminders,
          remindersScheduledAt: new Date().toISOString(),
        },
      },
    });
  }
  
  /**
   * Process due reminders (called by cron job)
   */
  async processDueReminders(): Promise<{ processed: number; sent: number; errors: number }> {
    const now = new Date();
    let processed = 0;
    let sent = 0;
    let errors = 0;
    
    // Get open invoices with reminders
    const invoices = await basePrisma.invoice.findMany({
      where: {
        status: 'OPEN',
        ...(this.clinicId && { clinicId: this.clinicId }),
      },
      include: { patient: true, clinic: true },
    });
    
    for (const invoice of invoices) {
      const metadata = invoice.metadata as any;
      const reminders = metadata?.reminders as InvoiceReminder[] || [];
      const sentReminders = metadata?.sentReminders || [];
      
      for (const reminder of reminders) {
        const reminderKey = `${reminder.type}_${reminder.daysOffset}`;
        if (sentReminders.includes(reminderKey)) continue;
        
        let shouldSend = false;
        const dueDate = invoice.dueDate || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        switch (reminder.type) {
          case 'before_due': {
            const reminderDate = new Date(dueDate.getTime() - reminder.daysOffset * 24 * 60 * 60 * 1000);
            shouldSend = now >= reminderDate && now < dueDate;
            break;
          }
          case 'on_due': {
            shouldSend = now.toDateString() === dueDate.toDateString();
            break;
          }
          case 'after_due': {
            const reminderDate = new Date(dueDate.getTime() + reminder.daysOffset * 24 * 60 * 60 * 1000);
            shouldSend = now >= reminderDate;
            break;
          }
        }
        
        if (shouldSend) {
          processed++;
          try {
            await this.sendInvoice(invoice.id, {
              channel: reminder.channel,
              customMessage: reminder.message || `Payment reminder: Your invoice is ${
                reminder.type === 'before_due' ? 'due soon' :
                reminder.type === 'on_due' ? 'due today' :
                'overdue'
              }`,
            });
            
            // Mark reminder as sent
            await basePrisma.invoice.update({
              where: { id: invoice.id },
              data: {
                metadata: {
                  ...metadata,
                  sentReminders: [...sentReminders, reminderKey],
                },
              },
            });
            sent++;
          } catch (error) {
            errors++;
            logger.error('Failed to send reminder', { invoiceId: invoice.id, error });
          }
        }
      }
    }
    
    return { processed, sent, errors };
  }
  
  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------
  
  /**
   * Calculate line item total including discounts
   */
  private calculateLineItemTotal(item: LineItem): number {
    let total = item.quantity * item.unitPrice;
    
    if (item.discount) {
      if (item.discount.type === 'percentage') {
        total = total * (1 - item.discount.value / 100);
      } else {
        total = Math.max(0, total - item.discount.value);
      }
    }
    
    if (item.taxRate) {
      total = total * (1 + item.taxRate / 100);
    }
    
    return Math.round(total);
  }
  
  /**
   * Calculate invoice summary
   */
  private calculateInvoiceSummary(
    lineItems: LineItem[],
    discount?: InvoiceDiscount,
    taxes?: InvoiceTax[]
  ): InvoiceSummary {
    let subtotal = 0;
    
    for (const item of lineItems) {
      let itemTotal = item.quantity * item.unitPrice;
      
      // Apply item-level discount
      if (item.discount) {
        if (item.discount.type === 'percentage') {
          itemTotal = itemTotal * (1 - item.discount.value / 100);
        } else {
          itemTotal = Math.max(0, itemTotal - item.discount.value);
        }
      }
      
      subtotal += itemTotal;
    }
    
    // Apply invoice-level discount
    let discountAmount = 0;
    if (discount && discount.value > 0) {
      if (discount.type === 'percentage') {
        discountAmount = subtotal * (discount.value / 100);
      } else {
        discountAmount = Math.min(subtotal, discount.value);
      }
    }
    
    const afterDiscount = subtotal - discountAmount;
    
    // Calculate taxes
    let taxAmount = 0;
    if (taxes && taxes.length > 0) {
      for (const tax of taxes) {
        if (!tax.inclusive) {
          taxAmount += afterDiscount * (tax.rate / 100);
        }
      }
    }
    
    const total = Math.round(afterDiscount + taxAmount);
    
    return {
      subtotal: Math.round(subtotal),
      discountAmount: Math.round(discountAmount),
      taxAmount: Math.round(taxAmount),
      total,
      amountPaid: 0,
      amountDue: total,
      credits: 0,
    };
  }
  
  /**
   * Generate unique invoice number
   */
  private async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    
    // Get count of invoices this month
    const startOfMonth = new Date(year, new Date().getMonth(), 1);
    const count = await basePrisma.invoice.count({
      where: {
        createdAt: { gte: startOfMonth },
        ...(this.clinicId && { clinicId: this.clinicId }),
      },
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    return `INV-${year}${month}-${sequence}`;
  }
  
  /**
   * Generate HTML email for invoice
   */
  private generateInvoiceEmailHtml(invoice: any, paymentUrl: string, customMessage?: string): string {
    const clinicName = invoice.clinic?.name || 'EON Medical';
    const amount = '$' + (invoice.amount / 100).toFixed(2);
    const lineItems = (invoice.lineItems as any[]) || [];
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    }) : 'N/A';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #10B981, #14B8A6); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9fafb; padding: 30px; }
          .amount { font-size: 36px; font-weight: bold; margin: 10px 0; }
          .line-items { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
          .line-item { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
          .line-item:last-child { border-bottom: none; }
          .total { font-weight: bold; font-size: 18px; border-top: 2px solid #10B981; padding-top: 15px; margin-top: 10px; }
          .btn { display: inline-block; background: #10B981; color: white; padding: 15px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
          .footer { text-align: center; color: #666; font-size: 12px; padding: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">${clinicName}</h1>
            <p style="margin: 5px 0 0;">Invoice</p>
          </div>
          <div class="content">
            <p>Hello ${invoice.patient.firstName},</p>
            ${customMessage ? `<p>${customMessage}</p>` : ''}
            <p>You have a new invoice from ${clinicName}.</p>
            
            <div class="line-items">
              ${lineItems.map((item: any) => `
                <div class="line-item">
                  <span>${item.description}${item.quantity > 1 ? ` (x${item.quantity})` : ''}</span>
                  <span>$${((item.unitPrice || item.amount) * (item.quantity || 1) / 100).toFixed(2)}</span>
                </div>
              `).join('')}
              <div class="line-item total">
                <span>Total Due</span>
                <span>${amount}</span>
              </div>
            </div>
            
            <p><strong>Due Date:</strong> ${dueDate}</p>
            
            <center>
              <a href="${paymentUrl}" class="btn">Pay Now</a>
            </center>
            
            <p style="font-size: 12px; color: #666;">
              Invoice #${(invoice.metadata as any)?.invoiceNumber || invoice.id}
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from ${clinicName}.</p>
            <p>If you have questions, please contact our office.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  /**
   * Generate plain text email for invoice
   */
  private generateInvoiceEmailText(invoice: any, paymentUrl: string, customMessage?: string): string {
    const clinicName = invoice.clinic?.name || 'EON Medical';
    const amount = '$' + (invoice.amount / 100).toFixed(2);
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A';
    
    return `
${clinicName} - Invoice

Hello ${invoice.patient.firstName},

${customMessage ? customMessage + '\n\n' : ''}You have a new invoice from ${clinicName}.

Amount Due: ${amount}
Due Date: ${dueDate}
Invoice #: ${(invoice.metadata as any)?.invoiceNumber || invoice.id}

Pay now: ${paymentUrl}

If you have questions, please contact our office.
    `.trim();
  }
}

// Export singleton factory
export function createInvoiceManager(clinicId?: number): InvoiceManager {
  return new InvoiceManager(clinicId);
}
