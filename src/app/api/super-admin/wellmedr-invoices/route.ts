import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { generateDailyInvoices } from '@/services/invoices/wellmedrInvoiceGenerationService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
    .optional(),
});

/**
 * GET /api/super-admin/wellmedr-invoices?date=YYYY-MM-DD[&endDate=YYYY-MM-DD]
 *
 * Generates and returns both WellMedR invoices (pharmacy products + prescription services)
 * for the given date or date range.
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      date: searchParams.get('date'),
      endDate: searchParams.get('endDate') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, endDate } = parsed.data;
    const invoices = await generateDailyInvoices(date, endDate);

    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'WellmedrInvoice',
      action: 'wellmedr_invoice_generate',
      outcome: 'SUCCESS',
      metadata: {
        date,
        endDate,
        pharmacyTotal: invoices.pharmacy.totalCents,
        rxServicesTotal: invoices.prescriptionServices.totalCents,
      },
    });

    return NextResponse.json(invoices);
  } catch (error) {
    logger.error('[SuperAdmin] WellMedR invoice generation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to generate WellMedR invoices' }, { status: 500 });
  }
});
