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
  otNonRxChargeKindSchema,
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

/**
 * Upsert payload for non-Rx disposition overrides. Either `invoiceId` or
 * `paymentId` must be set (never both, never neither). `dispositionKey` is
 * recomputed server-side from whichever is set, so the client cannot smuggle
 * in a key that doesn't match its referenced record (defense-in-depth).
 */
const upsertSchema = z
  .object({
    invoiceId: z.number().int().positive().nullable().default(null),
    paymentId: z.number().int().positive().nullable().default(null),
    chargeKind: otNonRxChargeKindSchema,
    payload: otAllocationOverridePayloadSchema,
    status: otAllocationOverrideStatusSchema,
  })
  .refine((v) => (v.invoiceId == null) !== (v.paymentId == null), {
    message: 'Exactly one of invoiceId or paymentId must be provided',
    path: ['invoiceId'],
  });

async function resolveOtClinicId(): Promise<number | null> {
  const clinic = await basePrisma.clinic.findFirst({
    where: { subdomain: OT_CLINIC_SUBDOMAIN, status: 'ACTIVE' },
    select: { id: true },
  });
  return clinic?.id ?? null;
}

function dispositionKeyFor(invoiceId: number | null, paymentId: number | null): string {
  if (invoiceId != null) return `inv:${invoiceId}`;
  if (paymentId != null) return `pay:${paymentId}`;
  /** Should be unreachable because Zod refine rejects this case. */
  throw new Error('dispositionKeyFor: invoiceId and paymentId are both null');
}

// ---------------------------------------------------------------------------
// GET — list overrides for the period
// ---------------------------------------------------------------------------

/**
 * GET /api/super-admin/ot-nonrx-overrides?date=YYYY-MM-DD[&endDate=YYYY-MM-DD]
 *
 * Lists all `OtNonRxAllocationOverride` rows whose linked invoice's `paidAt`
 * (or, for invoice-less rows, the linked payment's `paidAt`/`createdAt`) lands
 * in the wide Eastern-time window — same buffering as the Rx route so a
 * finalized override on a slightly drifted record still loads.
 *
 * Graceful fallback: if the table or column doesn't exist (deploy/migrate
 * window) we return an empty list with a `warning` instead of 500'ing the tab.
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

  /** Window matches generateOtDailyInvoices for consistency, then padded. */
  const [sY, sM, sD] = date.split('-').map(Number);
  const periodStart = midnightInTz(sY, sM - 1, sD, CLINIC_TZ);
  const endStr = endDate ?? date;
  const [eY, eM, eD] = endStr.split('-').map(Number);
  const nextDay = midnightInTz(eY, eM - 1, eD + 1, CLINIC_TZ);
  const periodEnd = new Date(nextDay.getTime() - 1);
  const wideStart = new Date(periodStart.getTime() - 14 * 86_400_000);
  const wideEnd = new Date(periodEnd.getTime() + 14 * 86_400_000);

  let rows: Array<{
    id: number;
    dispositionKey: string;
    invoiceId: number | null;
    paymentId: number | null;
    chargeKind: 'bloodwork' | 'consult' | 'other';
    overridePayload: Prisma.JsonValue;
    status: 'DRAFT' | 'FINALIZED';
    updatedAt: Date;
    finalizedAt: Date | null;
    lastEditedByUserId: number | null;
  }>;
  try {
    rows = await basePrisma.otNonRxAllocationOverride.findMany({
      where: {
        clinicId,
        OR: [
          {
            invoice: {
              OR: [
                { paidAt: { gte: wideStart, lte: wideEnd } },
                { createdAt: { gte: wideStart, lte: wideEnd } },
              ],
            },
          },
          {
            payment: {
              OR: [
                { paidAt: { gte: wideStart, lte: wideEnd } },
                { createdAt: { gte: wideStart, lte: wideEnd } },
              ],
            },
          },
        ],
      },
      select: {
        id: true,
        dispositionKey: true,
        invoiceId: true,
        paymentId: true,
        chargeKind: true,
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
    const e = err instanceof Error ? err : new Error(String(err));
    const prismaCode = err instanceof Prisma.PrismaClientKnownRequestError ? err.code : undefined;
    const prismaMeta = err instanceof Prisma.PrismaClientKnownRequestError ? err.meta : undefined;
    /** P2021 = table does not exist; P2022 = column does not exist. */
    const isMissingSchema =
      prismaCode === 'P2021' ||
      prismaCode === 'P2022' ||
      e.message.includes('does not exist') ||
      e.message.includes('does not exist in the current database');
    logger.error('[OT non-Rx overrides] load failed', {
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
          'OT non-Rx overrides table or schema not yet migrated on this environment. Showing computed defaults only.',
      });
    }
    return NextResponse.json({ error: 'Failed to load OT non-Rx overrides' }, { status: 500 });
  }

  /** Audit must not block the read. */
  try {
    await auditLog(req, {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      eventType: AuditEventType.PHI_VIEW,
      resourceType: 'OtNonRxAllocationOverride',
      action: 'ot_nonrx_override_list',
      outcome: 'SUCCESS',
      metadata: { date, endDate, clinicId, count: rows.length },
    });
  } catch (auditErr) {
    logger.error('[OT non-Rx overrides] audit log failed; returning rows anyway', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      userId: user.id,
    });
  }

  return NextResponse.json({
    overrides: rows.map((r) => ({
      dispositionKey: r.dispositionKey,
      invoiceId: r.invoiceId,
      paymentId: r.paymentId,
      chargeKind: r.chargeKind,
      payload: r.overridePayload,
      status: r.status,
      updatedAt: r.updatedAt.toISOString(),
      finalizedAt: r.finalizedAt?.toISOString() ?? null,
      lastEditedByUserId: r.lastEditedByUserId,
    })),
  });
});

