/**
 * COMPREHENSIVE INVOICE API
 * =========================
 * Full invoice management with Stripe-level capabilities
 *
 * GET    /api/v2/invoices          - List invoices with filters
 * POST   /api/v2/invoices          - Create new invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withProviderAuth, AuthUser } from '@/lib/auth/middleware';
import {
  createInvoiceManager,
  LineItem,
  InvoiceDiscount,
  InvoiceTax,
} from '@/services/billing/InvoiceManager';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

// Schemas
const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().min(1).default(1),
  unitPrice: z.number().min(0),
  discount: z
    .object({
      type: z.enum(['percentage', 'fixed']),
      value: z.number().min(0),
    })
    .optional(),
  taxRate: z.number().min(0).max(100).optional(),
  metadata: z.record(z.string()).optional(),
});

const discountSchema = z.object({
  type: z.enum(['percentage', 'fixed']),
  value: z.number().min(0),
  description: z.string().optional(),
  couponCode: z.string().optional(),
});

const taxSchema = z.object({
  name: z.string(),
  rate: z.number().min(0).max(100),
  inclusive: z.boolean().optional(),
});

const createInvoiceSchema = z.object({
  patientId: z.number(),
  lineItems: z.array(lineItemSchema).min(1),

  // Optional fields
  description: z.string().optional(),
  memo: z.string().optional(),
  footer: z.string().optional(),
  dueInDays: z.number().min(1).max(365).optional(),
  dueDate: z.string().datetime().optional(),

  // Discounts & taxes
  discount: discountSchema.optional(),
  taxes: z.array(taxSchema).optional(),

  // Settings
  autoSend: z.boolean().optional(),
  autoCharge: z.boolean().optional(),
  collectionMethod: z.enum(['charge_automatically', 'send_invoice']).optional(),
  isDraft: z.boolean().optional(),

  // Custom fields
  customFields: z.record(z.string()).optional(),
  invoiceNumber: z.string().optional(),
  poNumber: z.string().optional(),

  // Related
  orderId: z.number().optional(),

  // Payment terms
  paymentTerms: z.string().optional(),

  metadata: z.record(z.string()).optional(),
});

const querySchema = z.object({
  patientId: z.string().optional(),
  status: z.string().optional(), // comma-separated
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  minAmount: z.string().optional(),
  maxAmount: z.string().optional(),
  overdue: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  orderBy: z.enum(['createdAt', 'dueDate', 'amount']).optional(),
  orderDir: z.enum(['asc', 'desc']).optional(),
});

// GET - List invoices
async function getInvoicesHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams);
    const query = querySchema.parse(params);

    const invoiceManager = createInvoiceManager(user.clinicId);

    const result = await invoiceManager.getInvoices({
      patientId: query.patientId ? parseInt(query.patientId) : undefined,
      status: query.status ? (query.status.split(',') as any) : undefined,
      fromDate: query.fromDate ? new Date(query.fromDate) : undefined,
      toDate: query.toDate ? new Date(query.toDate) : undefined,
      minAmount: query.minAmount ? parseInt(query.minAmount) : undefined,
      maxAmount: query.maxAmount ? parseInt(query.maxAmount) : undefined,
      overdue: query.overdue === 'true',
      search: query.search,
      page: query.page ? parseInt(query.page) : 1,
      limit: query.limit ? parseInt(query.limit) : 20,
      orderBy: query.orderBy,
      orderDir: query.orderDir,
    });

    // Decrypt patient PHI before returning
    const invoices = result.invoices.map((inv: any) => {
      if (inv.patient) {
        try {
          inv.patient = decryptPatientPHI(inv.patient as Record<string, unknown>, [
            'firstName',
            'lastName',
            'email',
            'phone',
          ]);
        } catch (decryptErr) {
          logger.warn('[v2 Invoices] Failed to decrypt patient PHI', {
            patientId: inv.patient?.id,
            error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
          });
        }
      }
      return inv;
    });

    return NextResponse.json({ ...result, invoices });
  } catch (error: any) {
    logger.error('Failed to get invoices', error);
    return NextResponse.json({ error: error.message || 'Failed to get invoices' }, { status: 500 });
  }
}

// POST - Create invoice
async function createInvoiceHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const validated = createInvoiceSchema.parse(body);

    const invoiceManager = createInvoiceManager(user.clinicId);

    // Convert line items
    const lineItems: LineItem[] = validated.lineItems.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discount: item.discount as any,
      taxRate: item.taxRate,
      metadata: item.metadata,
    }));

    let result;

    if (validated.isDraft) {
      // Create draft invoice
      result = await invoiceManager.createDraftInvoice({
        patientId: validated.patientId,
        clinicId: user.clinicId,
        lineItems,
        description: validated.description,
        memo: validated.memo,
        footer: validated.footer,
        dueInDays: validated.dueInDays,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        discount: validated.discount as InvoiceDiscount,
        taxes: validated.taxes as InvoiceTax[],
        customFields: validated.customFields,
        invoiceNumber: validated.invoiceNumber,
        poNumber: validated.poNumber,
        orderId: validated.orderId,
        paymentTerms: validated.paymentTerms,
        metadata: validated.metadata,
      });

      return NextResponse.json({
        success: true,
        invoice: result,
        isDraft: true,
      });
    } else {
      // Create and finalize invoice
      result = await invoiceManager.createInvoice({
        patientId: validated.patientId,
        clinicId: user.clinicId,
        lineItems,
        description: validated.description,
        memo: validated.memo,
        footer: validated.footer,
        dueInDays: validated.dueInDays,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
        discount: validated.discount as InvoiceDiscount,
        taxes: validated.taxes as InvoiceTax[],
        autoSend: validated.autoSend,
        autoCharge: validated.autoCharge,
        collectionMethod: validated.collectionMethod,
        customFields: validated.customFields,
        invoiceNumber: validated.invoiceNumber,
        poNumber: validated.poNumber,
        orderId: validated.orderId,
        paymentTerms: validated.paymentTerms,
        metadata: validated.metadata,
      });

      return NextResponse.json({
        success: true,
        invoice: result.invoice,
        stripeInvoice: result.stripeInvoice
          ? {
              id: result.stripeInvoice.id,
              number: result.stripeInvoice.number,
              hostedUrl: result.stripeInvoice.hosted_invoice_url,
              pdfUrl: result.stripeInvoice.invoice_pdf,
            }
          : null,
        summary: result.summary,
      });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    logger.error('Failed to create invoice', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create invoice' },
      { status: 500 }
    );
  }
}

export const GET = standardRateLimit(withProviderAuth(getInvoicesHandler));
export const POST = standardRateLimit(withProviderAuth(createInvoiceHandler));
