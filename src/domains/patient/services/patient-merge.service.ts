/**
 * Patient Merge Service
 * =====================
 *
 * Service for merging duplicate patient profiles.
 * Handles re-pointing all related entities and intelligently merging profile data.
 *
 * @module domains/patient/services
 */

import { type PrismaClient, type Prisma } from '@prisma/client';

import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '@/domains/shared/errors';
import type { UserContext } from '@/domains/shared/types';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decryptPatientPHI } from '@/lib/security/phi-encryption';

import type { PatientEntity, AuditContext } from '../types';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for executing a patient merge
 */
export interface MergeOptions {
  /** ID of the patient to merge FROM (will be deleted) */
  sourcePatientId: number;
  /** ID of the patient to merge INTO (will be kept) */
  targetPatientId: number;
  /** Optional manual field overrides for the merged profile */
  fieldOverrides?: Partial<PatientMergeFields>;
  /** User performing the merge (for audit) */
  performedBy: UserContext;
}

/**
 * Fields that can be overridden during merge
 */
export interface PatientMergeFields {
  firstName: string;
  lastName: string;
  dob: string;
  gender: string;
  phone: string;
  email: string;
  address1: string;
  address2: string | null;
  city: string;
  state: string;
  zip: string;
  notes: string | null;
}

/**
 * Counts of related records for each patient
 */
export interface RelationCounts {
  orders: number;
  invoices: number;
  payments: number;
  paymentMethods: number;
  subscriptions: number;
  soapNotes: number;
  documents: number;
  intakeSubmissions: number;
  appointments: number;
  superbills: number;
  carePlans: number;
  tickets: number;
  weightLogs: number;
  medicationReminders: number;
  waterLogs: number;
  exerciseLogs: number;
  sleepLogs: number;
  nutritionLogs: number;
  aiConversations: number;
  chatMessages: number;
  smsLogs: number;
  referralTrackings: number;
  affiliateReferrals: number;
  discountUsages: number;
  shippingUpdates: number;
  auditEntries: number;
}

/**
 * Preview of what a merge will do
 */
export interface MergePreview {
  /** Source patient (will be deleted) */
  source: PatientEntity & { _counts: RelationCounts };
  /** Target patient (will be kept) */
  target: PatientEntity & { _counts: RelationCounts };
  /** Resulting merged profile fields */
  mergedProfile: PatientMergeFields;
  /** Total records that will be moved */
  totalRecordsToMove: number;
  /** Conflicts/warnings to show user */
  conflicts: MergeConflict[];
  /** Whether merge can proceed */
  canMerge: boolean;
}

/**
 * A conflict or warning about the merge
 */
export interface MergeConflict {
  type: 'error' | 'warning';
  field: string;
  message: string;
}

/**
 * Result of a successful merge
 */
export interface MergeResult {
  /** The surviving patient record */
  mergedPatient: PatientEntity;
  /** ID of the patient that was deleted */
  deletedPatientId: number;
  /** Number of records that were moved */
  recordsMoved: number;
  /** Audit entry ID */
  auditId: number;
}

// ============================================================================
// PHI Fields for decryption
// ============================================================================

/**
 * PHI fields that need encryption/decryption
 * Must match patient.repository.ts PHI_FIELDS
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
// Service Interface
// ============================================================================

export interface PatientMergeService {
  /**
   * Preview a merge without making changes
   */
  previewMerge(
    sourcePatientId: number,
    targetPatientId: number,
    user: UserContext
  ): Promise<MergePreview>;

  /**
   * Execute a patient merge
   */
  executeMerge(options: MergeOptions): Promise<MergeResult>;
}

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Create a patient merge service instance
 */
