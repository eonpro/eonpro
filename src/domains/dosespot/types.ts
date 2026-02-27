/**
 * DoseSpot Domain Types
 *
 * Re-exports client-level DTOs and defines domain-specific types
 * for patient/provider sync and prescription management.
 *
 * @module domains/dosespot/types
 */

export type {
  DoseSpotCredentials,
  DoseSpotPatientPayload,
  DoseSpotProviderPayload,
  DoseSpotAllergy,
  DoseSpotPrescription,
  DoseSpotSelfReportedMedication,
  DoseSpotDiagnosisItem,
  DoseSpotPageResult,
  DoseSpotClient,
  ClinicianRoleType,
  PagedResult,
} from '@/lib/dosespot';

export { DoseSpotError } from '@/lib/dosespot';

// ---------------------------------------------------------------------------
// Domain-level types for sync operations
// ---------------------------------------------------------------------------

export interface PatientSyncResult {
  doseSpotPatientId: number;
  action: 'created' | 'updated' | 'already_synced';
  patientId: number;
  clinicId: number;
}

export interface ProviderSyncResult {
  doseSpotClinicianId: number;
  action: 'created' | 'updated' | 'already_synced';
  providerId: number;
  clinicId: number;
  roles: string[];
}

export interface SSOUrlResult {
  url: string;
  prescriberUserId: string;
  patientUserId?: string;
}

export type DoseSpotGender = 'Male' | 'Female' | 'Unknown';

export type DoseSpotPhoneType = 'Cell' | 'Home' | 'Work';

export interface DoseSpotWebhookPayload {
  [key: string]: unknown;
}

// Gender mapping from platform values to DoseSpot values
export function mapGender(platformGender: string): DoseSpotGender {
  const normalized = platformGender.toLowerCase().trim();
  if (normalized === 'male' || normalized === 'm') return 'Male';
  if (normalized === 'female' || normalized === 'f') return 'Female';
  return 'Unknown';
}

// Phone type defaults to Cell for the platform (most patients provide mobile)
export function mapPhoneType(_phone: string): DoseSpotPhoneType {
  return 'Cell';
}
