/**
 * PUBLIC INVOICE API
 * ==================
 * Public endpoint for patients to view their invoice (no auth required)
 * Used by the payment page
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const resolvedParams = await context.params;
    const invoiceIdParam = resolvedParams.invoiceId;
    const invoiceId = parseInt(invoiceIdParam);

    logger.debug('Invoice payment page request', { invoiceIdParam, invoiceId });

    if (isNaN(invoiceId)) {
      return NextResponse.json(
        { error: 'Invalid invoice ID', received: invoiceIdParam },
        { status: 400 }
      );
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

    let patientDisplay = { firstName: invoice.patient.firstName, lastName: invoice.patient.lastName };
    try {
      const decrypted = decryptPatientPHI(invoice.patient as Record<string, unknown>, [
        'firstName',
        'lastName',
      ]);
      patientDisplay = {
        firstName: (decrypted.firstName as string) || patientDisplay.firstName,
        lastName: (decrypted.lastName as string) || patientDisplay.lastName,
      };
    } catch (decryptErr) {
      logger.warn('[Pay Invoice] Failed to decrypt patient PHI', {
        patientId: invoice.patient.id,
        error: decryptErr instanceof Error ? decryptErr.message : String(decryptErr),
      });
    }

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
        patient: patientDisplay,
        clinic: invoice.clinic,
      },
    });
  } catch (error: any) {
    logger.error('Failed to fetch invoice for payment', error);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}
