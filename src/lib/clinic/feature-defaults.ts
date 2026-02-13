/**
 * Clinic Feature Defaults — Single Source of Truth
 * =================================================
 *
 * Defines default values for clinic.features JSON.
 * Used by: patient page (Labs tab), ensure-clinic-feature-defaults script,
 * admin features API, super-admin sync action.
 *
 * Rule: New features default ON for uniformity unless explicitly disabled.
 * @see docs/ENTERPRISE_TENANT_UNIFORMITY_DIAGNOSIS.md
 */

export const DEFAULT_CLINIC_FEATURES: Record<string, boolean> = {
  BLOODWORK_LABS: true, // Labs tab on patient profile — must default ON
  // Add more as needed; only add keys that should default for new clinics
};

export const FEATURE_DEFAULTS_VERSION = 1;
