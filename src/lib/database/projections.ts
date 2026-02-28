/**
 * SHARED PROJECTION REGISTRY
 * ==========================
 *
 * Centralized select shapes for cross-domain reference fields.
 * Use these in `include` clauses when you need a related model's
 * basic info (e.g., `patient: { select: PATIENT_REF_SELECT }`).
 *
 * Domain-specific full select shapes live in their respective repositories:
 * - Clinic: src/domains/clinic/repositories/clinic.repository.ts
 * - Patient: src/domains/patient/repositories/patient.repository.ts
 * - Provider: src/domains/provider/repositories/provider.repository.ts
 *
 * These REF shapes are for lightweight cross-domain includes only.
 *
 * @module database/projections
 */

import { Prisma } from '@prisma/client';

// =============================================================================
// CLINIC REFERENCE (used in 20+ routes)
// =============================================================================

/**
 * Minimal clinic reference for includes in non-clinic queries.
 * Use: `include: { clinic: { select: CLINIC_REF_SELECT } }`
 */
export const CLINIC_REF_SELECT = {
  id: true,
  name: true,
  subdomain: true,
} satisfies Prisma.ClinicSelect;

export type ClinicRef = Prisma.ClinicGetPayload<{ select: typeof CLINIC_REF_SELECT }>;

// =============================================================================
// PATIENT REFERENCE (used in 10+ routes)
// =============================================================================

/**
 * Minimal patient reference for includes in non-patient queries.
 * Note: firstName/lastName are PHI-encrypted at rest. The caller is
 * responsible for decryption if needed (or use PatientRepository).
 */
export const PATIENT_REF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} satisfies Prisma.PatientSelect;

export type PatientRef = Prisma.PatientGetPayload<{ select: typeof PATIENT_REF_SELECT }>;

/**
 * Extended patient reference when clinicId is needed for tenant checks.
 */
export const PATIENT_REF_WITH_CLINIC_SELECT = {
  ...PATIENT_REF_SELECT,
  clinicId: true,
  patientId: true,
} satisfies Prisma.PatientSelect;

export type PatientRefWithClinic = Prisma.PatientGetPayload<{
  select: typeof PATIENT_REF_WITH_CLINIC_SELECT;
}>;

// =============================================================================
// USER REFERENCE (used in 10+ routes)
// =============================================================================

/**
 * Minimal user reference for includes in non-user queries
 * (e.g., ticket assignments, audit logs, team members).
 */
export const USER_REF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

export type UserRef = Prisma.UserGetPayload<{ select: typeof USER_REF_SELECT }>;

/**
 * Compact user reference without email (for UI displays like "assigned to").
 */
export const USER_NAME_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} satisfies Prisma.UserSelect;

export type UserName = Prisma.UserGetPayload<{ select: typeof USER_NAME_SELECT }>;

// =============================================================================
// PROVIDER REFERENCE
// =============================================================================

/**
 * Minimal provider reference for includes in order/prescription queries.
 */
export const PROVIDER_REF_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  npi: true,
} satisfies Prisma.ProviderSelect;

export type ProviderRef = Prisma.ProviderGetPayload<{ select: typeof PROVIDER_REF_SELECT }>;
