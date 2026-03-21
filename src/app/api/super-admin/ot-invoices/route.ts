import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import { generateOtDailyInvoices } from '@/services/invoices/otInvoiceGenerationService';
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
 * GET /api/super-admin/ot-invoices?date=YYYY-MM-DD[&endDate=YYYY-MM-DD]
 *
 * OT (ot.eonpro.io) internal invoices for EONPro reconciliation.
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    date: searchParams.get('date'),
    endDate: searchParams.get('endDate') || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { date, endDate } = parsed.data;

  let data: Awaited<ReturnType<typeof generateOtDailyInvoices>>;
  try {
    data = await generateOtDailyInvoices(date, endDate);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[SuperAdmin] OT invoice generation failed', {
      message: err.message,
      stack: err.stack,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to generate OT invoices' }, { status: 500 });
  }

  // Audit must not block the report: hipaa-audit can throw if all channels fail.
  try {
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'OtInvoice',
      action: 'ot_invoice_generate',
      outcome: 'SUCCESS',
      metadata: {
        date,
        endDate,
        clinicId: data.pharmacy.clinicId,
        orderCount: data.pharmacy.orderCount,
        grossSalesCents: data.platformCompensation.grossSalesCents,
        grandTotalCents: data.grandTotalCents,
        clinicNetPayoutCents: data.clinicNetPayoutCents,
        salesRepCommissionTotalCents: data.salesRepCommissionTotalCents,
        managerOverrideTotalCents: data.managerOverrideTotalCents,
        merchantFeeCents: data.merchantProcessing.feeCents,
        platformFeeCents: data.platformCompensation.feeCents,
      },
    });
  } catch (auditError) {
    logger.error('[SuperAdmin] OT invoice audit log failed; returning report anyway', {
      error: auditError instanceof Error ? auditError.message : String(auditError),
      userId: user.id,
    });
  }

  return NextResponse.json(data);
});
