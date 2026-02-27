/**
 * DoseSpot Domain — Public Exports
 *
 * E-prescribing integration for prescriptions outside the Lifefile network.
 * All functionality is feature-flagged per clinic.
 *
 * @module domains/dosespot
 */

// Services
export { doseSpotPatientService } from './services/dosespot-patient.service';
export { doseSpotProviderService } from './services/dosespot-provider.service';
export { doseSpotSSOService } from './services/dosespot-sso.service';
export { doseSpotPrescriptionService } from './services/dosespot-prescription.service';

// Types
export type {
  PatientSyncResult,
  ProviderSyncResult,
  SSOUrlResult,
  DoseSpotWebhookPayload,
  DoseSpotGender,
  DoseSpotPhoneType,
} from './types';

export { DoseSpotError, mapGender, mapPhoneType } from './types';
