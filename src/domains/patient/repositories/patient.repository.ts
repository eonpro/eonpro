/**
 * Patient Repository
 * ==================
 *
 * Data access layer for patient operations.
 * Encapsulates all Prisma queries for patients with:
 * - Type-safe operations
 * - Multi-tenant isolation (clinicId filtering)
 * - PHI encryption/decryption handling
 * - Audit logging
 *
 * @module domains/patient/repositories
 */

import { type PrismaClient, type Prisma } from '@prisma/client';

import { Errors } from '@/domains/shared/errors';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { encryptPatientPHI, decryptPatientPHI } from '@/lib/security/phi-encryption';

import type {
  PatientEntity,
  PatientSummary,
  PatientSummaryWithClinic,
  PatientWithCounts,
  CreatePatientInput,
  UpdatePatientInput,
  PatientFilterOptions,
  PatientPaginationOptions,
  PaginatedPatients,
  AuditContext,
} from '../types/patient.types';

// ============================================================================
// Constants
// ============================================================================

/** Maximum allowed limit for queries */
const MAX_LIMIT = 500;

/** Default limit for queries */
const DEFAULT_LIMIT = 100;

/** Fields to select for patient summary */
const PATIENT_SUMMARY_SELECT = {
  id: true,
  patientId: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dob: true,
  gender: true,
  address1: true,
  address2: true,
  city: true,
  state: true,
  zip: true,
  tags: true,
  source: true,
  createdAt: true,
  clinicId: true,
} as const;

/** PHI fields that need encryption/decryption */
const PHI_FIELDS = ['email', 'phone', 'dob'] as const;

// ============================================================================
// Repository Interface
// ============================================================================

export interface PatientRepository {
  /**
   * Find a patient by ID
   * @throws NotFoundError if patient not found
   */
  findById(id: number, clinicId?: number): Promise<PatientEntity>;

  /**
   * Find a patient by ID or return null
   */
  findByIdOrNull(id: number, clinicId?: number): Promise<PatientEntity | null>;

  /**
   * Find a patient by patientId (the human-readable ID like "000123")
   */
  findByPatientId(patientId: string, clinicId: number): Promise<PatientEntity | null>;

  /**
   * Find a patient by email within a clinic
   */
  findByEmail(email: string, clinicId: number): Promise<PatientEntity | null>;

  /**
   * Find a patient by Stripe customer ID
   */
  findByStripeCustomerId(stripeCustomerId: string): Promise<PatientEntity | null>;

  /**
   * List patients with filtering and pagination
   */
  findMany(
    filter: PatientFilterOptions,
    pagination?: PatientPaginationOptions
  ): Promise<PaginatedPatients<PatientSummary>>;

  /**
   * List patients with clinic info (for super admin)
   */
  findManyWithClinic(
    filter: PatientFilterOptions,
    pagination?: PatientPaginationOptions
  ): Promise<PaginatedPatients<PatientSummaryWithClinic>>;

  /**
   * Find patient with related record counts (for deletion checks)
   */
  findWithCounts(id: number, clinicId?: number): Promise<PatientWithCounts | null>;

  /**
   * Create a new patient
   */
  create(input: CreatePatientInput, audit: AuditContext): Promise<PatientEntity>;

  /**
   * Update an existing patient
   */
  update(
    id: number,
    input: UpdatePatientInput,
    audit: AuditContext,
    clinicId?: number
  ): Promise<PatientEntity>;

  /**
   * Delete a patient and all related records
   */
  delete(id: number, audit: AuditContext, clinicId?: number): Promise<void>;

  /**
   * Check if a patient exists
   */
  exists(id: number, clinicId?: number): Promise<boolean>;

  /**
   * Count patients matching filter
   */
  count(filter: PatientFilterOptions): Promise<number>;
}

// ============================================================================
// Prisma Implementation
// ============================================================================

/**
 * Create a patient repository instance
 */
