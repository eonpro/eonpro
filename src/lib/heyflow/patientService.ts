import type { Patient } from '@prisma/client';
import { logger } from '@/lib/logger';
import { patientDeduplicationService } from '@/domains/patient';
import type { NormalizedIntake, NormalizedPatient } from './types';

/**
 * Upsert a patient from intake form data.
 *
 * Uses deterministic HMAC hash-based dedup: matches on email + DOB within the
 * clinic. If a duplicate is found, the existing record is updated (merging tags,
 * notes, and non-placeholder fields). Otherwise a new patient is created.
 *
 * CRITICAL: Multi-tenant isolation is enforced by clinicId scope in the dedup service.
 */
export async function upsertPatientFromIntake(
  intake: NormalizedIntake,
  clinicId: number = 1,
): Promise<Patient> {
  const normalized = normalizePatient(intake.patient);
  const hashtags = collectHashtags(intake);

  const result = await patientDeduplicationService.resolvePatientForIntake(normalized, {
    clinicId,
    tags: hashtags,
    notes: `Created via Heyflow submission ${intake.submissionId}`,
    source: 'webhook',
    sourceMetadata: {
      type: 'heyflow',
      submissionId: intake.submissionId,
      timestamp: new Date().toISOString(),
    },
  });

  if (result.wasMerged) {
    logger.info('[HeyflowPatientService] Merged into existing patient', {
      patientId: result.patient.id,
      clinicId: result.patient.clinicId,
      submissionId: intake.submissionId,
    });
  } else {
    logger.info('[HeyflowPatientService] Created new patient', {
      patientId: result.patient.id,
      displayId: result.patient.patientId,
      clinicId,
      submissionId: intake.submissionId,
    });
  }

  return result.patient;
}

function normalizePatient(patient: NormalizedPatient) {
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

function sanitizePhone(value?: string) {
  if (!value) return '0000000000';
  const digits = value.replace(/\D/g, '');
  return digits || '0000000000';
}

function normalizeGender(value?: string) {
  if (!value) return 'm';
  const lower = value.toLowerCase().trim();
  if (lower === 'f' || lower === 'female' || lower === 'woman') return 'f';
  if (lower === 'm' || lower === 'male' || lower === 'man') return 'm';
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
    .map((chunk: string) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function collectHashtags(intake: NormalizedIntake) {
  const tags = new Set<string>(['medlink']);
  intake.answers.forEach((answer: { value: string }) => {
    const matches = answer.value.match(/#\w+/g);
    if (matches) {
      matches.forEach((tag: string) => tags.add(tag.replace(/^#/, '').toLowerCase()));
    }
  });
  return Array.from(tags);
}
