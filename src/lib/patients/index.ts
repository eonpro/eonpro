/**
 * Patient Utilities
 * =================
 *
 * Utility functions for patient management
 *
 * @module lib/patients
 */

export {
  isConvertedPatient,
  getPatientStatus,
  getConvertedPatientIds,
  getConversionStatusBatch,
  countPatientsByStatus,
  type PatientStatusType,
  type PatientStatusResult
} from './patientStatus';

export {
  generatePatientId,
  previewNextPatientId,
  isValidPatientIdFormat,
  parsePatientId,
  type GeneratePatientIdOptions,
  type GeneratePatientIdResult
} from './patientIdGenerator';
