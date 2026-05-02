/**
 * OT Manual Disposition → Patient Sales Rep Assignment
 *
 * When super-admin manually dispositions an OT sale (Rx via
 * `OtSaleAllocationOverride` or non-Rx via `OtNonRxAllocationOverride`) and
 * picks a sales rep on the row, that rep should also be attached to the
 * patient via `PatientSalesRepAssignment` so future commission events for
 * the same patient inherit the rep automatically.
 *
 * This mirrors the auto-assignment behavior in
 * `dispositionService.reviewDisposition` for `SALE_COMPLETED` outcomes, but
 * is keyed off the OT reconciliation editor instead of the per-rep
 * disposition workflow.
 *
 * HIPAA-COMPLIANT: never logs patient name/email/phone — ids only.
 *
 * Best-effort: this helper never throws. If anything fails (rep deactivated
 * mid-request, patient missing, race on assignment, etc.) we return an
 * `error` status and log a warning so the OT override save can still
 * succeed. The override payload itself remains the source of truth for the
 * commission of *that* sale; this only seeds the patient's default rep for
 * *future* sales.
 */

import type { PrismaClient } from '@prisma/client';
import type { NextRequest } from 'next/server';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { COMMISSION_ELIGIBLE_ROLES } from '@/lib/constants/commission-eligible-roles';

export type OtDispositionAssignmentSource = 'ot_rx_override' | 'ot_nonrx_override';

export interface AttachSalesRepFromOtDispositionInput {
  /** The patient receiving the assignment. */
  patientId: number;
  /** The rep being attached (must be commission-eligible + active). */
  salesRepId: number;
  /** Multi-tenant guard: patient and rep both must belong (or have access) to this clinic. */
  clinicId: number;
  /** Super-admin user performing the disposition. Stored as `assignedById`. */
  assignedById: number;
  /** Which override surface triggered the assignment — used in the audit + log. */
  source: OtDispositionAssignmentSource;
  /** ID of the override row that triggered this; logged only, never PHI. */
  overrideResourceId?: number | string;
  /** Optional request handle for richer audit context (IP, UA). */
  request?: NextRequest | null;
  /**
   * Optional Prisma client override — primarily for tests. Defaults to
   * `basePrisma` so the helper bypasses RLS (the caller has already done
   * tenant verification).
   */
  prismaClient?: Pick<
    PrismaClient,
    'patient' | 'user' | 'patientSalesRepAssignment' | '$transaction'
  >;
}

export type AttachSalesRepFromOtDispositionStatus =
  | 'created'
  | 'reassigned'
  | 'unchanged'
  | 'skipped_invalid_rep'
  | 'skipped_patient_mismatch'
  | 'error';

export interface AttachSalesRepFromOtDispositionResult {
  status: AttachSalesRepFromOtDispositionStatus;
  assignmentId: number | null;
  /** Populated for `reassigned` so the caller can audit the prior rep id. */
  previousSalesRepId?: number | null;
  /** Populated for `error` — the original message, never PHI. */
  errorMessage?: string;
}

/**
 * Attach `salesRepId` to `patientId` (idempotent). Designed to be safe to
 * call on every override save — DRAFT or FINALIZED.
 *
 * Returns one of:
 *   - `created`: no prior active assignment, new row written.
 *   - `reassigned`: existing rep was different, deactivated + new row written.
 *   - `unchanged`: already assigned to this rep, no DB writes.
 *   - `skipped_invalid_rep`: rep is missing, inactive, or not commission-eligible.
 *   - `skipped_patient_mismatch`: patient missing or in a different clinic.
 *   - `error`: a Prisma error or unexpected failure (logged with warn, never thrown).
 */
