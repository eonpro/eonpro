import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';
import {
  generateOtDailyInvoices,
  OtInvoiceConfigurationError,
} from '@/services/invoices/otInvoiceGenerationService';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

function isValidCalendarYmd(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine(isValidCalendarYmd, 'Invalid calendar date'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
    .refine(isValidCalendarYmd, 'Invalid calendar end date')
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
    if (error instanceof OtInvoiceConfigurationError) {
      logger.error('[SuperAdmin] OT invoice generation — configuration', {
        message: error.message,
        userId: user.id,
      });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    const err = error instanceof Error ? error : new Error(String(error));
    const prismaLog =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? { code: error.code, meta: error.meta }
        : undefined;
    logger.error('[SuperAdmin] OT invoice generation failed', {
      message: err.message,
      stack: err.stack,
      userId: user.id,
      prisma: prismaLog,
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
        paymentRowCount: data.paymentCollections.length,
        paymentsCollectedNetCents: data.paymentsCollectedNetCents,
        grossSalesCents: data.platformCompensation.grossSalesCents,
        grandTotalCents: data.grandTotalCents,
        clinicNetPayoutCents: data.clinicNetPayoutCents,
        salesRepCommissionTotalCents: data.salesRepCommissionTotalCents,
        managerOverrideTotalCents: data.managerOverrideTotalCents,
        merchantFeeCents: data.merchantProcessing.feeCents,
        platformFeeCents: data.platformCompensation.feeCents,
        feesUseCashCollectedBasis: data.feesUseCashCollectedBasis,
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