// ---------------------------------------------------------------------------
// POST — upsert override
// ---------------------------------------------------------------------------

/**
 * POST /api/super-admin/ot-nonrx-overrides
 * Body: { invoiceId? | paymentId?, chargeKind, payload, status }
 *
 * Upserts a non-Rx allocation override. Verifies that the underlying
 * invoice or payment belongs to an OT-clinic patient before any write
 * (defense against id guessing across tenants).
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
  const { invoiceId, paymentId, chargeKind, payload, status } = parsed.data;

  /** Sanity-snap line totals before write so a buggy client can't drift them. */
  const reconciledPayload = {
    ...payload,
    meds: reconcileOtAllocationMedLineTotals(payload.meds),
    /** Keep payload's chargeKind in sync with the column for snapshot integrity. */
    chargeKind,
  };

  const clinicId = await resolveOtClinicId();
  if (!clinicId) {
    return NextResponse.json(
      { error: `OT clinic not found (subdomain: ${OT_CLINIC_SUBDOMAIN})` },
      { status: 404 }
    );
  }

  /** Tenant defense: confirm the underlying invoice/payment is for an OT patient.
   * Also captures `patientId` so we can auto-attach the manual rep to the
   * patient after the override save completes. */
  let assignmentPatientId: number | null = null;
  if (invoiceId != null) {
    const invoice = await basePrisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, patientId: true, patient: { select: { clinicId: true } } },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.patient.clinicId !== clinicId) {
      logger.security('[OT non-Rx overrides] cross-clinic invoice id rejected', {
        userId: user.id,
        requestedInvoiceId: invoiceId,
        invoicePatientClinicId: invoice.patient.clinicId,
        otClinicId: clinicId,
      });
      return NextResponse.json(
        { error: 'Invoice does not belong to OT clinic' },
        { status: 403 }
      );
    }
    assignmentPatientId = invoice.patientId;
  } else if (paymentId != null) {
    const payment = await basePrisma.payment.findUnique({
      where: { id: paymentId },
      select: { id: true, patientId: true, patient: { select: { clinicId: true } } },
    });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
    if (payment.patient.clinicId !== clinicId) {
      logger.security('[OT non-Rx overrides] cross-clinic payment id rejected', {
        userId: user.id,
        requestedPaymentId: paymentId,
        paymentPatientClinicId: payment.patient.clinicId,
        otClinicId: clinicId,
      });
      return NextResponse.json(
        { error: 'Payment does not belong to OT clinic' },
        { status: 403 }
      );
    }
    assignmentPatientId = payment.patientId;
  }

  const dispositionKey = dispositionKeyFor(invoiceId, paymentId);

  let isCreate = false;
  let resultId: number;
  try {
    const result = await basePrisma.$transaction(async (tx) => {
      const existing = await tx.otNonRxAllocationOverride.findUnique({
        where: { clinicId_dispositionKey: { clinicId, dispositionKey } },
        select: { id: true },
      });
      isCreate = !existing;
      const finalizedAt = status === 'FINALIZED' ? new Date() : null;
      const upserted = await tx.otNonRxAllocationOverride.upsert({
        where: { clinicId_dispositionKey: { clinicId, dispositionKey } },
        create: {
          clinicId,
          dispositionKey,
          invoiceId,
          paymentId,
          chargeKind,
          overridePayload: reconciledPayload as unknown as Prisma.InputJsonValue,
          status,
          lastEditedByUserId: user.id,
          finalizedAt,
        },
        update: {
          /** invoiceId/paymentId are immutable for an upsert — already encoded in the key. */
          chargeKind,
          overridePayload: reconciledPayload as unknown as Prisma.InputJsonValue,
          status,
          lastEditedByUserId: user.id,
          ...(status === 'FINALIZED' ? { finalizedAt: new Date() } : {}),
        },
        select: {
          id: true,
          dispositionKey: true,
          status: true,
          updatedAt: true,
          finalizedAt: true,
          lastEditedByUserId: true,
        },
      });
      return upserted;
    });
    resultId = result.id;

    try {
      const action = mapOverrideAction(status, isCreate);
      await auditLog(req, {
        userId: user.id,
        userEmail: user.email,
        userRole: user.role,
        eventType: isCreate ? AuditEventType.PHI_CREATE : AuditEventType.PHI_UPDATE,
        resourceType: 'OtNonRxAllocationOverride',
        resourceId: String(resultId),
        action,
        outcome: 'SUCCESS',
        metadata: {
          dispositionKey,
          invoiceId,
          paymentId,
          chargeKind,
          clinicId,
          status,
          medsCount: reconciledPayload.meds.length,
          customLineCount: reconciledPayload.customLineItems.length,
          notesPresent: !!reconciledPayload.notes,
        },
      });
    } catch (auditErr) {
      logger.error('[OT non-Rx overrides] audit log failed; upsert succeeded', {
        error: auditErr instanceof Error ? auditErr.message : String(auditErr),
        userId: user.id,
        dispositionKey,
      });
    }

    /**
     * Auto-attach manual rep to patient.
     * Same semantics as the Rx route — when the admin picks a rep on this
     * disposition row, attach them to the patient's
     * `PatientSalesRepAssignment` so future commission events inherit the
     * rep automatically. Best-effort; never blocks the override save.
     */
    if (reconciledPayload.salesRepId != null && assignmentPatientId != null) {
      await attachSalesRepFromOtDisposition({
        patientId: assignmentPatientId,
        salesRepId: reconciledPayload.salesRepId,
        clinicId,
        assignedById: user.id,
        source: 'ot_nonrx_override',
        overrideResourceId: resultId,
        request: req,
      });
    }

    return NextResponse.json({
      success: true,
      override: {
        dispositionKey: result.dispositionKey,
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
    logger.error('[OT non-Rx overrides] upsert failed', {
      message: e.message,
      userId: user.id,
      dispositionKey,
      prisma: prismaLog,
    });
    return NextResponse.json({ error: 'Failed to save OT non-Rx override' }, { status: 500 });
  }
});

function mapOverrideAction(status: OtAllocationOverrideStatus, isCreate: boolean): string {
  if (status === 'FINALIZED') return 'ot_nonrx_override_finalize';
  return isCreate ? 'ot_nonrx_override_create' : 'ot_nonrx_override_save_draft';
}
