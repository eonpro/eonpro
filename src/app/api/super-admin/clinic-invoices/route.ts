import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { clinicInvoiceService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

// Validation schema for list query
const listQuerySchema = z.object({
  clinicId: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : undefined)),
  status: z.enum(['DRAFT', 'PENDING', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
  periodType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).optional(),
  startDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v) : undefined)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
  offset: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 0)),
});

/**
 * GET /api/super-admin/clinic-invoices
 * List all clinic invoices with filters
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const queryParams = Object.fromEntries(searchParams.entries());

    const result = listQuerySchema.safeParse(queryParams);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const { clinicId, status, periodType, startDate, endDate, limit, offset } = result.data;

    // Get invoices
    const { invoices, total } = await clinicInvoiceService.listInvoices({
      clinicId,
      status,
      periodType,
      startDate,
      endDate,
      limit,
      offset,
    });

    // Get summary
    const summary = await clinicInvoiceService.getInvoiceSummary(clinicId);

    return NextResponse.json({
      invoices,
      total,
      summary,
      pagination: {
        limit,
        offset,
        total,
        hasMore: offset + invoices.length < total,
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error listing clinic invoices', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to list invoices' }, { status: 500 });
  }
});

// Validation schema for invoice generation
const generateInvoiceSchema = z.object({
  clinicId: z.number().int().positive(),
  periodType: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']),
  periodStart: z.string().transform((v) => new Date(v)),
  periodEnd: z.string().transform((v) => new Date(v)),
  notes: z.string().max(1000).optional(),
  externalNotes: z.string().max(1000).optional(),
  createStripeInvoice: z.boolean().optional().default(false),
});

/**
 * POST /api/super-admin/clinic-invoices
 * Generate a new invoice for a clinic
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const result = generateInvoiceSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: result.error.flatten() },
        { status: 400 }
      );
    }

    const {
      clinicId,
      periodType,
      periodStart,
      periodEnd,
      notes,
      externalNotes,
      createStripeInvoice,
    } = result.data;

    // Generate invoice
    let invoice = await clinicInvoiceService.generateInvoice({
      clinicId,
      periodType,
      periodStart,
      periodEnd,
      actorId: user.id,
      notes,
      externalNotes,
    });

    // Optionally create Stripe invoice
    if (createStripeInvoice) {
      invoice = await clinicInvoiceService.createStripeInvoice(invoice.id);
    }

    logger.info('[SuperAdmin] Generated clinic invoice', {
      invoiceId: invoice.id,
      clinicId,
      periodType,
      totalAmountCents: invoice.totalAmountCents,
      generatedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error generating invoice', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate invoice' },
      { status: 500 }
    );
  }
});