export function createPatientRepository(db: PrismaClient = prisma): PatientRepository {
  return {
    async findById(id: number, clinicId?: number): Promise<PatientEntity> {
      const patient = await this.findByIdOrNull(id, clinicId);
      if (!patient) {
        throw Errors.patientNotFound(id);
      }
      return patient;
    },

    async findByIdOrNull(id: number, clinicId?: number): Promise<PatientEntity | null> {
      const where: Prisma.PatientWhereInput = { id };
      if (clinicId !== undefined) {
        where.clinicId = clinicId;
      }

      const patient = await db.patient.findFirst({ where });
      if (!patient) {
        return null;
      }

      return decryptPatient(patient) as PatientEntity;
    },

    async findByPatientId(patientId: string, clinicId: number): Promise<PatientEntity | null> {
      const patient = await db.patient.findFirst({
        where: { patientId, clinicId },
      });

      if (!patient) {
        return null;
      }

      return decryptPatient(patient) as PatientEntity;
    },

    async findByEmail(email: string, clinicId: number): Promise<PatientEntity | null> {
      // Note: Email is encrypted, so we need to encrypt the search value
      const encryptedEmail = encryptPatientPHI({ email }, ['email']).email;

      const patient = await db.patient.findFirst({
        where: { email: encryptedEmail, clinicId },
      });

      if (!patient) {
        return null;
      }

      return decryptPatient(patient) as PatientEntity;
    },

    async findByStripeCustomerId(stripeCustomerId: string): Promise<PatientEntity | null> {
      const patient = await db.patient.findFirst({
        where: { stripeCustomerId },
      });

      if (!patient) {
        return null;
      }

      return decryptPatient(patient) as PatientEntity;
    },

    async findMany(
      filter: PatientFilterOptions,
      pagination: PatientPaginationOptions = {}
    ): Promise<PaginatedPatients<PatientSummary>> {
      const where = buildWhereClause(filter);
      const { limit, offset, orderBy, orderDir } = normalizePagination(pagination);

      const [patients, total] = await Promise.all([
        db.patient.findMany({
          where,
          select: PATIENT_SUMMARY_SELECT,
          orderBy: { [orderBy]: orderDir },
          take: limit,
          skip: offset,
        }),
        db.patient.count({ where }),
      ]);

      const decryptedPatients = patients.map((p) => decryptPatientSummary(p));

      return {
        data: decryptedPatients,
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    },

    async findManyWithClinic(
      filter: PatientFilterOptions,
      pagination: PatientPaginationOptions = {}
    ): Promise<PaginatedPatients<PatientSummaryWithClinic>> {
      const where = buildWhereClause(filter);
      const { limit, offset, orderBy, orderDir } = normalizePagination(pagination);

      const [patients, total] = await Promise.all([
        db.patient.findMany({
          where,
          select: {
            ...PATIENT_SUMMARY_SELECT,
            clinic: {
              select: { name: true },
            },
          },
          orderBy: { [orderBy]: orderDir },
          take: limit,
          skip: offset,
        }),
        db.patient.count({ where }),
      ]);

      const decryptedPatients = patients.map((p) => ({
        ...decryptPatientSummary(p),
        clinicName: p.clinic?.name ?? null,
      }));

      return {
        data: decryptedPatients,
        total,
        limit,
        offset,
        hasMore: offset + patients.length < total,
      };
    },

    async findWithCounts(id: number, clinicId?: number): Promise<PatientWithCounts | null> {
      const where: Prisma.PatientWhereInput = { id };
      if (clinicId !== undefined) {
        where.clinicId = clinicId;
      }

      const patient = await db.patient.findFirst({
        where,
        include: {
          _count: {
            select: {
              orders: true,
              documents: true,
              soapNotes: true,
              appointments: true,
            },
          },
        },
      });

      if (!patient) {
        return null;
      }

      return {
        ...decryptPatient(patient),
        _count: patient._count,
      } as PatientWithCounts;
    },

    async create(input: CreatePatientInput, audit: AuditContext): Promise<PatientEntity> {
      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Generate next patient ID - CLINIC-SPECIFIC
        // Each clinic has its own counter starting from 1
        const counter = await tx.patientCounter.upsert({
          where: { clinicId: input.clinicId },
          create: { clinicId: input.clinicId, current: 1 },
          update: { current: { increment: 1 } },
        });
        const patientId = counter.current.toString().padStart(6, '0');

        // Encrypt PHI fields
        const encryptedData = encryptPatientPHI(input as Record<string, unknown>, [...PHI_FIELDS]);

        // Build source metadata
        const sourceMetadata = (input.sourceMetadata ?? {
          createdBy: audit.actorEmail,
          createdByRole: audit.actorRole,
          createdById: audit.actorId,
          timestamp: new Date().toISOString(),
        }) as Prisma.InputJsonValue;

        // Create patient - spread encrypted data and add system fields
        const createData = {
          ...encryptedData,
          patientId,
          clinicId: input.clinicId,
          notes: input.notes ?? null,
          tags: (input.tags ?? []) as Prisma.InputJsonValue,
          source: input.source ?? 'api',
          sourceMetadata,
        };
        const patient = await tx.patient.create({
          data: createData as unknown as Prisma.PatientCreateInput,
        });

        // Create audit log
        await tx.patientAudit.create({
          data: {
            patientId: patient.id,
            action: 'CREATE',
            actorEmail: audit.actorEmail,
            diff: {
              created: true,
              by: audit.actorEmail,
              role: audit.actorRole,
            } as Prisma.InputJsonValue,
          },
        });

        return decryptPatient(patient) as PatientEntity;
      });
    },

    async update(
      id: number,
      input: UpdatePatientInput,
      audit: AuditContext,
      clinicId?: number
    ): Promise<PatientEntity> {
      // First verify patient exists and belongs to clinic
      const existing = await this.findByIdOrNull(id, clinicId);
      if (!existing) {
        throw Errors.patientNotFound(id);
      }

      // Encrypt PHI fields in update data
      const encryptedData = encryptPatientPHI(input, [...PHI_FIELDS]);

      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Update patient
        const patient = await tx.patient.update({
          where: { id },
          data: encryptedData as Prisma.PatientUpdateInput,
        });

        // Build change diff for audit
        const changeSet = buildChangeDiff(existing, input);

        if (Object.keys(changeSet).length > 0) {
          await tx.patientAudit.create({
            data: {
              patientId: id,
              action: 'UPDATE',
              actorEmail: audit.actorEmail,
              diff: changeSet as Prisma.InputJsonValue,
            },
          });
        }

        return decryptPatient(patient) as PatientEntity;
      });
    },

    async delete(id: number, audit: AuditContext, clinicId?: number): Promise<void> {
      // Verify patient exists
      const existing = await this.findWithCounts(id, clinicId);
      if (!existing) {
        throw Errors.patientNotFound(id);
      }

      await db.$transaction(async (tx) => {
        // Create audit log BEFORE deletion (will be orphaned but preserved for compliance)
        await tx.patientAudit.create({
          data: {
            patientId: id,
            action: 'DELETE',
            actorEmail: audit.actorEmail,
            diff: {
              deleted: true,
              firstName: existing.firstName,
              lastName: existing.lastName,
              relatedData: existing._count,
              by: audit.actorEmail,
              role: audit.actorRole,
            },
          },
        });

        // ═══════════════════════════════════════════════════════════════════
        // DELETE ALL RELATED RECORDS (respecting foreign key constraints)
        // Order matters! Delete child records before parent records.
        // ═══════════════════════════════════════════════════════════════════

        // 1. Health Tracking Logs
        await tx.patientMedicationReminder.deleteMany({ where: { patientId: id } });
        await tx.patientWeightLog.deleteMany({ where: { patientId: id } });
        await tx.patientWaterLog.deleteMany({ where: { patientId: id } });
        await tx.patientExerciseLog.deleteMany({ where: { patientId: id } });
        await tx.patientSleepLog.deleteMany({ where: { patientId: id } });
        await tx.patientNutritionLog.deleteMany({ where: { patientId: id } });

        // 2. Chat & Conversations
        // First nullify self-referencing FK (replyToId) to avoid FK violation during delete
        await tx.patientChatMessage.updateMany({
          where: { patientId: id },
          data: { replyToId: null }
        });
        await tx.patientChatMessage.deleteMany({ where: { patientId: id } });

        // Delete AI messages first (foreign key to AIConversation)
        const aiConversations = await tx.aIConversation.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const conv of aiConversations) {
          await tx.aIMessage.deleteMany({ where: { conversationId: conv.id } });
        }
        await tx.aIConversation.deleteMany({ where: { patientId: id } });

        // 3. Care Plans (cascade delete handles goals, activities, progress)
        await tx.carePlan.deleteMany({ where: { patientId: id } });

        // 4. Intake form responses and submissions
        const submissions = await tx.intakeFormSubmission.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const submission of submissions) {
          await tx.intakeFormResponse.deleteMany({ where: { submissionId: submission.id } });
        }
        await tx.intakeFormSubmission.deleteMany({ where: { patientId: id } });

        // 5. SOAP Notes (need to delete revisions first)
        const soapNotes = await tx.sOAPNote.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const note of soapNotes) {
          await tx.sOAPNoteRevision.deleteMany({ where: { soapNoteId: note.id } });
        }
        await tx.sOAPNote.deleteMany({ where: { patientId: id } });

        // 6. Documents (NOT appointments yet - Superbill references appointments)
        await tx.patientDocument.deleteMany({ where: { patientId: id } });

        // 7. Payments, Commissions, and Invoices
        // Delete payments first
        await tx.payment.deleteMany({ where: { patientId: id } });

        // Delete commissions before invoices (Commission references Invoice via invoiceId)
        const patientInvoices = await tx.invoice.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        if (patientInvoices.length > 0) {
          const invoiceIds = patientInvoices.map((inv) => inv.id);
          await tx.commission.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
        }

        // Now delete invoices
        await tx.invoice.deleteMany({ where: { patientId: id } });

        // 8. Subscriptions and payment methods (delete actions first due to FK constraint)
        const subscriptions = await tx.subscription.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const sub of subscriptions) {
          await tx.subscriptionAction.deleteMany({ where: { subscriptionId: sub.id } });
        }
        await tx.subscription.deleteMany({ where: { patientId: id } });
        await tx.paymentMethod.deleteMany({ where: { patientId: id } });

        // 9. Tickets (delete related records first)
        // IMPORTANT: Tickets must be deleted BEFORE Orders because Ticket.orderId references Order
        const tickets = await tx.ticket.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const ticket of tickets) {
          await tx.ticketSLA.deleteMany({ where: { ticketId: ticket.id } });
          await tx.ticketEscalation.deleteMany({ where: { ticketId: ticket.id } });
          await tx.ticketWorkLog.deleteMany({ where: { ticketId: ticket.id } });
          await tx.ticketStatusHistory.deleteMany({ where: { ticketId: ticket.id } });
          await tx.ticketComment.deleteMany({ where: { ticketId: ticket.id } });
          await tx.ticketAssignment.deleteMany({ where: { ticketId: ticket.id } });
        }
        await tx.ticket.deleteMany({ where: { patientId: id } });

        // 10. Orders (delete events and rxs first)
        // Must be deleted AFTER Tickets since Tickets reference Orders via orderId FK
        const orders = await tx.order.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        for (const order of orders) {
          await tx.orderEvent.deleteMany({ where: { orderId: order.id } });
          await tx.rx.deleteMany({ where: { orderId: order.id } });
        }
        await tx.order.deleteMany({ where: { patientId: id } });

        // 11. Referrals and discount usage
        // Delete commissions referencing referral trackings first (Commission has referralId FK)
        const referralTrackings = await tx.referralTracking.findMany({
          where: { patientId: id },
          select: { id: true },
        });
        if (referralTrackings.length > 0) {
          const referralIds = referralTrackings.map((ref) => ref.id);
          await tx.commission.deleteMany({ where: { referralId: { in: referralIds } } });
        }
        await tx.referralTracking.deleteMany({ where: { patientId: id } });
        await tx.discountUsage.deleteMany({ where: { patientId: id } });
        await tx.affiliateReferral.deleteMany({ where: { referredPatientId: id } });

        // 12. Superbills (SuperbillItem will cascade delete)
        // Must delete BEFORE appointments because Superbill.appointmentId references Appointment
        await tx.superbill.deleteMany({ where: { patientId: id } });

        // 12b. Now safe to delete appointments
        await tx.appointment.deleteMany({ where: { patientId: id } });

        // 13. Payment reconciliation records (nullable patientId)
        await tx.paymentReconciliation.updateMany({
          where: { patientId: id },
          data: { patientId: null }
        });

        // 14. SMS logs (nullable patientId, but clean up anyway)
        await tx.smsLog.deleteMany({ where: { patientId: id } });

        // 15. User association (nullable patientId)
        await tx.user.updateMany({
          where: { patientId: id },
          data: { patientId: null }
        });

        // 16. Delete patient audit records (compliance note: may want to keep these)
        await tx.patientAudit.deleteMany({ where: { patientId: id } });

        // 17. Clean up HIPAA audit entries and phone OTPs (no FK but good to clean)
        await tx.hIPAAAuditEntry.updateMany({
          where: { patientId: id },
          data: { patientId: null }
        });
        await tx.phoneOtp.deleteMany({ where: { patientId: id } });

        // Finally delete the patient
        await tx.patient.delete({ where: { id } });
      });
    },

    async exists(id: number, clinicId?: number): Promise<boolean> {
      const where: Prisma.PatientWhereInput = { id };
      if (clinicId !== undefined) {
        where.clinicId = clinicId;
      }

      const count = await db.patient.count({ where });
      return count > 0;
    },

    async count(filter: PatientFilterOptions): Promise<number> {
      const where = buildWhereClause(filter);
      return db.patient.count({ where });
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decrypt patient entity PHI fields
 * Gracefully handles decryption failures by returning raw data
 * (matches current route behavior during encryption migration period)
 */
function decryptPatient<T extends Record<string, unknown>>(patient: T): T {
  try {
    return decryptPatientPHI(patient, [...PHI_FIELDS]);
  } catch (error) {
    // If decryption fails, return patient data without decryption
    // This handles cases where data might not be encrypted yet (migration period)
    logger.warn('Failed to decrypt patient PHI, returning raw data', {
      patientId: (patient as Record<string, unknown>).id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return patient;
  }
}

/**
 * Decrypt patient summary PHI fields
 * Gracefully handles decryption failures by returning raw data
 */
function decryptPatientSummary(patient: Record<string, unknown>): PatientSummary {
  let decrypted: Record<string, unknown>;
  try {
    decrypted = decryptPatientPHI(patient, [...PHI_FIELDS]);
  } catch (error) {
    logger.warn('Failed to decrypt patient summary PHI, returning raw data', {
      patientId: patient.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    decrypted = patient;
  }

  return {
    id: decrypted.id as number,
    patientId: decrypted.patientId as string | null,
    firstName: decrypted.firstName as string,
    lastName: decrypted.lastName as string,
    email: decrypted.email as string,
    phone: decrypted.phone as string,
    dob: decrypted.dob as string,
    gender: decrypted.gender as string,
    address1: decrypted.address1 as string,
    address2: decrypted.address2 as string | null,
    city: decrypted.city as string,
    state: decrypted.state as string,
    zip: decrypted.zip as string,
    tags: decrypted.tags as string[] | null,
    source: decrypted.source as PatientSummary['source'],
    createdAt: decrypted.createdAt as Date,
    clinicId: decrypted.clinicId as number,
  };
}

/**
 * Build Prisma where clause from filter options
 */
function buildWhereClause(filter: PatientFilterOptions): Prisma.PatientWhereInput {
  const where: Prisma.PatientWhereInput = {};

  if (filter.clinicId !== undefined) {
    where.clinicId = filter.clinicId;
  }

  if (filter.createdAfter || filter.createdBefore) {
    where.createdAt = {};
    if (filter.createdAfter) {
      where.createdAt.gte = filter.createdAfter;
    }
    if (filter.createdBefore) {
      where.createdAt.lte = filter.createdBefore;
    }
  }

  if (filter.source) {
    where.source = filter.source;
  }

  if (filter.search) {
    const searchTerms = filter.search.trim().split(/\s+/).filter(Boolean);

    if (searchTerms.length === 1) {
      // Single term: search firstName, lastName, or patientId
      where.OR = [
        { firstName: { contains: searchTerms[0], mode: 'insensitive' } },
        { lastName: { contains: searchTerms[0], mode: 'insensitive' } },
        { patientId: { contains: searchTerms[0], mode: 'insensitive' } },
      ];
    } else if (searchTerms.length >= 2) {
      // Multiple terms: match as "firstName lastName" OR "lastName firstName" OR any term in either field
      const [first, ...rest] = searchTerms;
      const last = rest.join(' '); // Handle multi-word last names like "Van Der Berg"

      where.OR = [
        // Exact order: first matches firstName, rest matches lastName
        {
          AND: [
            { firstName: { contains: first, mode: 'insensitive' } },
            { lastName: { contains: last, mode: 'insensitive' } },
          ],
        },
        // Reverse order: first matches lastName, rest matches firstName
        {
          AND: [
            { lastName: { contains: first, mode: 'insensitive' } },
            { firstName: { contains: last, mode: 'insensitive' } },
          ],
        },
        // Any single term matches patientId
        { patientId: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
  }

  // Note: JSON array filtering with hasSome requires raw SQL in PostgreSQL
  // For now, we skip tag filtering at the DB level and filter in application
  // if (filter.tags && filter.tags.length > 0) {
  //   where.tags = { hasSome: filter.tags };
  // }

  return where;
}

/**
 * Normalize pagination options with defaults and limits
 */
function normalizePagination(options: PatientPaginationOptions): Required<PatientPaginationOptions> {
  const rawLimit = options.limit ?? DEFAULT_LIMIT;
  return {
    limit: Math.min(Math.max(1, rawLimit), MAX_LIMIT),
    offset: Math.max(0, options.offset ?? 0),
    orderBy: options.orderBy ?? 'createdAt',
    orderDir: options.orderDir ?? 'desc',
  };
}

/**
 * Build change diff between old and new patient data
 */
function buildChangeDiff(
  before: PatientEntity,
  after: UpdatePatientInput
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const fields = Object.keys(after) as (keyof UpdatePatientInput)[];

  for (const field of fields) {
    const beforeVal = before[field as keyof PatientEntity];
    const afterVal = after[field];

    if (afterVal !== undefined && beforeVal !== afterVal) {
      diff[field] = { before: beforeVal, after: afterVal };
    }
  }

  return diff;
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default patient repository instance
 */
export const patientRepository = createPatientRepository();
