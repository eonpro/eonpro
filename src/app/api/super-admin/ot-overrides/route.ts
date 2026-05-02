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
  otAllocationOverridePayloadSchema,
  otAllocationOverrideStatusSchema,
  reconcileOtAllocationMedLineTotals,
  type OtAllocationOverrideStatus,
} from '@/services/invoices/otAllocationOverrideTypes';
import { attachSalesRepFromOtDisposition } from '@/services/sales-rep/otDispositionAssignment';

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

const querySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
    .refine(isValidYmd, 'Invalid calendar date'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be YYYY-MM-DD')
    .refine(isValidYmd, 'Invalid calendar end date')
    .optional(),
});

const upsertSchema = z.object({
  orderId: z.number().int().positive(),
  payload: otAllocationOverridePayloadSchema,
  status: otAllocationOverrideStatusSchema,
});

async function resolveOtClinicId(): Promise<number | null> {
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true },
  });
  return clinic?.id ?? null;
}

/**
 * GET /api/super-admin/ot-overrides?date=YYYY-MM-DD[&endDate=YYYY-MM-DD]
 *
 * Lists all `OtSaleAllocationOverride` rows whose `Order.approvedAt` (or
 * `createdAt` when null) falls in the Eastern-time window. Keyed by orderId
 * so the editor can merge with the per-sale reconciliation in one pass.
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
      { status: 400 }
    );
  }
  const { date, endDate } = parsed.data;

  const clinicId = await resolveOtClinicId();
  if (!clinicId) {
    return NextResponse.json(
      { error: `OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})` },
      { status: 404 }
    );
  }

  /** Window matches generateOtDailyInvoices for consistency. */
  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);
  /** Wide order-side window so a finalized override on a paid invoice with a slightly drifted Order date still loads. */
  const orderStart = new Date(periodStart.getTime() - 45 * 86_400_000);
  const orderEnd = new Date(periodEnd.getTime() + 14 * 86_400_000);

  let rows: Array<{
    id: number;
    orderId: number;
    overridePayload: Prisma.JsonValue;
    status: 'DRAFT' | 'FINALIZED';
    updatedAt: Date;
    finalizedAt: Date | null;
    lastEditedByUserId: number | null;
  }>;
  try {
    rows = await basePrisma.otSaleAllocationOverride.findMany({
      where: {
        clinicId,
        order: {
          OR: [
            { createdAt: { gte: orderStart, lte: orderEnd } },
            { approvedAt: { gte: orderStart, lte: orderEnd } },
          ],
        },
      },
      select: {
        id: true,
        orderId: true,
        overridePayload: true,
        status: true,
        updatedAt: true,
        finalizedAt: true,
        lastEditedByUserId: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
  } catch (err) {
    /**
     * Graceful fallback: if the table doesn't exist yet (deploy/migrate window) or the
     * relation is unrecognized (Prisma client mid-rollout), return an empty list with a
     * 200 instead of erroring the whole tab. The editor still works against computed
     * defaults; admins lose only the saved-overrides overlay until the deploy finishes.
     */
    const e = err instanceof Error ? err : new Error(String(err));
    const prismaCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
    const prismaMeta = err instanceof Prisma.PrismaClientKnownRequestError ? err.meta : undefined;
    /** P2021 = table does not exist; P2022 = column does not exist; P2025 = record not found. */
    const isMissingSchema =
      prismaCode === 'P2021' ||
      prismaCode === 'P2022' ||
      e.message.includes('does not exist') ||
      e.message.includes('Unknown arg `order`') ||
      e.message.includes('does not exist in the current database');
    logger.error('[OT overrides] load failed', {
      message: e.message,
      userId: user.id,
      clinicId,
      prismaCode,
      prismaMeta,
      gracefulFallback: isMissingSchema,
    });
    if (isMissingSchema) {
      return NextResponse.json({
        overrides: [],
        warning:
          'OT overrides table or schema not yet migrated on this environment. Showing computed defaults only.',
      });
    }
    return NextResponse.json({ error: 'Failed to load OT overrides' }, { status: 500 });
  }

  /** Audit must not block the read. */
  try {
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'OtSaleAllocationOverride',
      action: 'ot_sale_override_list',
      outcome: 'SUCCESS',
      metadata: { date, endDate, clinicId, count: rows.length },
    });
  } catch (auditErr) {
    logger.error('[OT overrides] audit log failed; returning rows anyway', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      userId: user.id,
    });
  }

  return NextResponse.json({
    overrides: rows.map((r) => ({
      orderId: r.orderId,
      payload: r.overridePayload,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      finalizedAt: r.finalizedAt?.toISOString() ?? null,
      lastEditedByUserId: r.lastEditedByUserId,
    })),
  });
});

/**
 * POST /api/super-admin/ot-overrides
 * Body: { orderId, payload, status: 'DRAFT' | 'FINALIZED' }
 *
 * Upserts a per-Order override row. `Order.patient.clinicId` is verified to
 * be the OT clinic before write — defensive guard against orderId guessing.
 */