export function createPatientMergeService(db: PrismaClient = prisma): PatientMergeService {
  return {
    async previewMerge(
      sourcePatientId: number,
      targetPatientId: number,
      user: UserContext
    ): Promise<MergePreview> {
      // Validate inputs
      if (sourcePatientId === targetPatientId) {
        throw new BadRequestError('Cannot merge a patient with themselves');
      }

      // Determine clinic filter
      const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;
      if (user.role !== 'super_admin' && !clinicId) {
        throw new ForbiddenError('No clinic associated with your account');
      }

      // Provider-specific authorization: verify provider is assigned to the clinic
      if (user.role === 'provider') {
        if (!user.providerId) {
          throw new ForbiddenError('No provider profile linked to your account');
        }
        // Verify provider-clinic assignment (multi-clinic providers may have access to multiple clinics)
        const providerClinicAssignment = await db.providerClinic.findFirst({
          where: {
            providerId: user.providerId,
            clinicId: clinicId!,
            isActive: true,
          },
        });
        // Fallback: check legacy direct clinicId on provider record
        if (!providerClinicAssignment) {
          const provider = await db.provider.findUnique({
            where: { id: user.providerId },
            select: { clinicId: true },
          });
          if (provider?.clinicId !== clinicId && provider?.clinicId !== null) {
            throw new ForbiddenError('You are not assigned to this clinic');
          }
        }
        logger.info('Provider initiating patient merge preview', {
          providerId: user.providerId,
          clinicId,
          sourcePatientId,
          targetPatientId,
        });
      }

      // Fetch both patients with all relation counts
      const [sourceRaw, targetRaw] = await Promise.all([
        fetchPatientWithCounts(db, sourcePatientId, clinicId ?? undefined),
        fetchPatientWithCounts(db, targetPatientId, clinicId ?? undefined),
      ]);

      if (!sourceRaw) {
        throw new NotFoundError(`Source patient with ID ${sourcePatientId} not found`);
      }
      if (!targetRaw) {
        throw new NotFoundError(`Target patient with ID ${targetPatientId} not found`);
      }

      // Ensure both patients belong to the same clinic
      if (sourceRaw.clinicId !== targetRaw.clinicId) {
        throw new BadRequestError('Cannot merge patients from different clinics');
      }

      // Decrypt PHI fields (cast to unknown first for PHI decryption compatibility)
      const source = decryptPatient(
        sourceRaw as unknown as Record<string, unknown>
      ) as unknown as PatientEntity & { _counts: RelationCounts };
      const target = decryptPatient(
        targetRaw as unknown as Record<string, unknown>
      ) as unknown as PatientEntity & { _counts: RelationCounts };

      // Build merged profile
      const mergedProfile = buildMergedProfile(source, target);

      // Check for conflicts
      const conflicts = checkMergeConflicts(source, target);

      // Calculate total records to move
      const counts = Object.values(source._counts) as number[];
      const totalRecordsToMove = counts.reduce((a, b) => a + b, 0);

      return {
        source,
        target,
        mergedProfile,
        totalRecordsToMove,
        conflicts,
        canMerge: !conflicts.some((c) => c.type === 'error'),
      };
    },

    async executeMerge(options: MergeOptions): Promise<MergeResult> {
      const { sourcePatientId, targetPatientId, fieldOverrides, performedBy } = options;

      // Get preview first to validate
      const preview = await this.previewMerge(sourcePatientId, targetPatientId, performedBy);

      if (!preview.canMerge) {
        const errors = preview.conflicts.filter((c) => c.type === 'error');
        throw new ConflictError(
          `Cannot merge patients: ${errors.map((e) => e.message).join(', ')}`
        );
      }

      const audit: AuditContext = {
        actorEmail: performedBy.email,
        actorRole: performedBy.role,
        actorId: performedBy.id,
      };

      // Execute merge in a transaction
      return db.$transaction(async (tx) => {
        // =====================================================================
        // 1. RE-POINT ALL RELATIONS FROM SOURCE TO TARGET
        // =====================================================================

        // Orders
        await tx.order.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Invoices
        await tx.invoice.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Payments
        await tx.payment.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Payment Methods
        await tx.paymentMethod.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Subscriptions
        await tx.subscription.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // SOAP Notes
        await tx.sOAPNote.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Patient Documents
        await tx.patientDocument.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Intake Form Submissions
        await tx.intakeFormSubmission.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Appointments
        await tx.appointment.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Superbills
        await tx.superbill.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Care Plans
        await tx.carePlan.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Tickets
        await tx.ticket.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Progress Tracking Logs
        await tx.patientWeightLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        await tx.patientMedicationReminder.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        await tx.patientWaterLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        await tx.patientExerciseLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        await tx.patientSleepLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        await tx.patientNutritionLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // AI Conversations
        await tx.aIConversation.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Chat Messages
        await tx.patientChatMessage.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // SMS Logs
        await tx.smsLog.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Affiliate Referrals
        await tx.affiliateReferral.updateMany({
          where: { referredPatientId: sourcePatientId },
          data: { referredPatientId: targetPatientId },
        });

        // Discount Usages
        await tx.discountUsage.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Shipping Updates
        await tx.patientShippingUpdate.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Payment Reconciliation
        await tx.paymentReconciliation.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // HIPAA Audit Entries
        await tx.hIPAAAuditEntry.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // Phone OTPs
        await tx.phoneOtp.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // =====================================================================
        // 2. HANDLE UNIQUE CONSTRAINT RELATIONS
        // =====================================================================

        // ReferralTracking (one-to-one) - Delete source's if target has one
        const sourceReferral = await tx.referralTracking.findFirst({
          where: { patientId: sourcePatientId },
        });
        const targetReferral = await tx.referralTracking.findFirst({
          where: { patientId: targetPatientId },
        });

        if (sourceReferral) {
          if (targetReferral) {
            // Delete commissions for source referral first
            await tx.commission.deleteMany({
              where: { referralId: sourceReferral.id },
            });
            // Delete source referral
            await tx.referralTracking.delete({
              where: { id: sourceReferral.id },
            });
          } else {
            // Move referral to target
            await tx.referralTracking.update({
              where: { id: sourceReferral.id },
              data: { patientId: targetPatientId },
            });
          }
        }

        // User account (one-to-one) - Re-point source's user to target if target has no user
        const sourceUser = await tx.user.findFirst({
          where: { patientId: sourcePatientId },
        });
        const targetUser = await tx.user.findFirst({
          where: { patientId: targetPatientId },
        });

        if (sourceUser) {
          if (targetUser) {
            // Target already has a user - nullify source's user patient link
            await tx.user.update({
              where: { id: sourceUser.id },
              data: { patientId: null },
            });
          } else {
            // Move user account to target
            await tx.user.update({
              where: { id: sourceUser.id },
              data: { patientId: targetPatientId },
            });
          }
        }

        // =====================================================================
        // 3. MERGE PROFILE FIELDS AND METADATA
        // =====================================================================

        const mergedFields = fieldOverrides
          ? { ...preview.mergedProfile, ...fieldOverrides }
          : preview.mergedProfile;

        // Merge sourceMetadata (intake data)
        const mergedSourceMetadata = mergeSourceMetadata(
          preview.source.sourceMetadata as Record<string, unknown> | null,
          preview.target.sourceMetadata as Record<string, unknown> | null
        );

        // Merge tags (union)
        const sourceTags = Array.isArray(preview.source.tags) ? preview.source.tags : [];
        const targetTags = Array.isArray(preview.target.tags) ? preview.target.tags : [];
        const mergedTags = [...new Set([...targetTags, ...sourceTags])];

        // Determine which Stripe customer ID to keep
        let stripeCustomerId = preview.target.stripeCustomerId;
        if (!stripeCustomerId && preview.source.stripeCustomerId) {
          stripeCustomerId = preview.source.stripeCustomerId;
        }

        // Determine which Lifefile ID to keep
        let lifefileId = preview.target.lifefileId;
        if (!lifefileId && preview.source.lifefileId) {
          lifefileId = preview.source.lifefileId;
        }

        // Use earliest createdAt
        const earliestCreatedAt =
          preview.source.createdAt < preview.target.createdAt
            ? preview.source.createdAt
            : preview.target.createdAt;

        // Update target patient with merged data
        const updatedPatient = await tx.patient.update({
          where: { id: targetPatientId },
          data: {
            firstName: mergedFields.firstName,
            lastName: mergedFields.lastName,
            dob: mergedFields.dob,
            gender: mergedFields.gender,
            phone: mergedFields.phone,
            email: mergedFields.email,
            address1: mergedFields.address1,
            address2: mergedFields.address2,
            city: mergedFields.city,
            state: mergedFields.state,
            zip: mergedFields.zip,
            notes: mergedFields.notes,
            tags: mergedTags as Prisma.InputJsonValue,
            sourceMetadata: mergedSourceMetadata as Prisma.InputJsonValue,
            stripeCustomerId,
            lifefileId,
            createdAt: earliestCreatedAt,
          },
        });

        // =====================================================================
        // 4. CREATE AUDIT ENTRIES
        // =====================================================================

        // Create audit entry for the merge
        const auditDiff = {
          type: 'PATIENT_MERGE',
          sourcePatientId,
          targetPatientId,
          sourcePatientData: {
            id: preview.source.id,
            firstName: preview.source.firstName,
            lastName: preview.source.lastName,
            email: preview.source.email,
            patientId: preview.source.patientId,
          },
          recordsMoved: preview.totalRecordsToMove,
          mergedFields,
          performedBy: audit.actorEmail,
          performedByRole: audit.actorRole,
          performedByProviderId: performedBy.providerId ?? null,
          performedAt: new Date().toISOString(),
        };
        const auditEntry = await tx.patientAudit.create({
          data: {
            patientId: targetPatientId,
            action: 'MERGE',
            actorEmail: audit.actorEmail,
            diff: auditDiff as unknown as Prisma.InputJsonValue,
          },
        });

        // Move source patient's audit entries to target (for history preservation)
        await tx.patientAudit.updateMany({
          where: { patientId: sourcePatientId },
          data: { patientId: targetPatientId },
        });

        // =====================================================================
        // 5. DELETE SOURCE PATIENT
        // =====================================================================

        // Clear stripeCustomerId from source if it was moved (to avoid unique constraint)
        if (
          preview.source.stripeCustomerId &&
          preview.source.stripeCustomerId === stripeCustomerId
        ) {
          await tx.patient.update({
            where: { id: sourcePatientId },
            data: { stripeCustomerId: null },
          });
        }

        // Delete the source patient
        await tx.patient.delete({
          where: { id: sourcePatientId },
        });

        logger.info('Patient merge completed', {
          sourcePatientId,
          targetPatientId,
          recordsMoved: preview.totalRecordsToMove,
          performedBy: audit.actorEmail,
          performedByRole: audit.actorRole,
          performedByProviderId: performedBy.providerId ?? null,
        });

        return {
          mergedPatient: decryptPatient(updatedPatient) as PatientEntity,
          deletedPatientId: sourcePatientId,
          recordsMoved: preview.totalRecordsToMove,
          auditId: auditEntry.id,
        };
      });
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch a patient with all relation counts
 */
async function fetchPatientWithCounts(
  db: PrismaClient,
  patientId: number,
  clinicId?: number
): Promise<(PatientEntity & { _counts: RelationCounts }) | null> {
  const where: Prisma.PatientWhereInput = { id: patientId };
  if (clinicId !== undefined) {
    where.clinicId = clinicId;
  }

  const patient = await db.patient.findFirst({
    where,
    include: {
      _count: {
        select: {
          orders: true,
          invoices: true,
          payments: true,
          paymentMethods: true,
          subscriptions: true,
          soapNotes: true,
          documents: true,
          intakeSubmissions: true,
          appointments: true,
          superbills: true,
          carePlans: true,
          tickets: true,
          weightLogs: true,
          medicationReminders: true,
          waterLogs: true,
          exerciseLogs: true,
          sleepLogs: true,
          nutritionLogs: true,
          aiConversations: true,
          chatMessages: true,
          smsLogs: true,
          referrals: true,
          affiliateReferrals: true,
          discountUsages: true,
          shippingUpdates: true,
          auditEntries: true,
        },
      },
    },
  });

  if (!patient) {
    return null;
  }

  // Transform _count to _counts with correct names
  const _counts: RelationCounts = {
    orders: patient._count.orders,
    invoices: patient._count.invoices,
    payments: patient._count.payments,
    paymentMethods: patient._count.paymentMethods,
    subscriptions: patient._count.subscriptions,
    soapNotes: patient._count.soapNotes,
    documents: patient._count.documents,
    intakeSubmissions: patient._count.intakeSubmissions,
    appointments: patient._count.appointments,
    superbills: patient._count.superbills,
    carePlans: patient._count.carePlans,
    tickets: patient._count.tickets,
    weightLogs: patient._count.weightLogs,
    medicationReminders: patient._count.medicationReminders,
    waterLogs: patient._count.waterLogs,
    exerciseLogs: patient._count.exerciseLogs,
    sleepLogs: patient._count.sleepLogs,
    nutritionLogs: patient._count.nutritionLogs,
    aiConversations: patient._count.aiConversations,
    chatMessages: patient._count.chatMessages,
    smsLogs: patient._count.smsLogs,
    referralTrackings: patient._count.referrals,
    affiliateReferrals: patient._count.affiliateReferrals,
    discountUsages: patient._count.discountUsages,
    shippingUpdates: patient._count.shippingUpdates,
    auditEntries: patient._count.auditEntries,
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _count, ...patientData } = patient;

  return {
    ...patientData,
    _counts,
  } as PatientEntity & { _counts: RelationCounts };
}

/**
 * Decrypt patient PHI fields
 */
function decryptPatient<T extends Record<string, unknown>>(patient: T): T {
  try {
    return decryptPatientPHI(patient, [...PHI_FIELDS]);
  } catch {
    // If decryption fails, return raw data
    return patient;
  }
}

/**
 * Build merged profile using target values, filling gaps from source
 */
function buildMergedProfile(source: PatientEntity, target: PatientEntity): PatientMergeFields {
  return {
    // Use target values, fallback to source if target is empty
    firstName: target.firstName || source.firstName,
    lastName: target.lastName || source.lastName,
    dob: target.dob || source.dob,
    gender: target.gender || source.gender,
    phone: target.phone || source.phone,
    email: target.email || source.email,
    address1: target.address1 || source.address1,
    address2: target.address2 || source.address2,
    city: target.city || source.city,
    state: target.state || source.state,
    zip: target.zip || source.zip,
    // Concatenate notes
    notes: mergeNotes(source.notes, target.notes),
  };
}

/**
 * Merge notes from both patients
 */
function mergeNotes(sourceNotes: string | null, targetNotes: string | null): string | null {
  if (!sourceNotes && !targetNotes) return null;
  if (!sourceNotes) return targetNotes;
  if (!targetNotes) return sourceNotes;
  if (sourceNotes === targetNotes) return targetNotes;

  return `${targetNotes}\n\n--- Merged from duplicate profile ---\n${sourceNotes}`;
}

/**
 * Deep merge sourceMetadata (intake data)
 */
function mergeSourceMetadata(
  sourceMetadata: Record<string, unknown> | null,
  targetMetadata: Record<string, unknown> | null
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Start with target metadata
  if (targetMetadata) {
    Object.assign(result, targetMetadata);
  }

  // Fill gaps from source metadata
  if (sourceMetadata) {
    for (const [key, value] of Object.entries(sourceMetadata)) {
      if (result[key] === undefined || result[key] === null || result[key] === '') {
        result[key] = value;
      } else if (
        typeof result[key] === 'object' &&
        result[key] !== null &&
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(result[key]) &&
        !Array.isArray(value)
      ) {
        // Deep merge nested objects
        result[key] = mergeSourceMetadata(
          value as Record<string, unknown>,
          result[key] as Record<string, unknown>
        );
      }
    }
  }

  // Add merge metadata
  result._mergedAt = new Date().toISOString();
  result._mergedFrom = sourceMetadata ? 'profile_merge' : undefined;

  return result;
}

/**
 * Check for merge conflicts
 */
function checkMergeConflicts(
  source: PatientEntity & { _counts: RelationCounts },
  target: PatientEntity & { _counts: RelationCounts }
): MergeConflict[] {
  const conflicts: MergeConflict[] = [];

  // Check Stripe customer ID conflict
  if (source.stripeCustomerId && target.stripeCustomerId) {
    if (source.stripeCustomerId !== target.stripeCustomerId) {
      conflicts.push({
        type: 'warning',
        field: 'stripeCustomerId',
        message:
          "Both patients have different Stripe customer IDs. The target patient's Stripe ID will be kept. You may need to merge customers in Stripe separately.",
      });
    }
  }

  // Check Lifefile ID conflict
  if (source.lifefileId && target.lifefileId) {
    if (source.lifefileId !== target.lifefileId) {
      conflicts.push({
        type: 'warning',
        field: 'lifefileId',
        message:
          "Both patients have different Lifefile IDs. The target patient's Lifefile ID will be kept.",
      });
    }
  }

  // Note: User account conflicts are handled in executeMerge
  // We don't block the merge, just nullify the source user's patient link

  return conflicts;
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default patient merge service instance
 */
export const patientMergeService = createPatientMergeService();
