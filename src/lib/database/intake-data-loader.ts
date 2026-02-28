/**
 * INTAKE DATA LOADER
 * ==================
 *
 * Centralized loader for the deep patient intake data chain:
 *   Patient → IntakeSubmissions → Responses → Question
 *
 * This pattern (depth 3-4) appears in 3+ routes and is the deepest
 * include chain in the codebase. By centralizing it here:
 * 1. The include shape is defined once (no copy-paste divergence)
 * 2. Field selection is applied at each level (only needed fields)
 * 3. Results are bounded (take: 1 on submissions)
 * 4. Document blob loading is opt-in via `includeDocumentData`
 *
 * @module database/intake-data-loader
 */

import { prisma } from '@/lib/db';

// =============================================================================
// INCLUDE SHAPE (defined once, used by 3+ routes)
// =============================================================================

const INTAKE_SUBMISSIONS_INCLUDE = {
  include: {
    responses: {
      select: {
        id: true,
        value: true,
        questionId: true,
        question: {
          select: {
            id: true,
            label: true,
            type: true,
            sectionId: true,
          },
        },
      },
    },
    template: {
      select: {
        id: true,
        name: true,
      },
    },
  },
  orderBy: { createdAt: 'desc' as const },
  take: 1,
} as const;

const INTAKE_DOCUMENT_SELECT_NO_DATA = {
  id: true,
  patientId: true,
  category: true,
  filename: true,
  createdAt: true,
  s3DataKey: true,
} as const;

const INTAKE_DOCUMENT_SELECT_WITH_DATA = {
  ...INTAKE_DOCUMENT_SELECT_NO_DATA,
  data: true,
} as const;

// =============================================================================
// LOADER FUNCTIONS
// =============================================================================

export interface IntakeDataOptions {
  /** Load the binary `data` field from PatientDocument. Default: false. */
  includeDocumentData?: boolean;
  /** Sort order for submissions. Default: 'desc' (most recent first). */
  submissionOrder?: 'asc' | 'desc';
}

/**
 * Load a patient's intake form data (submissions + intake documents).
 * Returns the patient record with populated `intakeSubmissions` and `documents`.
 *
 * This encapsulates the depth-3 include chain that was previously duplicated
 * across vitals, weight tracking, and prescription queue routes.
 */
export async function loadPatientIntakeData(
  patientId: number,
  options: IntakeDataOptions = {}
) {
  const {
    includeDocumentData = false,
    submissionOrder = 'desc',
  } = options;

  return prisma.patient.findUnique({
    where: { id: patientId },
    include: {
      documents: {
        where: { category: 'MEDICAL_INTAKE_FORM' },
        orderBy: { createdAt: submissionOrder },
        take: 1,
        select: includeDocumentData
          ? INTAKE_DOCUMENT_SELECT_WITH_DATA
          : INTAKE_DOCUMENT_SELECT_NO_DATA,
      },
      intakeSubmissions: {
        ...INTAKE_SUBMISSIONS_INCLUDE,
        orderBy: { createdAt: submissionOrder },
      },
    },
  });
}

export type PatientWithIntakeData = NonNullable<
  Awaited<ReturnType<typeof loadPatientIntakeData>>
>;
