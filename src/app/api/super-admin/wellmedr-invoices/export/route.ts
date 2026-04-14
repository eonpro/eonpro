import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import {
  generateDailyInvoices,
  generatePharmacyCSV,
  generatePharmacyPDF,
  generatePrescriptionServicesCSV,
  generatePrescriptionServicesPDF,
} from '@/services/invoices/wellmedrInvoiceGenerationService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const exportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  format: z.enum(['csv', 'pdf']),
  invoiceType: z.enum(['pharmacy', 'prescription_services']),
});

/**
 * POST /api/super-admin/wellmedr-invoices/export
 *
 * Exports a WellMedR invoice as CSV or PDF.
 * Body: { date, endDate?, format, invoiceType }
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = exportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, endDate, format, invoiceType } = parsed.data;
    const invoices = await generateDailyInvoices(date, endDate);

    const dateSlug = endDate ? `${date}_${endDate}` : date;

    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_EXPORT,
      resourceType: 'WellmedrInvoice',
      action: `wellmedr_invoice_export_${invoiceType}_${format}`,
      outcome: 'SUCCESS',
      metadata: { date, endDate, invoiceType, format },
    });

    if (invoiceType === 'pharmacy') {
      if (format === 'csv') {
        const csv = generatePharmacyCSV(invoices.pharmacy);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="wellmedr-pharmacy-invoice-${dateSlug}.csv"`,
          },
        });
      }

      const pdfBytes = await generatePharmacyPDF(invoices.pharmacy);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="wellmedr-pharmacy-invoice-${dateSlug}.pdf"`,
        },
      });
    }

    // prescription_services
    if (format === 'csv') {
      const csv = generatePrescriptionServicesCSV(invoices.prescriptionServices);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="wellmedr-rx-services-invoice-${dateSlug}.csv"`,
        },
      });
    }

    const pdfBytes = await generatePrescriptionServicesPDF(invoices.prescriptionServices);
    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="wellmedr-rx-services-invoice-${dateSlug}.pdf"`,
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] WellMedR invoice export failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to export WellMedR invoice' }, { status: 500 });
  }
});
