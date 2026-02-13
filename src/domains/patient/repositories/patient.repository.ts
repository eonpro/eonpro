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

/**
 * PHI fields that need encryption/decryption
 *
 * SOC 2 Compliance: All PII/PHI fields must be encrypted at rest
 * - Direct identifiers: firstName, lastName, email, phone
 * - Health information: dob
 * - Location data: address1, address2, city, state, zip
 *
 * @see docs/HIPAA_COMPLIANCE_EVIDENCE.md for compliance documentation
 */
const PHI_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'dob',
  'address1',
  'address2',
  'city',
  'state',
  'zip',
] as const;

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
      // NOTE: Patient PHI (firstName, lastName, email) is ENCRYPTED in the database.
      // SQL-level search on encrypted fields won't work.
      // For search: fetch all, decrypt, filter in memory, then paginate.
      const where = buildWhereClause(filter);
      const { limit, offset, orderBy, orderDir } = normalizePagination(pagination);
      const hasSearch = !!filter.search;

      if (hasSearch) {
        // Fetch more patients for in-memory filtering (up to 2000)
        const allPatients = await db.patient.findMany({
          where,
          select: PATIENT_SUMMARY_SELECT,
          orderBy: { [orderBy]: orderDir },
          take: 2000,
        });

        // Decrypt and filter by search
        const decryptedAll = allPatients.map((p) => decryptPatientSummary(p));
        const filtered = filterPatientsBySearch(decryptedAll, filter.search!);

        // Apply pagination to filtered results
        const paginated = filtered.slice(offset, offset + limit);

        return {
          data: paginated,
          total: filtered.length,
          limit,
          offset,
          hasMore: offset + paginated.length < filtered.length,
        };
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
      // NOTE: Patient PHI (firstName, lastName, email) is ENCRYPTED in the database.
      // SQL-level search on encrypted fields won't work.
      // For search: fetch all, decrypt, filter in memory, then paginate.
      const where = buildWhereClause(filter);
      const { limit, offset, orderBy, orderDir } = normalizePagination(pagination);
      const hasSearch = !!filter.search;

      if (hasSearch) {
        // Fetch more patients for in-memory filtering (up to 2000)
        const allPatients = await db.patient.findMany({
          where,
          select: {
            ...PATIENT_SUMMARY_SELECT,
            clinic: { select: { name: true } },
          },
          orderBy: { [orderBy]: orderDir },
          take: 2000,
        });

        // Decrypt and filter by search
        const decryptedAll = allPatients.map((p) => ({
          ...decryptPatientSummary(p),
          clinicName: p.clinic?.name ?? null,
        }));
        const filtered = filterPatientsBySearch(decryptedAll, filter.search!);

        // Apply pagination to filtered results
        const paginated = filtered.slice(offset, offset + limit);

        return {
          data: paginated,
          total: filtered.length,
          limit,
          offset,
          hasMore: offset + paginated.length < filtered.length,
        };
      }

      // No search: use normal DB pagination
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
      // Generate patient ID using the shared utility (handles clinic prefixes like EON-123, WEL-456)
      const patientId = await generatePatientId(input.clinicId);

      return db.$transaction(async (tx: Prisma.TransactionClient) => {
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
 * Safely extract string for PatientSummary (handles null/undefined from decryption failures)
 */
function safeStr(v: unknown): string {
  return v != null && typeof v === 'string' ? v : '';
}

/**
 * Decrypt patient summary PHI fields
 * Gracefully handles decryption failures by returning raw data with safe fallbacks
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
    id: (decrypted.id as number) ?? 0,
    patientId: (decrypted.patientId as string | null) ?? null,
    firstName: safeStr(decrypted.firstName),
    lastName: safeStr(decrypted.lastName),
    email: safeStr(decrypted.email),
    phone: safeStr(decrypted.phone),
    dob: safeStr(decrypted.dob),
    gender: safeStr(decrypted.gender),
    address1: safeStr(decrypted.address1),
    address2: (decrypted.address2 != null && typeof decrypted.address2 === 'string'
      ? decrypted.address2
      : null) as string | null,
    city: safeStr(decrypted.city),
    state: safeStr(decrypted.state),
    zip: safeStr(decrypted.zip),
    tags: (decrypted.tags as string[] | null) ?? null,
    source: (decrypted.source as PatientSummary['source']) ?? null,
    createdAt: (decrypted.createdAt as Date) ?? new Date(),
    clinicId: (decrypted.clinicId as number) ?? 0,
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
  const searchLower = search.toLowerCase().trim();
  if (!searchLower) return patients;

  const searchTerms = searchLower.split(/\s+/).filter(Boolean);

  return patients.filter((patient) => {
    const firstName = toSearchableString(patient.firstName);
    const lastName = toSearchableString(patient.lastName);
    const patientIdLower = toSearchableString(patient.patientId);
    const emailLower = toSearchableString(patient.email);
    const phoneDigits = toSearchableString(patient.phone).replace(/\D/g, '');

    // Build searchable strings for matching
    const searchDigits = searchLower.replace(/\D/g, '');
    const hasPhoneMatch =
      searchDigits.length >= 3 && phoneDigits.length >= 3 && phoneDigits.includes(searchDigits);

    // Single term: match against name, patientId, email, or phone
    if (searchTerms.length === 1) {
      const term = searchTerms[0];
      return (
        firstName.includes(term) ||
        lastName.includes(term) ||
        patientIdLower.includes(term) ||
        emailLower.includes(term) ||
        hasPhoneMatch
      );
    }

    // Multiple terms: match as "firstName lastName" or all terms somewhere
    const fullName = `${firstName} ${lastName}`;
    const reverseName = `${lastName} ${firstName}`;

    if (fullName.includes(searchLower) || reverseName.includes(searchLower)) {
      return true;
    }

    return searchTerms.every(
      (term) =>
        firstName.includes(term) ||
        lastName.includes(term) ||
        patientIdLower.includes(term) ||
        emailLower.includes(term)
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
