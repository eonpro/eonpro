import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import {
  generateOtDailyInvoices,
  generateOtPharmacyCSV,
  generateOtDoctorApprovalsCSV,
  generateOtFulfillmentCSV,
  generateOtCombinedCSV,
  generateOtSummaryPDF,
} from '@/services/invoices/otInvoiceGenerationService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const exportSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  format: z.enum(['csv', 'pdf']),
  invoiceType: z.enum(['pharmacy', 'doctor_approvals', 'fulfillment', 'combined', 'summary']),
});

/**
 * POST /api/super-admin/ot-invoices/export
 * Body: { date, endDate?, format, invoiceType }
 * - csv: invoiceType selects which CSV (combined = all sections + summary rows)
 * - pdf: summary statement only (invoiceType should be summary)
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const body = await req.json();
    const parsed = exportSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { date, endDate, format, invoiceType } = parsed.data;
    const data = await generateOtDailyInvoices(date, endDate);
    const dateSlug = endDate ? `${date}_${endDate}` : date;

    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_EXPORT,
      resourceType: 'OtInvoice',
      action: `ot_invoice_export_${invoiceType}_${format}`,
      outcome: 'SUCCESS',
      metadata: { date, endDate, invoiceType, format, clinicId: data.pharmacy.clinicId },
    });

    if (format === 'pdf') {
      const pdfBytes = await generateOtSummaryPDF(data);
      return new NextResponse(Buffer.from(pdfBytes), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="ot-eonpro-invoice-summary-${dateSlug}.pdf"`,
        },
      });
    }

    const csvType =
      invoiceType === 'summary' ? 'combined' : invoiceType;

    let csv: string;
    let filename: string;
    switch (csvType) {
      case 'pharmacy':
        csv = generateOtPharmacyCSV(data.pharmacy);
        filename = `ot-pharmacy-invoice-${dateSlug}.csv`;
        break;
      case 'doctor_approvals':
        csv = generateOtDoctorApprovalsCSV(data.doctorApprovals);
        filename = `ot-doctor-approvals-invoice-${dateSlug}.csv`;
        break;
      case 'fulfillment':
        csv = generateOtFulfillmentCSV(data.fulfillment);
        filename = `ot-fulfillment-invoice-${dateSlug}.csv`;
        break;
      case 'combined':
        csv = generateOtCombinedCSV(data);
        filename = `ot-combined-invoice-${dateSlug}.csv`;
        break;
    }

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('[SuperAdmin] OT invoice export failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to export OT invoice' }, { status: 500 });
  }
});