export async function attachSalesRepFromOtDisposition(
  input: AttachSalesRepFromOtDispositionInput
): Promise<AttachSalesRepFromOtDispositionResult> {
  const {
    patientId,
    salesRepId,
    clinicId,
    assignedById,
    source,
    overrideResourceId,
    request,
    prismaClient = basePrisma,
  } = input;

  /** Defense: patient must exist + belong to this clinic. */
  let patient: { id: number; clinicId: number } | null;
  try {
    patient = await prismaClient.patient.findUnique({
      where: { id: patientId },
      select: { id: true, clinicId: true },
    });
  } catch (err) {
    return logAndReturnError(err, {
      patientId,
      salesRepId,
      clinicId,
      source,
      stage: 'patient_lookup',
    });
  }
  if (!patient) {
    logger.warn('[OT disposition assignment] patient not found; skipping', {
      patientId,
      clinicId,
      source,
    });
    return { status: 'skipped_patient_mismatch', assignmentId: null };
  }
  if (patient.clinicId !== clinicId) {
    logger.security('[OT disposition assignment] cross-clinic patient rejected', {
      patientId,
      patientClinicId: patient.clinicId,
      requestedClinicId: clinicId,
      source,
    });
    return { status: 'skipped_patient_mismatch', assignmentId: null };
  }

  /** Defense: rep must exist, be active, and be commission-eligible. */
  let rep: { id: number; status: string; role: string } | null;
  try {
    rep = await prismaClient.user.findUnique({
      where: { id: salesRepId },
      select: { id: true, status: true, role: true },
    });
  } catch (err) {
    return logAndReturnError(err, {
      patientId,
      salesRepId,
      clinicId,
      source,
      stage: 'rep_lookup',
    });
  }
  if (
    !rep ||
    rep.status !== 'ACTIVE' ||
    !COMMISSION_ELIGIBLE_ROLES.includes(rep.role as (typeof COMMISSION_ELIGIBLE_ROLES)[number])
  ) {
    logger.warn('[OT disposition assignment] rep is missing/inactive/ineligible; skipping', {
      patientId,
      salesRepId,
      clinicId,
      source,
      repStatus: rep?.status ?? 'missing',
      repRole: rep?.role ?? 'missing',
    });
    return { status: 'skipped_invalid_rep', assignmentId: null };
  }

  /** Idempotent assignment write inside a small transaction. */
  let outcome: {
    status: 'created' | 'reassigned' | 'unchanged';
    assignmentId: number;
    previousSalesRepId: number | null;
  };
  try {
    outcome = await prismaClient.$transaction(
      async (tx) => {
        const existing = await tx.patientSalesRepAssignment.findFirst({
          where: { patientId, clinicId, isActive: true },
          select: { id: true, salesRepId: true },
          orderBy: { assignedAt: 'desc' },
        });

        if (existing && existing.salesRepId === salesRepId) {
          return {
            status: 'unchanged' as const,
            assignmentId: existing.id,
            previousSalesRepId: existing.salesRepId,
          };
        }

        if (existing) {
          await tx.patientSalesRepAssignment.update({
            where: { id: existing.id },
            data: {
              isActive: false,
              removedAt: new Date(),
              removedById: assignedById,
              removalNote: `Reassigned via OT manual disposition (${source})`,
            },
          });
        }

        const created = await tx.patientSalesRepAssignment.create({
          data: { patientId, salesRepId, clinicId, assignedById },
          select: { id: true },
        });

        return {
          status: existing ? ('reassigned' as const) : ('created' as const),
          assignmentId: created.id,
          previousSalesRepId: existing?.salesRepId ?? null,
        };
      },
      { timeout: 10_000 }
    );
  } catch (err) {
    return logAndReturnError(err, {
      patientId,
      salesRepId,
      clinicId,
      source,
      stage: 'assignment_upsert',
    });
  }

  logger.info('[OT disposition assignment] sales rep attached to patient', {
    patientId,
    salesRepId,
    clinicId,
    assignedById,
    source,
    overrideResourceId,
    status: outcome.status,
    assignmentId: outcome.assignmentId,
    previousSalesRepId: outcome.previousSalesRepId,
  });

  /** Audit (best-effort, never blocks the save). */
  try {
    await auditLog(request ?? null, {
      userId: assignedById,
      userRole: 'super_admin',
      clinicId,
      eventType: AuditEventType.PHI_UPDATE,
      resourceType: 'PatientSalesRepAssignment',
      resourceId: String(outcome.assignmentId),
      patientId,
      action: 'ot_disposition_rep_assigned',
      outcome: 'SUCCESS',
      metadata: {
        source,
        overrideResourceId: overrideResourceId ?? null,
        salesRepId,
        previousSalesRepId: outcome.previousSalesRepId,
        assignmentStatus: outcome.status,
      },
    });
  } catch (auditErr) {
    logger.error('[OT disposition assignment] audit log failed; assignment succeeded', {
      error: auditErr instanceof Error ? auditErr.message : String(auditErr),
      assignmentId: outcome.assignmentId,
    });
  }

  return {
    status: outcome.status,
    assignmentId: outcome.assignmentId,
    previousSalesRepId: outcome.previousSalesRepId,
  };
}

function logAndReturnError(
  err: unknown,
  ctx: {
    patientId: number;
    salesRepId: number;
    clinicId: number;
    source: OtDispositionAssignmentSource;
    stage: 'patient_lookup' | 'rep_lookup' | 'assignment_upsert';
  }
): AttachSalesRepFromOtDispositionResult {
  const message = err instanceof Error ? err.message : String(err);
  logger.warn('[OT disposition assignment] failed; OT override save unaffected', {
    ...ctx,
    error: message,
  });
  return { status: 'error', assignmentId: null, errorMessage: message };
}
