/**
 * Patient Services Module
 * =======================
 *
 * @module domains/patient/services
 */

export {
  type PatientService,
  type UserContext,
  type ListPatientsOptions,
  createPatientService,
  patientService,
  createPatientSchema,
  updatePatientSchema,
} from './patient.service';

export {
  type PatientMergeService,
  type MergeOptions,
  type MergePreview,
  type MergeResult,
  type MergeConflict,
  type RelationCounts,
  type PatientMergeFields,
  createPatientMergeService,
  patientMergeService,
} from './patient-merge.service';
