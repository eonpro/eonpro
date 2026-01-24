/**
 * Clinic Repositories
 * @module domains/clinic/repositories
 */

export {
  clinicRepository,
  ClinicRepositoryImpl,
  // Select patterns for direct use
  CLINIC_BASIC_SELECT,
  CLINIC_BRANDING_SELECT,
  CLINIC_CONTACT_SELECT,
  CLINIC_BILLING_SELECT,
  CLINIC_SETTINGS_SELECT,
  CLINIC_LIFEFILE_SELECT,
  CLINIC_FULL_SELECT,
  CLINIC_WITH_COUNTS_SELECT,
  // Types
  type ClinicBasic,
  type ClinicBranding,
  type ClinicFull,
  type ClinicWithCounts,
  type IClinicRepository,
} from './clinic.repository';
