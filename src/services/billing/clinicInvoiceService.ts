/**
 * CLINIC INVOICE SERVICE
 * ======================
 * Manages clinic platform invoices for EONPRO billing
 *
 * Features:
 * - Invoice generation from aggregated fee events
 * - Stripe invoice creation and management
 * - PDF report generation
 * - Invoice lifecycle management (draft → pending → sent → paid)
 * - Payment tracking
 *
 * @module services/billing/clinicInvoiceService
 */

import { prisma } from '@/lib/db';
import { getStripe, STRIPE_CONFIG } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import type {
  ClinicInvoiceStatus,
  ClinicInvoicePeriodType,
  ClinicPlatformInvoice,
  PlatformFeeEvent,
} from '@prisma/client';
import type Stripe from 'stripe';
import { platformFeeService } from './platformFeeService';

// ============================================================================
// Types
// ============================================================================

export interface GenerateInvoiceOptions {
  clinicId: number;
  periodType: ClinicInvoicePeriodType;
  periodStart: Date;
  periodEnd: Date;
  actorId?: number;
  notes?: string;
  externalNotes?: string;
}

export interface InvoiceWithDetails extends ClinicPlatformInvoice {
  clinic: {
    id: number;
    name: string;
    adminEmail: string;
  };
  config: {
    id: number;
    billingEmail: string | null;
    billingName: string | null;
    paymentTermsDays: number;
  };
  feeEvents: PlatformFeeEvent[];
}

export interface InvoiceListFilters {
  clinicId?: number;
  status?: ClinicInvoiceStatus;
  periodType?: ClinicInvoicePeriodType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalAmountCents: number;
  draftCount: number;
  pendingCount: number;
  sentCount: number;
  paidCount: number;
  overdueCount: number;
  paidAmountCents: number;
  outstandingAmountCents: number;
}

// ============================================================================
// Clinic Invoice Service
// ============================================================================

