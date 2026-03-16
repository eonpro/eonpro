import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { billingExportService } from '@/services/billing/billingExportService';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const exportSchema = z.object({
  type: z.enum(['invoice-html', 'report-excel', 'report-csv', 'quickbooks', 'xero']),
  invoiceId: z.number().int().positive().optional(),
  startDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  endDate: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  clinicId: z.number().int().positive().optional(),
});

/**
 * POST /api/super-admin/billing-exports
 * Generate and download billing exports in various formats.
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

    const { type, invoiceId, startDate, endDate, clinicId } = parsed.data;
    const now = new Date();
    const defaultStart = startDate ?? new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const defaultEnd = endDate ?? now;

    switch (type) {
      case 'invoice-html': {
        if (!invoiceId) {
          return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 });
        }
        const html = await billingExportService.generateInvoiceHTML(invoiceId);
        return new NextResponse(html, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `inline; filename="invoice-${invoiceId}.html"`,
          },
        });
      }

      case 'report-excel': {
        const buffer = await billingExportService.generateExcelReport(defaultStart, defaultEnd, clinicId);
        return new NextResponse(buffer, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="billing-report-${defaultStart.toISOString().split('T')[0]}-to-${defaultEnd.toISOString().split('T')[0]}.xlsx"`,
          },
        });
      }

      case 'report-csv': {
        const csv = await billingExportService.generateCSVReport(defaultStart, defaultEnd, clinicId);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="billing-report-${defaultStart.toISOString().split('T')[0]}-to-${defaultEnd.toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      case 'quickbooks': {
        const iif = await billingExportService.generateQuickBooksIIF(defaultStart, defaultEnd);
        return new NextResponse(iif, {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': `attachment; filename="eonpro-invoices-${defaultStart.toISOString().split('T')[0]}-to-${defaultEnd.toISOString().split('T')[0]}.iif"`,
          },
        });
      }

      case 'xero': {
        const csv = await billingExportService.generateXeroCSV(defaultStart, defaultEnd);
        return new NextResponse(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="eonpro-xero-import-${defaultStart.toISOString().split('T')[0]}-to-${defaultEnd.toISOString().split('T')[0]}.csv"`,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'Unknown export type' }, { status: 400 });
    }
  } catch (error) {
    logger.error('[SuperAdmin] Billing export error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Export failed' },
      { status: 500 }
    );
  }
});