export const POST = withSuperAdminAuth(async (req: NextRequest, user: AuthUser) => {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = upsertSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { orderId, payload, status } = parsed.data;

  /** Defense-in-depth: snap `lineTotalCents` to `unitPriceCents * quantity`. */
  const reconciledPayload = {
    ...payload,
    meds: reconcileOtAllocationMedLineTotals(payload.meds),
  };

  const clinicId = await resolveOtClinicId();
  if (!clinicId) {
    return NextResponse.json(
      { error: `OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})` },
      { status: 404 }
    );
  }

  /** Verify the order belongs to an OT-clinic patient before any write.
   * Also fetches `patientId` so we can attach the rep to the patient after
   * the override save (see "Auto-attach manual rep to patient" below). */
  const order = await basePrisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, patientId: true, patient: { select: { clinicId: true } } },
  });
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  }
  if (order.patient.clinicId !== clinicId) {
    logger.security('[OT overrides] cross-clinic order id rejected', {
      userId: user.id,
      requestedOrderId: orderId,
      orderPatientClinicId: order.patient.clinicId,
      otClinicId: clinicId,
    });
    return NextResponse.json({ error: 'Order does not belong to OT clinic' }, { status: 403 });
  }

  let isCreate = false;
  let resultId: number;
  try {
    const result = await basePrisma.$transaction(async (tx) => {
      const existing = await tx.otSaleAllocationOverride.findUnique({
        where: { orderId },
        select: { id: true },
      });
      isCreate = !existing;
      const finalizedAt = status === 'FINALIZED' ? new Date() : null;
      const upserted = await tx.otSaleAllocationOverride.upsert({
        where: { orderId },
        create: {
          clinicId,
          orderId,
          /** Cast: Prisma's Json input expects InputJsonValue; the Zod-validated payload is structurally compatible. */
          overridePayload: reconciledPayload as unknown as Prisma.InputJsonValue,
          status,
          lastEditedByUserId: user.id,
          finalizedAt,
        },
        update: {
          overridePayload: reconciledPayload as unknown as Prisma.InputJsonValue,
          status,
          lastEditedByUserId: user.id,
          ...(status === 'FINALIZED' ? { finalizedAt: new Date() } : {}),
        },
        select: {
          id: true,
          orderId: true,
          status: true,
          updatedAt: true,
          finalizedAt: true,
          lastEditedByUserId: true,
        },
      });
      return upserted;
    });
    resultId = result.id;

    /** Audit (best-effort). */
    try {
      const action = mapOverrideAction(status, isCreate);
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        eventType: isCreate ? AuditEventType.PHI_CREATE : AuditEventType.PHI_UPDATE,
        resourceType: 'OtSaleAllocationOverride',
        resourceId: String(resultId),
        action,
        outcome: 'SUCCESS',
        /** PHI safety: only ids + counts in the audit. Never log the payload blob. */
        metadata: {
          orderId,
          clinicId,
          status,
          medsCount: reconciledPayload.meds.length,
          customLineCount: reconciledPayload.customLineItems.length,
          notesPresent: !!reconciledPayload.notes,
        },
      });
    } catch (auditErr) {
      logger.error('[OT overrides] audit log failed; upsert succeeded', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        userId: user.id,
        orderId,
      });
    }

    /**
     * Auto-attach manual rep to patient.
     * When the admin picks a sales rep on this disposition row, attach them
     * to the patient via `PatientSalesRepAssignment` so future commission
     * events for the same patient inherit the rep automatically. Best-effort:
     * the helper never throws, so a transient assignment failure cannot
     * break the override save itself.
     */
    if (reconciledPayload.salesRepId != null) {
      await attachSalesRepFromOtDisposition({
        patientId: order.patientId,
        salesRepId: reconciledPayload.salesRepId,
        clinicId,
        assignedById: user.id,
        source: 'ot_rx_override',
        overrideResourceId: resultId,
        request: req,
      });
    }

    return NextResponse.json({
      success: true,
      override: {
        orderId: result.orderId,
        status: result.status,
        updatedAt: result.updatedAt.toISOString(),
        finalizedAt: result.finalizedAt?.toISOString() ?? null,
        lastEditedByUserId: result.lastEditedByUserId,
      },
    });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    const prismaLog =
      err instanceof Prisma.PrismaClientKnownRequestError
        ? { code: err.code, meta: err.meta }
        : undefined;
    logger.error('[OT overrides] upsert failed', {
      message: e.message,
      userId: user.id,
      orderId,
      prisma: prismaLog,
    });
    return NextResponse.json({ error: 'Failed to save OT override' }, { status: 500 });
  }
});

function mapOverrideAction(status: OtAllocationOverrideStatus, isCreate: boolean): string {
  if (status === 'FINALIZED') return 'ot_sale_override_finalize';
  return isCreate ? 'ot_sale_override_create' : 'ot_sale_override_save_draft';
}