export const clinicInvoiceService = {
  // --------------------------------------------------------------------------
  // Invoice Generation
  // --------------------------------------------------------------------------

  /**
   * Generate invoice number
   * Format: PLAT-YYYY-NNNNN (e.g., PLAT-2026-00001)
   */
  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PLAT-${year}-`;

    // Get the count of invoices this year
    const count = await prisma.clinicPlatformInvoice.count({
      where: {
        invoiceNumber: {
          startsWith: prefix,
        },
      },
    });

    const number = String(count + 1).padStart(5, '0');
    return `${prefix}${number}`;
  },

  /**
   * Preview pending fees for a clinic/period (no invoice created).
   * Use for "Create invoice" flow to show totals before generating.
   */
  async previewPendingFees(
    clinicId: number,
    periodStart: Date,
    periodEnd: Date
  ): Promise<{
    feeCount: number;
    prescriptionCount: number;
    transmissionCount: number;
    prescriptionFeeTotal: number;
    transmissionFeeTotal: number;
    adminFeeTotal: number;
    totalAmountCents: number;
    hasConfig: boolean;
  }> {
    const config = await platformFeeService.getFeeConfig(clinicId);
    const pendingFees = await prisma.platformFeeEvent.findMany({
      where: {
        clinicId,
        status: 'PENDING',
        createdAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { createdAt: 'asc' },
    });

    let prescriptionFeeTotal = 0;
    let transmissionFeeTotal = 0;
    let adminFeeTotal = 0;
    let prescriptionCount = 0;
    let transmissionCount = 0;

    for (const fee of pendingFees) {
      switch (fee.feeType) {
        case 'PRESCRIPTION':
          prescriptionFeeTotal += fee.amountCents;
          prescriptionCount++;
          break;
        case 'TRANSMISSION':
          transmissionFeeTotal += fee.amountCents;
          transmissionCount++;
          break;
        case 'ADMIN':
          adminFeeTotal += fee.amountCents;
          break;
      }
    }

    const totalAmountCents =
      prescriptionFeeTotal + transmissionFeeTotal + adminFeeTotal;

    return {
      feeCount: pendingFees.length,
      prescriptionCount,
      transmissionCount,
      prescriptionFeeTotal,
      transmissionFeeTotal,
      adminFeeTotal,
      totalAmountCents,
      hasConfig: !!config && config.isActive,
    };
  },

  /**
   * Generate an invoice for a clinic's pending fees
   */
  async generateInvoice(options: GenerateInvoiceOptions): Promise<ClinicPlatformInvoice> {
    const { clinicId, periodType, periodStart, periodEnd, actorId, notes, externalNotes } = options;

    logger.info('[ClinicInvoiceService] Generating invoice', {
      clinicId,
      periodType,
      periodStart,
      periodEnd,
      actorId,
    });

    // Get fee config for the clinic
    const config = await platformFeeService.getOrCreateFeeConfig(clinicId);
    if (!config) {
      throw new Error('Fee configuration not found for clinic');
    }

    // Get pending fees for the period
    const pendingFees = await prisma.platformFeeEvent.findMany({
      where: {
        clinicId,
        status: 'PENDING',
        createdAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (pendingFees.length === 0) {
      throw new Error('No pending fees found for the specified period');
    }

    // Calculate totals
    let prescriptionFeeTotal = 0;
    let transmissionFeeTotal = 0;
    let adminFeeTotal = 0;
    let prescriptionCount = 0;
    let transmissionCount = 0;

    for (const fee of pendingFees) {
      switch (fee.feeType) {
        case 'PRESCRIPTION':
          prescriptionFeeTotal += fee.amountCents;
          prescriptionCount++;
          break;
        case 'TRANSMISSION':
          transmissionFeeTotal += fee.amountCents;
          transmissionCount++;
          break;
        case 'ADMIN':
          adminFeeTotal += fee.amountCents;
          break;
      }
    }

    const totalAmountCents = prescriptionFeeTotal + transmissionFeeTotal + adminFeeTotal;

    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber();

    // Calculate due date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + config.paymentTermsDays);

    // Create invoice and update fee events in a transaction
    const invoice = await prisma.$transaction(async (tx) => {
      // Create invoice
      const newInvoice = await tx.clinicPlatformInvoice.create({
        data: {
          clinicId,
          configId: config.id,
          periodStart,
          periodEnd,
          periodType,
          prescriptionFeeTotal,
          transmissionFeeTotal,
          adminFeeTotal,
          totalAmountCents,
          prescriptionCount,
          transmissionCount,
          invoiceNumber,
          dueDate,
          status: 'DRAFT',
          generatedBy: actorId,
          notes,
          externalNotes,
        },
      });

      // Update fee events to reference invoice
      await tx.platformFeeEvent.updateMany({
        where: {
          id: { in: pendingFees.map((f) => f.id) },
        },
        data: {
          invoiceId: newInvoice.id,
          status: 'INVOICED',
        },
      });

      return newInvoice;
    });

    logger.info('[ClinicInvoiceService] Invoice generated', {
      invoiceId: invoice.id,
      invoiceNumber,
      clinicId,
      totalAmountCents,
      feeCount: pendingFees.length,
    });

    return invoice;
  },

  // --------------------------------------------------------------------------
  // Invoice Lifecycle Management
  // --------------------------------------------------------------------------

  /**
   * Finalize a draft invoice (make it pending)
   */
  async finalizeInvoice(invoiceId: number, actorId?: number): Promise<ClinicPlatformInvoice> {
    const invoice = await prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new Error(`Cannot finalize invoice with status: ${invoice.status}`);
    }

    const updated = await prisma.clinicPlatformInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PENDING',
        finalizedAt: new Date(),
        finalizedBy: actorId,
      },
    });

    logger.info('[ClinicInvoiceService] Invoice finalized', {
      invoiceId,
      actorId,
    });

    return updated;
  },

  /**
   * Create Stripe invoice for the clinic
   */
  async createStripeInvoice(invoiceId: number): Promise<ClinicPlatformInvoice> {
    const invoice = await prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            adminEmail: true,
            stripeAccountId: true,
          },
        },
        config: true,
        feeEvents: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.stripeInvoiceId) {
      throw new Error('Stripe invoice already exists');
    }

    const stripe = getStripe();

    // Get or create Stripe customer for the clinic
    // First, check if we have a customer ID stored, otherwise create one
    let customerId: string;

    // Try to find existing customer by email
    const billingEmail = invoice.config.billingEmail || invoice.clinic.adminEmail;
    const existingCustomers = await stripe.customers.list({
      email: billingEmail,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id;
    } else {
      // Create new customer
      const customer = await stripe.customers.create({
        email: billingEmail,
        name: invoice.config.billingName || invoice.clinic.name,
        metadata: {
          clinicId: invoice.clinicId.toString(),
          type: 'clinic_platform_billing',
        },
      });
      customerId = customer.id;
    }

    // Create Stripe invoice
    const stripeInvoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: invoice.config.paymentTermsDays,
      description: `Platform fees for ${invoice.clinic.name} - ${formatPeriod(invoice.periodStart, invoice.periodEnd)}`,
      metadata: {
        invoiceId: invoice.id.toString(),
        invoiceNumber: invoice.invoiceNumber,
        clinicId: invoice.clinicId.toString(),
      },
    });

    // Add line items
    if (invoice.prescriptionFeeTotal > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: stripeInvoice.id,
        amount: invoice.prescriptionFeeTotal,
        currency: 'usd',
        description: `Medical Prescription Fees (${invoice.prescriptionCount} prescriptions)`,
      });
    }

    if (invoice.transmissionFeeTotal > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: stripeInvoice.id,
        amount: invoice.transmissionFeeTotal,
        currency: 'usd',
        description: `Prescription Transmission Fees (${invoice.transmissionCount} transmissions)`,
      });
    }

    if (invoice.adminFeeTotal > 0) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: stripeInvoice.id,
        amount: invoice.adminFeeTotal,
        currency: 'usd',
        description: 'Weekly Admin/Platform Fee',
      });
    }

    // Finalize the invoice
    const finalizedStripeInvoice = await stripe.invoices.finalizeInvoice(stripeInvoice.id);

    // Update our invoice record
    const updated = await prisma.clinicPlatformInvoice.update({
      where: { id: invoiceId },
      data: {
        stripeInvoiceId: finalizedStripeInvoice.id,
        stripeInvoiceUrl: finalizedStripeInvoice.hosted_invoice_url || undefined,
        stripePdfUrl: finalizedStripeInvoice.invoice_pdf || undefined,
        status: 'PENDING',
        finalizedAt: invoice.finalizedAt || new Date(),
      },
    });

    logger.info('[ClinicInvoiceService] Stripe invoice created', {
      invoiceId,
      stripeInvoiceId: finalizedStripeInvoice.id,
    });

    return updated;
  },

  /**
   * Send an invoice to the clinic
   */
  async sendInvoice(invoiceId: number, actorId?: number): Promise<ClinicPlatformInvoice> {
    const invoice = await prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        clinic: true,
        config: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'DRAFT') {
      throw new Error('Invoice must be finalized before sending');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Invoice is already paid');
    }

    // If we have a Stripe invoice, send via Stripe
    if (invoice.stripeInvoiceId) {
      const stripe = getStripe();
      await stripe.invoices.sendInvoice(invoice.stripeInvoiceId);
    } else {
      // Send email directly
      const billingEmail = invoice.config.billingEmail || invoice.clinic.adminEmail;
      await sendEmail(billingEmail, {
        subject: `Platform Invoice ${invoice.invoiceNumber} - EONPRO`,
        html: generateInvoiceEmailHtml(invoice),
      });
    }

    const updated = await prisma.clinicPlatformInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentBy: actorId,
      },
    });

    logger.info('[ClinicInvoiceService] Invoice sent', {
      invoiceId,
      actorId,
    });

    return updated;
  },

  /**
   * Mark invoice as paid
   */
  async markAsPaid(
    invoiceId: number,
    paymentDetails: {
      amountCents: number;
      method: string;
      reference?: string;
    },
    actorId?: number
  ): Promise<ClinicPlatformInvoice> {
    const invoice = await prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        feeEvents: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Invoice is already paid');
    }

    if (invoice.status === 'CANCELLED') {
      throw new Error('Cannot pay a cancelled invoice');
    }

    // Update invoice and fee events in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update invoice
      const updatedInvoice = await tx.clinicPlatformInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'PAID',
          paidAt: new Date(),
          paidAmountCents: paymentDetails.amountCents,
          paymentMethod: paymentDetails.method,
          paymentRef: paymentDetails.reference,
        },
      });

      // Update all fee events to PAID
      await tx.platformFeeEvent.updateMany({
        where: {
          invoiceId,
        },
        data: {
          status: 'PAID',
        },
      });

      return updatedInvoice;
    });

    logger.info('[ClinicInvoiceService] Invoice marked as paid', {
      invoiceId,
      amountCents: paymentDetails.amountCents,
      method: paymentDetails.method,
      actorId,
    });

    return updated;
  },

  /**
   * Cancel an invoice
   */
  async cancelInvoice(
    invoiceId: number,
    reason: string,
    actorId?: number
  ): Promise<ClinicPlatformInvoice> {
    const invoice = await prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        feeEvents: true,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID') {
      throw new Error('Cannot cancel a paid invoice');
    }

    // Cancel Stripe invoice if exists
    if (invoice.stripeInvoiceId) {
      const stripe = getStripe();
      try {
        await stripe.invoices.voidInvoice(invoice.stripeInvoiceId);
      } catch (err) {
        logger.warn('[ClinicInvoiceService] Failed to void Stripe invoice', {
          invoiceId,
          stripeInvoiceId: invoice.stripeInvoiceId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Update invoice and restore fee events in transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Update invoice
      const updatedInvoice = await tx.clinicPlatformInvoice.update({
        where: { id: invoiceId },
        data: {
          status: 'CANCELLED',
          notes: invoice.notes
            ? `${invoice.notes}\n\nCancelled: ${reason}`
            : `Cancelled: ${reason}`,
        },
      });

      // Restore fee events to PENDING (so they can be re-invoiced)
      await tx.platformFeeEvent.updateMany({
        where: {
          invoiceId,
          status: 'INVOICED',
        },
        data: {
          invoiceId: null,
          status: 'PENDING',
        },
      });

      return updatedInvoice;
    });

    logger.info('[ClinicInvoiceService] Invoice cancelled', {
      invoiceId,
      reason,
      actorId,
    });

    return updated;
  },

  /**
   * Check and mark overdue invoices
   */
  async checkOverdueInvoices(): Promise<number> {
    const now = new Date();

    const result = await prisma.clinicPlatformInvoice.updateMany({
      where: {
        status: { in: ['PENDING', 'SENT'] },
        dueDate: { lt: now },
      },
      data: {
        status: 'OVERDUE',
      },
    });

    if (result.count > 0) {
      logger.info('[ClinicInvoiceService] Marked invoices as overdue', {
        count: result.count,
      });
    }

    return result.count;
  },

  /**
   * Check and mark overdue invoices for a single clinic (for per-tenant cron).
   */
  async checkOverdueInvoicesForClinic(clinicId: number): Promise<number> {
    const now = new Date();

    const result = await prisma.clinicPlatformInvoice.updateMany({
      where: {
        clinicId,
        status: { in: ['PENDING', 'SENT'] },
        dueDate: { lt: now },
      },
      data: { status: 'OVERDUE' },
    });

    if (result.count > 0) {
      logger.info('[ClinicInvoiceService] Marked invoices as overdue', { clinicId, count: result.count });
    }

    return result.count;
  },

  // --------------------------------------------------------------------------
  // Invoice Queries
  // --------------------------------------------------------------------------

  /**
   * Get invoice by ID with details
   */
  async getInvoiceById(invoiceId: number): Promise<InvoiceWithDetails | null> {
    return prisma.clinicPlatformInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            adminEmail: true,
          },
        },
        config: {
          select: {
            id: true,
            billingEmail: true,
            billingName: true,
            paymentTermsDays: true,
          },
        },
        feeEvents: {
          orderBy: { createdAt: 'asc' },
        },
      },
    }) as Promise<InvoiceWithDetails | null>;
  },

  /**
   * List invoices with filters
   */
  async listInvoices(filters: InvoiceListFilters = {}): Promise<{
    invoices: InvoiceWithDetails[];
    total: number;
  }> {
    const where: Record<string, unknown> = {};

    if (filters.clinicId) {
      where.clinicId = filters.clinicId;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.periodType) {
      where.periodType = filters.periodType;
    }

    if (filters.startDate || filters.endDate) {
      where.periodStart = {};
      if (filters.startDate) (where.periodStart as Record<string, Date>).gte = filters.startDate;
      if (filters.endDate) (where.periodStart as Record<string, Date>).lte = filters.endDate;
    }

    const [invoices, total] = await Promise.all([
      prisma.clinicPlatformInvoice.findMany({
        where,
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              adminEmail: true,
            },
          },
          config: {
            select: {
              id: true,
              billingEmail: true,
              billingName: true,
              paymentTermsDays: true,
            },
          },
          feeEvents: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      prisma.clinicPlatformInvoice.count({ where }),
    ]);

    return { invoices: invoices as InvoiceWithDetails[], total };
  },

  /**
   * Get invoice summary (for dashboard)
   */
  async getInvoiceSummary(clinicId?: number): Promise<InvoiceSummary> {
    const where: Record<string, unknown> = {};
    if (clinicId) {
      where.clinicId = clinicId;
    }

    const invoices = await prisma.clinicPlatformInvoice.findMany({
      where,
      select: {
        status: true,
        totalAmountCents: true,
        paidAmountCents: true,
      },
    });

    let draftCount = 0;
    let pendingCount = 0;
    let sentCount = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let totalAmountCents = 0;
    let paidAmountCents = 0;

    for (const inv of invoices) {
      totalAmountCents += inv.totalAmountCents;

      switch (inv.status) {
        case 'DRAFT':
          draftCount++;
          break;
        case 'PENDING':
          pendingCount++;
          break;
        case 'SENT':
          sentCount++;
          break;
        case 'PAID':
          paidCount++;
          paidAmountCents += inv.paidAmountCents || inv.totalAmountCents;
          break;
        case 'OVERDUE':
          overdueCount++;
          break;
      }
    }

    const outstandingAmountCents = totalAmountCents - paidAmountCents;

    return {
      totalInvoices: invoices.length,
      totalAmountCents,
      draftCount,
      pendingCount,
      sentCount,
      paidCount,
      overdueCount,
      paidAmountCents,
      outstandingAmountCents,
    };
  },

  // --------------------------------------------------------------------------
  // PDF Generation
  // --------------------------------------------------------------------------

  /**
   * Generate PDF report for invoice
   * Note: This is a placeholder - actual PDF generation would use a library like pdfkit or puppeteer
   */
  async generatePdfReport(invoiceId: number): Promise<{ url: string; s3Key: string }> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // TODO: Implement actual PDF generation
    // For now, return the Stripe PDF URL if available
    if (invoice.stripePdfUrl) {
      return {
        url: invoice.stripePdfUrl,
        s3Key: '',
      };
    }

    throw new Error('PDF generation not yet implemented');
  },

  // --------------------------------------------------------------------------
  // Reporting
  // --------------------------------------------------------------------------

  /**
   * Get fee report by period
   */
  async getFeeReport(options: {
    clinicId?: number;
    periodType: ClinicInvoicePeriodType;
    startDate: Date;
    endDate: Date;
  }): Promise<{
    clinics: {
      clinicId: number;
      clinicName: string;
      prescriptionFees: number;
      transmissionFees: number;
      adminFees: number;
      totalFees: number;
      prescriptionCount: number;
      transmissionCount: number;
    }[];
    totals: {
      prescriptionFees: number;
      transmissionFees: number;
      adminFees: number;
      totalFees: number;
    };
  }> {
    const where: Record<string, unknown> = {
      createdAt: {
        gte: options.startDate,
        lte: options.endDate,
      },
      status: { notIn: ['VOIDED', 'WAIVED'] },
    };

    if (options.clinicId) {
      where.clinicId = options.clinicId;
    }

    const fees = await prisma.platformFeeEvent.findMany({
      where,
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Group by clinic
    const clinicMap = new Map<
      number,
      {
        clinicId: number;
        clinicName: string;
        prescriptionFees: number;
        transmissionFees: number;
        adminFees: number;
        prescriptionCount: number;
        transmissionCount: number;
      }
    >();

    for (const fee of fees) {
      const existing = clinicMap.get(fee.clinicId) || {
        clinicId: fee.clinicId,
        clinicName: fee.clinic.name,
        prescriptionFees: 0,
        transmissionFees: 0,
        adminFees: 0,
        prescriptionCount: 0,
        transmissionCount: 0,
      };

      switch (fee.feeType) {
        case 'PRESCRIPTION':
          existing.prescriptionFees += fee.amountCents;
          existing.prescriptionCount++;
          break;
        case 'TRANSMISSION':
          existing.transmissionFees += fee.amountCents;
          existing.transmissionCount++;
          break;
        case 'ADMIN':
          existing.adminFees += fee.amountCents;
          break;
      }

      clinicMap.set(fee.clinicId, existing);
    }

    const clinics = Array.from(clinicMap.values()).map((c) => ({
      ...c,
      totalFees: c.prescriptionFees + c.transmissionFees + c.adminFees,
    }));

    const totals = clinics.reduce(
      (acc, c) => ({
        prescriptionFees: acc.prescriptionFees + c.prescriptionFees,
        transmissionFees: acc.transmissionFees + c.transmissionFees,
        adminFees: acc.adminFees + c.adminFees,
        totalFees: acc.totalFees + c.totalFees,
      }),
      { prescriptionFees: 0, transmissionFees: 0, adminFees: 0, totalFees: 0 }
    );

    return { clinics, totals };
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

function formatPeriod(start: Date, end: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };
  return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
}

function generateInvoiceEmailHtml(invoice: {
  invoiceNumber: string;
  totalAmountCents: number;
  prescriptionFeeTotal: number;
  transmissionFeeTotal: number;
  adminFeeTotal: number;
  prescriptionCount: number;
  transmissionCount: number;
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  clinic: { name: string };
  stripeInvoiceUrl?: string | null;
}): string {
  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background: #3B82F6; color: white; padding: 20px; }
        .content { padding: 20px; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .table th { background: #f5f5f5; }
        .total { font-weight: bold; font-size: 18px; }
        .button { display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Platform Invoice</h1>
        <p>Invoice #${invoice.invoiceNumber}</p>
      </div>
      <div class="content">
        <p>Dear ${invoice.clinic.name},</p>
        <p>Please find below your platform usage invoice for the period ${formatPeriod(invoice.periodStart, invoice.periodEnd)}.</p>
        
        <table class="table">
          <tr>
            <th>Description</th>
            <th>Count</th>
            <th>Amount</th>
          </tr>
          ${
            invoice.prescriptionFeeTotal > 0
              ? `
          <tr>
            <td>Medical Prescription Fees</td>
            <td>${invoice.prescriptionCount}</td>
            <td>${formatCurrency(invoice.prescriptionFeeTotal)}</td>
          </tr>
          `
              : ''
          }
          ${
            invoice.transmissionFeeTotal > 0
              ? `
          <tr>
            <td>Prescription Transmission Fees</td>
            <td>${invoice.transmissionCount}</td>
            <td>${formatCurrency(invoice.transmissionFeeTotal)}</td>
          </tr>
          `
              : ''
          }
          ${
            invoice.adminFeeTotal > 0
              ? `
          <tr>
            <td>Weekly Admin/Platform Fee</td>
            <td>-</td>
            <td>${formatCurrency(invoice.adminFeeTotal)}</td>
          </tr>
          `
              : ''
          }
          <tr class="total">
            <td colspan="2">Total Due</td>
            <td>${formatCurrency(invoice.totalAmountCents)}</td>
          </tr>
        </table>
        
        <p><strong>Due Date:</strong> ${invoice.dueDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        
        ${
          invoice.stripeInvoiceUrl
            ? `
        <p>
          <a href="${invoice.stripeInvoiceUrl}" class="button">Pay Invoice Online</a>
        </p>
        `
            : ''
        }
        
        <p>If you have any questions about this invoice, please contact billing@eonpro.com.</p>
        
        <p>Thank you for your business!</p>
        <p>EONPRO Platform</p>
      </div>
    </body>
    </html>
  `;
}

export type ClinicInvoiceService = typeof clinicInvoiceService;
