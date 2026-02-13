/**
 * INDIVIDUAL INVOICE API
 * ======================
 * Operations on a specific invoice
 *
 * GET    /api/v2/invoices/[id]              - Get invoice details
 * PUT    /api/v2/invoices/[id]              - Update invoice
 * DELETE /api/v2/invoices/[id]              - Void invoice
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyAuth } from '@/lib/auth/middleware';
import { createInvoiceManager } from '@/services/billing/InvoiceManager';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

const updateSchema = z.object({
  description: z.string().optional(),
  memo: z.string().optional(),
  footer: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  discount: z
    .object({
      type: z.enum(['percentage', 'fixed']),
      value: z.number().min(0),
      description: z.string().optional(),
    })
    .optional(),
  customFields: z.record(z.string()).optional(),
  metadata: z.record(z.string()).optional(),
});

// GET - Get invoice details
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Verify auth
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = authResult.user;

    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const invoiceManager = createInvoiceManager(user.clinicId);
    const invoice = await invoiceManager.getInvoice(invoiceId);

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.patient) {
      try {
        invoice.patient = decryptPatientPHI(invoice.patient as Record<string, unknown>, [
          'firstName',
          'lastName',
          'email',
          'phone',
        ]);
      } catch (decryptErr) {
        logger.warn('[v2 Invoices] Failed to decrypt patient PHI', {
          patientId: invoice.patient?.id,
          error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
        });
      }
    }

    const patientSummary = await invoiceManager.getPatientInvoiceSummary(invoice.patientId);

    return NextResponse.json({
      invoice,
      patientSummary,
    });
  } catch (error: any) {
    logger.error('Failed to get invoice', error);
    return NextResponse.json({ error: error.message || 'Failed to get invoice' }, { status: 500 });
  }
}

// PUT - Update invoice
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Verify auth
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = authResult.user;

    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const body = await req.json();
    const validated = updateSchema.parse(body);

    const invoiceManager = createInvoiceManager(user.clinicId);

    const invoice = await invoiceManager.updateInvoice(invoiceId, {
      ...validated,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : undefined,
    });

    return NextResponse.json({
      success: true,
      invoice,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    logger.error('Failed to update invoice', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update invoice' },
      { status: 500 }
    );
  }
}

// DELETE - Void invoice
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    // Verify auth
    const authResult = await verifyAuth(req);
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const user = authResult.user;

    const { id } = await params;
    const invoiceId = parseInt(id);

    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }

    const url = new URL(req.url);
    const reason = url.searchParams.get('reason') || undefined;

    const invoiceManager = createInvoiceManager(user.clinicId);
    const invoice = await invoiceManager.voidInvoice(invoiceId, reason);

    return NextResponse.json({
      success: true,
      invoice,
      message: 'Invoice voided successfully',
    });
  } catch (error: any) {
    logger.error('Failed to void invoice', error);
    return NextResponse.json({ error: error.message || 'Failed to void invoice' }, { status: 500 });
  }
}
