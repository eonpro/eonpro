import type { Patient, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { generatePatientId } from '@/lib/patients';
import { logger } from '@/lib/logger';
import type { NormalizedIntake, NormalizedPatient } from './types';

type NormalizedPatientForCreate = {
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
};

/**
 * Upsert a patient from intake form data
 *
 * CRITICAL: Multi-tenant isolation is enforced by:
 * 1. Always filtering patient searches by clinicId (when provided)
 * 2. Logging security warnings when cross-clinic matches are detected
 * 3. Creating new patients with the correct clinicId
 *
 * @param intake - Normalized intake form data
 * @param options.clinicId - The clinic ID to scope the search and creation
 * @param options.tags - Additional tags to apply
 */
export async function upsertPatientFromIntake(
  intake: NormalizedIntake,
  options?: { clinicId?: number; tags?: string[] }
): Promise<Patient> {
  const normalized = normalizePatient(intake.patient);
  const hashtags = collectHashtags(intake);
  const additionalTags = options?.tags || [];
  const allTags = [...new Set([...hashtags, ...additionalTags])];

  const matchFilters = buildMatchFilters(normalized);
  let existing: Patient | null = null;

  if (matchFilters.length > 0) {
    // CRITICAL: Build the where clause with clinic isolation
    const whereClause: Prisma.PatientWhereInput = {
      OR: matchFilters,
    };

    // If clinicId is provided, ALWAYS filter by it
    if (options?.clinicId) {
      whereClause.clinicId = options.clinicId;
    }

    existing = await prisma.patient.findFirst({
      where: whereClause,
    });

    // SECURITY AUDIT: Check if matching data exists in another clinic
    if (!existing && options?.clinicId) {
      const globalMatch = await prisma.patient.findFirst({
        where: { OR: matchFilters },
        select: { id: true, clinicId: true, email: true, patientId: true },
      });

      if (globalMatch && globalMatch.clinicId !== options.clinicId) {
        logger.warn(
          '[MedLinkPatientService] SECURITY: Patient with matching data exists in different clinic',
          {
            matchedPatientId: globalMatch.id,
            matchedPatientDisplayId: globalMatch.patientId,
            matchedClinicId: globalMatch.clinicId,
            requestedClinicId: options.clinicId,
            submissionId: intake.submissionId,
          }
        );
      }
    }
  }

  if (existing) {
    logger.info('[MedLinkPatientService] Updating existing patient', {
      patientId: existing.id,
      clinicId: existing.clinicId,
      submissionId: intake.submissionId,
    });

    const updated = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        ...normalized,
        // NOTE: Do NOT update clinicId - this would violate multi-tenant isolation
        // Patients should only be moved between clinics via explicit admin action
        tags: mergeTags(existing.tags, allTags),
        notes: appendNotes(existing.notes, intake.submissionId),
      },
    });
    return updated;
  }

  // Generate patient ID using the shared utility (handles clinic prefixes)
  const clinicIdForCounter = options?.clinicId || 1;
  const patientId = await generatePatientId(clinicIdForCounter);

  logger.info('[MedLinkPatientService] Creating new patient', {
    generatedPatientId: patientId,
    clinicId: options?.clinicId || null,
    submissionId: intake.submissionId,
  });

  const created = await prisma.patient.create({
    data: {
      ...normalized,
      patientId,
      clinicId: options?.clinicId!,
      tags: allTags,
      notes: `Created via MedLink submission ${intake.submissionId}`,
      source: 'webhook',
      sourceMetadata: {
        type: 'heyflow',
        submissionId: intake.submissionId,
        timestamp: new Date().toISOString(),
      },
    },
  });

  return created;
}

function normalizePatient(patient: NormalizedPatient): NormalizedPatientForCreate {
  return {
    firstName: capitalize(patient.firstName) || 'Unknown',
    lastName: capitalize(patient.lastName) || 'Unknown',
    email: patient.email?.toLowerCase() || 'unknown@example.com',
    phone: sanitizePhone(patient.phone),
    dob: normalizeDate(patient.dob),
    gender: normalizeGender(patient.gender),
    address1: patient.address1 ?? '',
    address2: patient.address2 ?? '',
    city: patient.city ?? '',
    state: (patient.state ?? '').toUpperCase(),
    zip: patient.zip ?? '',
  };
}

function buildMatchFilters(patient: NormalizedPatient) {
  const filters: Prisma.PatientWhereInput[] = [];
  if (patient.email) {
    filters.push({ email: patient.email.toLowerCase() });
  }
  if (patient.phone) {
    filters.push({ phone: sanitizePhone(patient.phone) });
  }
  if (patient.firstName && patient.lastName && patient.dob) {
    filters.push({
      firstName: patient.firstName,
      lastName: patient.lastName,
      dob: patient.dob,
    });
  }
  return filters;
}

function sanitizePhone(value?: string) {
  if (!value) return '0000000000';
  const digits = value.replace(/\D/g, '');
  return digits || '0000000000';
}

function normalizeGender(value?: string) {
  if (!value) return 'm';
  const lower = value.toLowerCase().trim();
  // Check for female/woman variations
  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'f';
  // Check for male/man variations
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'm';
  // Fallback: if starts with 'f' or 'w' (woman), treat as female
  if (lower.startsWith('f') || lower.startsWith('w')) return 'f';
  return 'm';
}

function normalizeDate(value?: string) {
  if (!value) return '1900-01-01';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = value.replace(/[^0-9]/g, '').match(/(\d{2})(\d{2})(\d{4})/);
  if (parts) {
    const [, mm, dd, yyyy] = parts;
    return `${yyyy}-${mm}-${dd}`;
  }
  return '1900-01-01';
}

function capitalize(value?: string) {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .map((chunk: any) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function mergeTags(existing: any, incoming: string[]) {
  const current = Array.isArray(existing) ? (existing as string[]) : [];
  const merged = new Set([...current, ...incoming]);
  return Array.from(merged).filter(Boolean);
}

function collectHashtags(intake: NormalizedIntake) {
  const tags = new Set<string>(['medlink']);
  intake.answers.forEach((answer: any) => {
    const matches = answer.value.match(/#\w+/g);
    if (matches) {
      matches.forEach((tag: any) => tags.add(tag.replace(/^#/, '').toLowerCase()));
    }
  });
  return Array.from(tags);
}

function appendNotes(existing: string | null | undefined, submissionId: string) {
  const suffix = `Synced from MedLink ${submissionId}`;
  if (!existing) return suffix;
  if (existing.includes(submissionId)) return existing;
  return `${existing}\n${suffix}`;
}
