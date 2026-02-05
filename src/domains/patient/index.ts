/**
 * Patient Domain
 * ==============
 *
 * This module provides a clean API for patient-related operations.
 * It follows the repository/service pattern for separation of concerns.
 *
 * Architecture:
 * - Repository: Data access layer (Prisma)
 * - Service: Business logic layer (validation, authorization)
 * - Types: Domain entities and DTOs
 *
 * @module domains/patient
 * @version 1.0.0
 */

// ============================================================================
// Types - Domain entities and DTOs
// ============================================================================

export type {
  PatientEntity,
  PatientSummary,
  PatientSummaryWithClinic,
  CreatePatientInput,
  UpdatePatientInput,
  PatientFilterOptions,
  PatientPaginationOptions,
  PaginatedPatients,
  AuditContext,
} from './types';

// ============================================================================
// Repository - Data access layer
// ============================================================================

export {
  patientRepository,
  createPatientRepository,
  type PatientRepository,
} from './repositories';

// ============================================================================
// Service - Business logic layer
// ============================================================================

export {
  patientService,
  createPatientService,
  createPatientSchema,
  updatePatientSchema,
  type PatientService,
  type UserContext,
  type ListPatientsOptions,
} from './services/patient.service';

export {
  patientMergeService,
  createPatientMergeService,
  type PatientMergeService,
  type MergeOptions,
  type MergePreview,
  type MergeResult,
  type MergeConflict,
  type RelationCounts,
  type PatientMergeFields,
} from './services/patient-merge.service';

// ============================================================================
// PHI Search Service - For searching encrypted patient data
// ============================================================================

export {
  PHISearchService,
  PATIENT_PHI_FIELDS,
  PATIENT_SAFE_FIELDS,
  validateWhereClause,
  decryptPatientRecord,
  matchesSearch,
  createPHISearchMiddleware,
  type PatientPHIField,
  type PatientSafeField,
  type PHISearchOptions,
  type PHISearchResult,
} from '@/lib/security/phi-search';

// ============================================================================
// Re-export shared errors for convenience
// ============================================================================

export {
  NotFoundError,
  ValidationError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  Errors,
} from '@/domains/shared/errors';
