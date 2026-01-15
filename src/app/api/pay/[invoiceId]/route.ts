/**
 * PUBLIC INVOICE API
 * ==================
 * Public endpoint for patients to view their invoice (no auth required)
 * Used by the payment page
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId: invoiceIdParam } = await params;
    const invoiceId = parseInt(invoiceIdParam);
    
    if (isNaN(invoiceId)) {
      return NextResponse.json({ error: 'Invalid invoice ID' }, { status: 400 });
    }
    
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        patient: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        clinic: {
          select: {
            name: true,
          },
        },
      },
    });
    
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    
    // Return limited data for security (no sensitive patient info)
    return NextResponse.json({
      invoice: {
        id: invoice.id,
        amount: invoice.amount,
        amountDue: invoice.amountDue,
        amountPaid: invoice.amountPaid,
        status: invoice.status,
        description: invoice.description,
        dueDate: invoice.dueDate,
        stripeInvoiceUrl: invoice.stripeInvoiceUrl,
        lineItems: invoice.lineItems || [],
        patient: {
          firstName: invoice.patient.firstName,
          lastName: invoice.patient.lastName,
        },
        clinic: invoice.clinic,
      },
    });
    
  } catch (error: any) {
    logger.error('Failed to fetch invoice for payment', error);
    return NextResponse.json(
      { error: 'Failed to load invoice' },
      { status: 500 }
    );
  }
}
