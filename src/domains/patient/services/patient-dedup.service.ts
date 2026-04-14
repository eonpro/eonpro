/**
 * Patient Deduplication Service
 * =============================
 *
 * Centralized duplicate detection for patient intake. Uses deterministic
 * HMAC-SHA256 hashes of email + DOB stored alongside encrypted PHI to
 * enable O(1) duplicate lookups without exposing plaintext.
 *
 * Matching criteria: email AND DOB within the same clinic.
 * Placeholder values (unknown@example.com, 1900-01-01) are excluded.
 *
 * @module domains/patient/services/patient-dedup
 */

import type { Patient, PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { generatePatientId } from '@/lib/patients';
import {
  encryptPatientPHI,
  computeEmailHash,
  computeDobHash,
  withPatientHashes,
} from '@/lib/security/phi-encryption';
import { buildPatientSearchIndex } from '@/lib/utils/search';

// ============================================================================
// Types
// ============================================================================

export interface IntakePatientData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  gender: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface ResolvePatientOptions {
  clinicId: number;
  tags?: string[];
  notes?: string | null;
  source?: string;
  sourceMetadata?: Record<string, unknown>;
  /** Skip PHI encryption (caller already encrypted) */
  skipEncryption?: boolean;
  /** Prisma transaction client — when provided, all DB work happens inside it */
  tx?: Prisma.TransactionClient;
}

export interface ResolvePatientResult {
  patient: Patient;
  isNew: boolean;
  wasMerged: boolean;
}

// ============================================================================
// Service
// ============================================================================

export interface PatientDeduplicationService {
  /**
   * Find an existing patient by email + DOB within a clinic.
   * Returns null when either value is a placeholder or no match exists.
   */
  findDuplicate(
    email: string | null | undefined,
    dob: string | null | undefined,
    clinicId: number,
    tx?: Prisma.TransactionClient
  ): Promise<Patient | null>;

  /**
   * Resolve the patient record for an incoming intake:
   *  - If a duplicate exists (same email + DOB in clinic), update it and return.
   *  - Otherwise, create a new patient.
   */
  resolvePatientForIntake(
    data: IntakePatientData,
    options: ResolvePatientOptions
  ): Promise<ResolvePatientResult>;
}

// ============================================================================
// Placeholder guards
// ============================================================================

const PLACEHOLDER_PHONES = new Set(['0000000000', '']);
const PLACEHOLDER_EMAILS = new Set([
  'unknown@example.com',
  'unknown@intake.local',
  'noemail@placeholder.local',
  '',
]);

function isPlaceholderEmail(v: string): boolean {
  return (
    PLACEHOLDER_EMAILS.has(v.toLowerCase().trim()) ||
    v.endsWith('@intake.local') ||
    v.endsWith('@placeholder.local')
  );
}

function isPlaceholderPhone(v: string): boolean {
  return PLACEHOLDER_PHONES.has(v.replace(/\D/g, ''));
}

function isPlaceholderDob(v: string): boolean {
  const trimmed = v.trim();
  return trimmed === '1900-01-01' || trimmed === '';
}

// ============================================================================
// Implementation
// ============================================================================

export function createPatientDeduplicationService(
  db: PrismaClient = prisma
): PatientDeduplicationService {
  return {
    async findDuplicate(
      email: string | null | undefined,
      dob: string | null | undefined,
      clinicId: number,
      tx?: Prisma.TransactionClient
    ): Promise<Patient | null> {
      const emailH = computeEmailHash(email);
      const dobH = computeDobHash(dob);

      if (!emailH || !dobH) return null;

      const client = tx ?? db;
      const existing = await client.patient.findFirst({
        where: { clinicId, emailHash: emailH, dobHash: dobH },
      });

      return existing;
    },

    async resolvePatientForIntake(
      data: IntakePatientData,
      options: ResolvePatientOptions
    ): Promise<ResolvePatientResult> {
      const { clinicId, tags, notes, source, sourceMetadata, skipEncryption, tx } = options;
      const client = tx ?? db;

      // 1. Check for duplicate
      const existing = await this.findDuplicate(data.email, data.dob, clinicId, tx);

      if (existing) {
        logger.info('[PatientDedup] Duplicate found — merging into existing patient', {
          patientId: existing.id,
          displayId: existing.patientId,
          clinicId,
        });

        const updateData = buildMergeUpdate(data, existing, tags ?? []);
        const emailH = computeEmailHash(data.email);
        const dobH = computeDobHash(data.dob);

        // Append notes — never discard existing notes
        if (notes) {
          const existingNotes = existing.notes ?? '';
          if (existingNotes && !existingNotes.includes(notes)) {
            updateData.notes = `${existingNotes}\n${notes}`;
          } else if (!existingNotes) {
            updateData.notes = notes;
          }
        }

        // Merge sourceMetadata — keep existing keys, add new ones
        if (sourceMetadata) {
          const existingMeta = (existing.sourceMetadata as Record<string, unknown>) ?? {};
          updateData.sourceMetadata = {
            ...existingMeta,
            lastIntakeSource: source ?? 'webhook',
            lastIntakeAt: new Date().toISOString(),
            ...sourceMetadata,
          } as unknown as Prisma.InputJsonValue;
        }

        const updated = await client.patient.update({
          where: { id: existing.id },
          data: {
            ...updateData,
            ...(emailH && !existing.emailHash ? { emailHash: emailH } : {}),
            ...(dobH && !existing.dobHash ? { dobHash: dobH } : {}),
          },
        });

        return { patient: updated, isNew: false, wasMerged: true };
      }

      // 2. No duplicate — create new patient
      const patientId = await generatePatientId(clinicId);
      const searchIndex = buildPatientSearchIndex({
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        patientId,
      });

      const phiData = skipEncryption ? data : encryptPatientPHI({ ...data });
      const hashEnriched = withPatientHashes(
        phiData as unknown as Record<string, unknown>,
        data.email,
        data.dob
      );

      const created = await client.patient.create({
        data: {
          ...hashEnriched,
          patientId,
          clinicId,
          tags: (tags ?? []) as Prisma.InputJsonValue,
          notes: notes ?? null,
          source: source ?? 'webhook',
          sourceMetadata: (sourceMetadata ?? {}) as Prisma.InputJsonValue,
          searchIndex,
        } as unknown as Prisma.PatientCreateInput,
      });

      logger.info('[PatientDedup] Created new patient', {
        patientId: created.id,
        displayId: patientId,
        clinicId,
      });

      return { patient: created, isNew: true, wasMerged: false };
    },
  };
}

// ============================================================================
// Merge helpers
// ============================================================================

/**
 * Build an update payload that truly merges incoming intake data into an
 * existing patient, keeping the most complete profile.
 *
 * Rules — per field:
 *  1. Existing has real data  → keep it (never overwrite with different intake data)
 *  2. Existing is empty/placeholder, incoming is real → fill the gap from incoming
 *  3. Both empty → skip
 *
 * This ensures the established profile is never degraded by a new intake;
 * new intakes only *improve* the record by filling in missing fields.
 *
 * Tags are unioned. Notes are appended.
 */
function buildMergeUpdate(
  incoming: IntakePatientData,
  existing: Patient,
  incomingTags: string[]
): Prisma.PatientUpdateInput {
  const merged: Record<string, unknown> = {};
  const existingRec = existing as unknown as Record<string, unknown>;

  const fieldRules: [keyof IntakePatientData, (v: string) => boolean][] = [
    ['firstName', (v) => !v || v === 'Unknown'],
    ['lastName', (v) => !v || v === 'Unknown'],
    ['email', (v) => isPlaceholderEmail(v)],
    ['phone', (v) => isPlaceholderPhone(v)],
    ['dob', (v) => isPlaceholderDob(v)],
    ['gender', (v) => !v],
    ['address1', (v) => !v],
    ['address2', (v) => !v],
    ['city', (v) => !v],
    ['state', (v) => !v],
    ['zip', (v) => !v],
  ];

  for (const [field, isEmptyOrPlaceholder] of fieldRules) {
    const incomingVal = incoming[field] ?? '';
    const existingVal = String(existingRec[field] ?? '');
    const existingIsEmpty = isEmptyOrPlaceholder(existingVal);
    const incomingIsEmpty = isEmptyOrPlaceholder(incomingVal);

    if (!existingIsEmpty) {
      // Existing has real data — preserve it
      merged[field] = existingVal;
    } else if (!incomingIsEmpty) {
      // Existing is empty/placeholder, incoming has real data — fill the gap
      merged[field] = incomingVal;
    }
    // else: both empty — don't set, keep whatever is in DB
  }

  // Tags: union of both sets
  const currentTags = Array.isArray(existingRec.tags) ? (existingRec.tags as string[]) : [];
  const mergedTags = [...new Set([...currentTags, ...incomingTags])].filter(Boolean);
  merged.tags = mergedTags as unknown as Prisma.InputJsonValue;

  // Refresh search index using the best value for each field
  merged.searchIndex = buildPatientSearchIndex({
    firstName: String(merged.firstName ?? incoming.firstName),
    lastName: String(merged.lastName ?? incoming.lastName),
    email: String(merged.email ?? incoming.email),
    phone: String(merged.phone ?? incoming.phone),
    patientId: existing.patientId,
  });

  return merged as Prisma.PatientUpdateInput;
}

// ============================================================================
// Default singleton
// ============================================================================

export const patientDeduplicationService = createPatientDeduplicationService();
