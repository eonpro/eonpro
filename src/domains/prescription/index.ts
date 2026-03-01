/**
 * Prescription Domain
 * ===================
 *
 * Public API for prescription operations.
 *
 * @module domains/prescription
 */

export { prescriptionService, createPrescriptionService, PrescriptionError } from './services/prescription.service';
export type { PrescriptionService } from './services/prescription.service';
export {
  checkRecentPrescriptions,
  batchCheckRecentPrescriptions,
} from './services/duplicate-rx-check';
export type {
  RecentPrescription,
  DuplicateRxCheckResult,
} from './services/duplicate-rx-check';
export type {
  CreatePrescriptionInput,
  PrescriptionResult,
  PrescriptionRx,
  PrescriptionPatientInput,
  UserContext,
} from './types';
