import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { clinicInvoiceService } from '@/services/billing';
import { logger } from '@/lib/logger';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    const params = await context.params;
    return withAuth(
      (req: NextRequest, user: AuthUser) => handler(req, user, params),
      { roles: ['super_admin'] }
    )(req);
  };
}

/**
 * GET /api/super-admin/clinic-invoices/[id]
 * Get invoice details with fee breakdown
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const invoiceId = parseInt(params.id);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const invoice = await clinicInvoiceService.getInvoiceById(invoiceId);

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    logger.error('[SuperAdmin] Error getting invoice', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: params.id,
    });
    return NextResponse.json(
      { error: 'Failed to get invoice' },
      { status: 500 }
    );
  }
});

// Validation schema for invoice actions
const invoiceActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('finalize'),
  }),
  z.object({
    action: z.literal('createStripeInvoice'),
  }),
  z.object({
    action: z.literal('send'),
  }),
  z.object({
    action: z.literal('markPaid'),
    amountCents: z.number().int().positive(),
    method: z.string().min(1).max(50),
    reference: z.string().max(100).optional(),
  }),
  z.object({
    action: z.literal('cancel'),
    reason: z.string().min(1).max(500),
  }),
]);

/**
 * PATCH /api/super-admin/clinic-invoices/[id]
 * Perform actions on an invoice (finalize, send, mark paid, cancel)
 */
export const PATCH = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const invoiceId = parseInt(params.id);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const result = invoiceActionSchema.safeParse(body);
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid action', details: result.error.flatten() },
        { status: 400 }
      );
    }

    let invoice;
    const action = result.data;

    switch (action.action) {
      case 'finalize':
        invoice = await clinicInvoiceService.finalizeInvoice(invoiceId, user.id);
        break;

      case 'createStripeInvoice':
        invoice = await clinicInvoiceService.createStripeInvoice(invoiceId);
        break;

      case 'send':
        invoice = await clinicInvoiceService.sendInvoice(invoiceId, user.id);
        break;

      case 'markPaid':
        invoice = await clinicInvoiceService.markAsPaid(
          invoiceId,
          {
            amountCents: action.amountCents,
            method: action.method,
            reference: action.reference,
          },
          user.id
        );
        break;

      case 'cancel':
        invoice = await clinicInvoiceService.cancelInvoice(
          invoiceId,
          action.reason,
          user.id
        );
        break;

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }

    logger.info('[SuperAdmin] Invoice action performed', {
      invoiceId,
      action: action.action,
      performedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error performing invoice action', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: params.id,
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to perform action' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/clinic-invoices/[id]
 * Delete a draft invoice (restores fee events to pending)
 */
export const DELETE = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string }) => {
  try {
    const invoiceId = parseInt(params.id);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID' },
        { status: 400 }
      );
    }

    // Get invoice to check status
    const invoice = await clinicInvoiceService.getInvoiceById(invoiceId);

    if (!invoice) {
      return NextResponse.json(
        { error: 'Invoice not found' },
        { status: 404 }
      );
    }

    if (invoice.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'Only draft invoices can be deleted. Use cancel for finalized invoices.' },
        { status: 400 }
      );
    }

    // Cancel the invoice (which restores fee events)
    await clinicInvoiceService.cancelInvoice(
      invoiceId,
      `Deleted by super admin ${user.id}`,
      user.id
    );

    logger.info('[SuperAdmin] Deleted draft invoice', {
      invoiceId,
      deletedBy: user.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Invoice deleted and fee events restored to pending',
    });
  } catch (error) {
    logger.error('[SuperAdmin] Error deleting invoice', {
      error: error instanceof Error ? error.message : 'Unknown error',
      invoiceId: params.id,
    });
    return NextResponse.json(
      { error: 'Failed to delete invoice' },
      { status: 500 }
    );
  }
});
