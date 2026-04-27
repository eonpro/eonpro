import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma } from '@/lib/db';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { OT_CLINIC_SUBDOMAIN } from '@/lib/invoices/ot-pricing';
import { midnightInTz } from '@/lib/utils/timezone';
import {
  generateOtDailyInvoices,
  applyOtAllocationOverrides,
  generateOtCustomReconciliationPDF,
  OtInvoiceConfigurationError,
  type OtAllocationOverrideMeta,
} from '@/services/invoices/otInvoiceGenerationService';
import {
  otAllocationOverridePayloadSchema,
  type OtAllocationOverridePayload,
} from '@/services/invoices/otAllocationOverrideTypes';

const CLINIC_TZ = 'America/New_York';

function withSuperAdminAuth(handler: (req: NextRequest, user: AuthUser) => Promise<Response>) {
  return withAuth(handler, { roles: ['super_admin'] });
}

function isValidYmd(s: string): boolean {
  const [y, m, d] = s.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const exportSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidYmd, 'Invalid calendar date'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isValidYmd, 'Invalid calendar end date')
    .optional(),
  format: z.literal('pdf'),
});

/**
 * POST /api/super-admin/ot-overrides/export
 * Body: { date, endDate?, format: 'pdf' }
 *
 * Generates the branded EONPro -> OT clinic reconciliation PDF for the period,
 * substituting any saved overrides where present and falling back to the
 * computed defaults otherwise. Sales without an override are flagged
 * COMPUTED in the PDF so reviewers know which rows were elected manually.
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { date, endDate } = parsed.data;

  let data: Awaited<ReturnType<typeof generateOtDailyInvoices>>;
  try {
    data = await generateOtDailyInvoices(date, endDate);
  } catch (err) {
    if (err instanceof OtInvoiceConfigurationError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error('[OT overrides export] daily generation failed', {
      message: e.message,
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to generate OT report' }, { status: 500 });
  }

  /**
   * Pull every override for orderIds in the period (constrained by clinic for tenant safety).
   * We use Eastern-time window matching the generator above so the override list always
   * lines up with the per-sale reconciliation rows.
   */
  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);
  const orderStart = new Date(periodStart.getTime() - 45 * 86_400_000);
  const orderEnd = new Date(periodEnd.getTime() + 14 * 86_400_000);

  const orderIdsInPeriod = data.perSaleReconciliation.map((s) => s.orderId);

  let overrideRows: Array<{
    orderId: number;
    overridePayload: Prisma.JsonValue;
    status: 'DRAFT' | 'FINALIZED';
    updatedAt: Date;
    finalizedAt: Date | null;
    lastEditedByUserId: number | null;
  }> = [];
  if (orderIdsInPeriod.length > 0) {
    overrideRows = await basePrisma.otSaleAllocationOverride.findMany({
      where: {
        clinicId: data.pharmacy.clinicId,
        OR: [
          { orderId: { in: orderIdsInPeriod } },
          {
            order: {
              OR: [
                { createdAt: { gte: orderStart, lte: orderEnd } },
                { approvedAt: { gte: orderStart, lte: orderEnd } },
              ],
            },
          },
        ],
      },
      select: {
        orderId: true,
        overridePayload: true,
        status: true,
        updatedAt: true,
        finalizedAt: true,
        lastEditedByUserId: true,
      },
    });
  }

  const overridesByOrderId = new Map<number, OtAllocationOverrideMeta>();
  for (const r of overrideRows) {
    /** Validate the stored blob against the current schema to avoid PDF crashes if the row is corrupt. */
    const parsedPayload = otAllocationOverridePayloadSchema.safeParse(r.overridePayload);
    if (!parsedPayload.success) {
      logger.warn('[OT overrides export] stored payload failed schema; skipping override', {
        orderId: r.orderId,
        userId: user.id,
      });
      continue;
    }
    const payload: OtAllocationOverridePayload = parsedPayload.data;
    overridesByOrderId.set(r.orderId, {
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      lastEditedByUserId: r.lastEditedByUserId,
      finalizedAt: r.finalizedAt?.toISOString() ?? null,
      payload,
    });
  }

  const reconciliation = applyOtAllocationOverrides(data, overridesByOrderId);
  const dateSlug = endDate ? `${date}_${endDate}` : date;

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await generateOtCustomReconciliationPDF(data, reconciliation);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    logger.error('[OT overrides export] PDF generation failed', {
      message: e.message,
      userId: user.id,
      saleCount: reconciliation.lines.length,
    });
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }

  /** Audit (best-effort). */
  try {
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_EXPORT,
      resourceType: 'OtSaleAllocationOverride',
      action: 'ot_sale_override_pdf',
      outcome: 'SUCCESS',
      metadata: {
        date,
        endDate,
        clinicId: data.pharmacy.clinicId,
        saleCount: reconciliation.totals.saleCount,
        draftCount: reconciliation.totals.draftCount,
        finalizedCount: reconciliation.totals.finalizedCount,
        computedCount: reconciliation.totals.computedCount,
      },
    });
  } catch (auditErr) {
    logger.error('[OT overrides export] audit log failed; returning PDF anyway', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      userId: user.id,
    });
  }

  return new NextResponse(Buffer.from(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ot-manual-reconciliation-${dateSlug}.pdf"`,
    },
  });
});
