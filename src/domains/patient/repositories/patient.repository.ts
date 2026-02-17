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
import { generatePatientId } from '@/lib/patients';
import { encryptPatientPHI, decryptPHI } from '@/lib/security/phi-encryption';
import { normalizeSearch, splitSearchTerms, buildPatientSearchIndex, fuzzyTermMatch } from '@/lib/utils/search';

import {
  PHI_FIELDS,
  type PatientEntity,
  type PatientSummary,
  type PatientSummaryWithClinic,
  type PatientWithCounts,
  type CreatePatientInput,
  type UpdatePatientInput,
  type PatientFilterOptions,
  type PatientPaginationOptions,
  type PaginatedPatients,
  type AuditContext,
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

// PHI_FIELDS imported from '../types/patient.types' — single source of truth

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
  findByStripeCustomerId(stripeCustomerId: string, clinicId?: number): Promise<PatientEntity | null>;

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

    async findByStripeCustomerId(stripeCustomerId: string, clinicId?: number): Promise<PatientEntity | null> {
      const patient = await db.patient.findFirst({
        where: {
          stripeCustomerId,
          ...(clinicId != null ? { clinicId } : {}),
        },
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
      const hasSearch = !!filter.search;

      if (hasSearch) {
        const searchTerm = filter.search!.toLowerCase().trim();

        // Strategy 1: DB-level search via searchIndex + patientId (fast path)
        const dbSearchWhere = {
          ...where,
          OR: [
            { searchIndex: { contains: searchTerm, mode: 'insensitive' as const } },
            { patientId: { contains: searchTerm, mode: 'insensitive' as const } },
          ],
        };

        const [dbPatients, dbTotal] = await Promise.all([
          db.patient.findMany({
            where: dbSearchWhere,
            select: PATIENT_SUMMARY_SELECT,
            orderBy: { [orderBy]: orderDir },
            skip: offset,
            take: limit,
          }),
          db.patient.count({ where: dbSearchWhere }),
        ]);

        if (dbTotal > 0) {
          return {
            data: dbPatients.map((p) => decryptPatientSummary(p)),
            total: dbTotal,
            limit,
            offset,
            hasMore: offset + dbPatients.length < dbTotal,
          };
        }

        // Strategy 2: Fallback to in-memory search for patients without searchIndex
        // This handles patients created before searchIndex was populated
        const nullIndexCount = await db.patient.count({
          where: { ...where, OR: [{ searchIndex: null }, { searchIndex: '' }] },
        });

        if (nullIndexCount > 0) {
          // Fetch patients without searchIndex, decrypt, and filter in-memory
          // Use batched approach for memory efficiency
          // PERF FIX: Hard cap at 1000 to prevent unbounded memory usage
          const allUnindexed = await db.patient.findMany({
            where: { ...where, OR: [{ searchIndex: null }, { searchIndex: '' }] },
            select: PATIENT_SUMMARY_SELECT,
            orderBy: { [orderBy]: orderDir },
            take: 1000,
          });

          const decrypted = allUnindexed.map((p) => decryptPatientSummary(p));
          const filtered = filterPatientsBySearch(decrypted, searchTerm);
          const paged = filtered.slice(offset, offset + limit);

          return {
            data: paged,
            total: filtered.length,
            limit,
            offset,
            hasMore: offset + paged.length < filtered.length,
          };
        }

        // No matches found anywhere
        return { data: [], total: 0, limit, offset, hasMore: false };
      }

      // No search: use normal DB pagination
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
      const hasSearch = !!filter.search;
      const clinicSelect = { ...PATIENT_SUMMARY_SELECT, clinic: { select: { name: true } } };

      if (hasSearch) {
        const searchTerm = filter.search!.toLowerCase().trim();

        // Strategy 1: DB-level search via searchIndex + patientId
        const dbSearchWhere = {
          ...where,
          OR: [
            { searchIndex: { contains: searchTerm, mode: 'insensitive' as const } },
            { patientId: { contains: searchTerm, mode: 'insensitive' as const } },
          ],
        };

        const [dbPatients, dbTotal] = await Promise.all([
          db.patient.findMany({
            where: dbSearchWhere,
            select: clinicSelect,
            orderBy: { [orderBy]: orderDir },
            skip: offset,
            take: limit,
          }),
          db.patient.count({ where: dbSearchWhere }),
        ]);

        if (dbTotal > 0) {
          return {
            data: dbPatients.map((p) => ({
              ...decryptPatientSummary(p),
              clinicName: p.clinic?.name ?? null,
            })),
            total: dbTotal,
            limit,
            offset,
            hasMore: offset + dbPatients.length < dbTotal,
          };
        }

        // Strategy 2: Fallback in-memory search for unindexed patients
        const nullIndexCount = await db.patient.count({
          where: { ...where, OR: [{ searchIndex: null }, { searchIndex: '' }] },
        });

        if (nullIndexCount > 0) {
          // PERF FIX: Hard cap at 1000 to prevent unbounded memory usage
          const allUnindexed = await db.patient.findMany({
            where: { ...where, OR: [{ searchIndex: null }, { searchIndex: '' }] },
            select: clinicSelect,
            orderBy: { [orderBy]: orderDir },
            take: 1000,
          });

          const decrypted = allUnindexed.map((p) => ({
            ...decryptPatientSummary(p),
            clinicName: p.clinic?.name ?? null,
          }));
          const filtered = filterPatientsBySearch(decrypted, searchTerm);
          const paged = filtered.slice(offset, offset + limit);

          return {
            data: paged,
            total: filtered.length,
            limit,
            offset,
            hasMore: offset + paged.length < filtered.length,
          };
        }

        return { data: [], total: 0, limit, offset, hasMore: false };
      }

      // No search: use normal DB pagination
      const [patients, total] = await Promise.all([
        db.patient.findMany({
          where,
          select: clinicSelect,
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
      // Generate patient ID using the shared utility (handles clinic prefixes like EON-123, WEL-456)
      const patientId = await generatePatientId(input.clinicId);

      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Build search index from plain-text BEFORE encryption
        const searchIndex = buildPatientSearchIndex({
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          patientId,
        });

        // Encrypt PHI fields
        const encryptedData = encryptPatientPHI(input as unknown as Record<string, unknown>, [...PHI_FIELDS]);

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
          searchIndex,
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
      }, { isolationLevel: 'Serializable', timeout: 30000 });
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

      // Rebuild search index if any searchable field changed
      const searchableFieldsChanged = ['firstName', 'lastName', 'email', 'phone'].some(
        (f) => (input as Record<string, unknown>)[f] !== undefined
      );

      let searchIndex: string | undefined;
      if (searchableFieldsChanged) {
        // Merge existing (decrypted) values with new values to build complete index
        searchIndex = buildPatientSearchIndex({
          firstName: (input.firstName ?? existing.firstName) as string,
          lastName: (input.lastName ?? existing.lastName) as string,
          email: (input.email ?? existing.email) as string,
          phone: (input.phone ?? existing.phone) as string,
          patientId: existing.patientId as string,
        });
      }

      // Encrypt PHI fields in update data
      const encryptedData = encryptPatientPHI(input as unknown as Record<string, unknown>, [...PHI_FIELDS]);

      return db.$transaction(async (tx: Prisma.TransactionClient) => {
        // Update patient
        const patient = await tx.patient.update({
          where: { id },
          data: {
            ...encryptedData,
            ...(searchIndex !== undefined && { searchIndex }),
          } as Prisma.PatientUpdateInput,
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
      }, { isolationLevel: 'Serializable', timeout: 30000 });
    },

    async delete(id: number, audit: AuditContext, clinicId?: number): Promise<void> {
      // Verify patient exists
      const existing = await this.findWithCounts(id, clinicId);
      if (!existing) {
        throw Errors.patientNotFound(id);
      }

      await db.$transaction(async (tx) => {
        // Create audit log BEFORE deletion (will be orphaned but preserved for compliance)
        // NOTE: Do not store PHI (names, email) in audit diffs — use IDs only
        await tx.patientAudit.create({
          data: {
            patientId: id,
            action: 'DELETE',
            actorEmail: audit.actorEmail,
            diff: {
              deleted: true,
              patientId: existing.patientId,
              relatedData: existing._count,
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
          data: { replyToId: null },
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
          data: { patientId: null },
        });

        // 14. SMS logs (nullable patientId, but clean up anyway)
        await tx.smsLog.deleteMany({ where: { patientId: id } });

        // 15. User association (nullable patientId)
        await tx.user.updateMany({
          where: { patientId: id },
          data: { patientId: null },
        });

        // 16. Delete patient audit records (compliance note: may want to keep these)
        await tx.patientAudit.deleteMany({ where: { patientId: id } });

        // 17. Clean up HIPAA audit entries and phone OTPs (no FK but good to clean)
        await tx.hIPAAAuditEntry.updateMany({
          where: { patientId: id },
          data: { patientId: null },
        });
        await tx.phoneOtp.deleteMany({ where: { patientId: id } });

        // Finally delete the patient
        await tx.patient.delete({ where: { id } });
      }, { isolationLevel: 'Serializable', timeout: 30000 });
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
 * Safely decrypt a single PHI field.
 * Returns the decrypted value on success, '[Encrypted]' on failure, or null/empty as-is.
 */
function decryptField(value: unknown, fieldName: string, patientId?: unknown): string | null {
  if (value == null || value === '') return value as string | null;
  const strValue = String(value);
  try {
    const decrypted = decryptPHI(strValue);
    return decrypted;
  } catch (err) {
    logger.warn('PHI decryption failed', {
      fieldName,
      patientId: patientId ?? undefined,
      error: err instanceof Error ? err.message : 'Unknown',
    });
    return '[Encrypted]';
  }
}

/**
 * Decrypt patient entity PHI fields.
 * Handles decryption failures gracefully per-field by returning '[Encrypted]' placeholders
 * instead of raw encrypted data.
 */
function decryptPatient<T extends Record<string, unknown>>(patient: T): T {
  const decrypted = { ...patient };
  const patientId = patient.id;

  for (const field of PHI_FIELDS) {
    if (field in decrypted) {
      (decrypted[field] as unknown) = decryptField(decrypted[field], field, patientId);
    }
  }

  return decrypted;
}

/**
 * Safely extract string for PatientSummary (handles null/undefined from decryption failures)
 */
function safeStr(v: unknown): string {
  return v != null && typeof v === 'string' ? v : '';
}

/**
 * Decrypt patient summary PHI fields.
 * Handles decryption failures gracefully per-field using decryptField.
 */
function decryptPatientSummary(patient: Record<string, unknown>): PatientSummary {
  const patientId = patient.id;

  return {
    id: (patient.id as number) ?? 0,
    patientId: (patient.patientId as string | null) ?? null,
    firstName: safeStr(decryptField(patient.firstName, 'firstName', patientId)),
    lastName: safeStr(decryptField(patient.lastName, 'lastName', patientId)),
    email: safeStr(decryptField(patient.email, 'email', patientId)),
    phone: safeStr(decryptField(patient.phone, 'phone', patientId)),
    dob: safeStr(decryptField(patient.dob, 'dob', patientId)),
    gender: safeStr(patient.gender),
    address1: safeStr(decryptField(patient.address1, 'address1', patientId)),
    address2: (decryptField(patient.address2, 'address2', patientId)) as string | null,
    city: safeStr(decryptField(patient.city, 'city', patientId)),
    state: safeStr(decryptField(patient.state, 'state', patientId)),
    zip: safeStr(decryptField(patient.zip, 'zip', patientId)),
    tags: (patient.tags as string[] | null) ?? null,
    source: (patient.source as PatientSummary['source']) ?? null,
    createdAt: (patient.createdAt as Date) ?? new Date(),
    clinicId: (patient.clinicId as number) ?? 0,
  };
}

/**
 * Safely coerce a value to a searchable lowercase string.
 * Handles null, undefined, non-strings (e.g. from decryption edge cases).
 */
function toSearchableString(value: unknown): string {
  if (value == null) return '';
  const s = typeof value === 'string' ? value : String(value);
  return s.toLowerCase().trim();
}

/**
 * Filter decrypted patients by search term (in-memory filtering)
 * NOTE: This is necessary because patient PHI is ENCRYPTED in the database.
 * SQL-level search on encrypted fields won't match plaintext search terms.
 * Searches: firstName, lastName, patientId, email, phone for smart/fast matching.
 */
function filterPatientsBySearch<
  T extends {
    firstName?: unknown;
    lastName?: unknown;
    patientId?: string | null;
    email?: unknown;
    phone?: unknown;
  },
>(patients: T[], search: string): T[] {
  const searchNormalized = normalizeSearch(search);
  if (!searchNormalized) return patients;

  const terms = splitSearchTerms(search);

  return patients.filter((patient) => {
    const firstName = toSearchableString(patient.firstName);
    const lastName = toSearchableString(patient.lastName);
    const patientIdLower = toSearchableString(patient.patientId);
    const emailLower = toSearchableString(patient.email);
    const phoneDigits = toSearchableString(patient.phone).replace(/\D/g, '');

    // Phone matching: digits-only comparison
    const searchDigits = searchNormalized.replace(/\D/g, '');
    const hasPhoneMatch =
      searchDigits.length >= 3 && phoneDigits.length >= 3 && phoneDigits.includes(searchDigits);
    if (hasPhoneMatch) return true;

    // Build searchable fields
    const fullName = `${firstName} ${lastName}`;
    const reverseName = `${lastName} ${firstName}`;
    const allFields = [fullName, reverseName, patientIdLower, emailLower];

    // Exact substring match on full name (handles "first last" or "last first")
    if (fullName.includes(searchNormalized) || reverseName.includes(searchNormalized)) {
      return true;
    }

    // Multi-term: all terms must match at least one field (exact, starts-with, or fuzzy)
    return terms.every((term) =>
      firstName.includes(term) ||
      lastName.includes(term) ||
      patientIdLower.includes(term) ||
      emailLower.includes(term) ||
      fuzzyTermMatch(term, allFields.join(' '))
    );
  });
}

/**
 * Build Prisma where clause from filter options
 * NOTE: Search on encrypted PHI fields (firstName, lastName) is handled
 * in-memory AFTER decryption, not at the SQL level.
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

  // NOTE: Search is handled in-memory AFTER decryption in findMany/findManyWithClinic
  // because firstName, lastName, email are ENCRYPTED in the database.
  // SQL-level LIKE/contains queries won't match plaintext search terms.

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
function normalizePagination(
  options: PatientPaginationOptions
): Required<PatientPaginationOptions> {
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
      const isPhiField = (PHI_FIELDS as readonly string[]).includes(field);
      diff[field] = {
        before: isPhiField ? '[REDACTED]' : beforeVal,
        after: isPhiField ? '[REDACTED]' : afterVal,
      };
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
