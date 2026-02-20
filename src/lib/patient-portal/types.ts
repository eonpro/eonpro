/**
 * Patient portal modular feature system — types.
 * Single source of truth for portal modules (tabs/widgets) and feature flags.
 * Used by layout, progress page, and admin portal-settings. No DB changes.
 */

/** Treatment types supported by clinics (must stay in sync with ClinicBrandingContext) */
export type PortalTreatmentType =
  | 'weight_loss'
  | 'hormone_therapy'
  | 'mens_health'
  | 'womens_health'
  | 'sexual_health'
  | 'anti_aging'
  | 'general_wellness'
  | 'custom';

/** Feature flag keys returned by branding API and used for module visibility */
export type PortalFeatureFlagKey =
  | 'showBMICalculator'
  | 'showCalorieCalculator'
  | 'showDoseCalculator'
  | 'showShipmentTracking'
  | 'showMedicationReminders'
  | 'showWeightTracking'
  | 'showResources'
  | 'showBilling'
  | 'showProgressPhotos'
  | 'showLabResults'
  | 'showDocuments'
  | 'showDietaryPlans'
  | 'showExerciseTracking'
  | 'showWaterTracking'
  | 'showSleepTracking'
  | 'showSymptomChecker'
  | 'showHealthScore'
  | 'showAchievements'
  | 'showCommunityChat'
  | 'showAppointments'
  | 'showTelehealth'
  | 'showChat'
  | 'showCarePlan'
  | 'showCareTeam'
  | 'showDevices';

/** Feature flags shape from branding API (Clinic.settings.patientPortal) */
export type PortalFeatures = Partial<Record<PortalFeatureFlagKey, boolean>>;

/**
 * Portal mode — determines which portal experience the patient sees.
 * 'lead' = conversion-focused (intake CTA, treatments, specials)
 * 'patient' = health-tracking (prescriptions, billing, progress)
 */
export type PortalMode = 'lead' | 'patient';

/** Where the module appears in nav: main sidebar, mobile only, or both */
export type NavSlot = 'main' | 'mobile' | 'both';

/** One portal module (tab or top-level feature) — code-only registry entry */
export interface PortalNavModule {
  id: string;
  /** Path suffix; consumer prepends PATIENT_PORTAL_PATH (e.g. '' for home, '/appointments') */
  pathSuffix: string;
  labelKey: string;
  /** null = always show (e.g. Home, Settings) */
  featureFlagKey: PortalFeatureFlagKey | null;
  navSlot: NavSlot;
  /** Exact path match for active state (e.g. home) */
  exact?: boolean;
  /** Optional: show only for these treatment types; empty = all treatments */
  treatmentTypes?: PortalTreatmentType[];
  /** Default when clinic has not set the flag (for new modules, use false) */
  defaultOn: boolean;
}

/** One progress sub-tab (weight, water, exercise, sleep, nutrition) — gated by feature */
export interface ProgressTrackingModule {
  id: string;
  /** Tab id used in progress page state */
  tabId: 'weight' | 'water' | 'exercise' | 'sleep' | 'nutrition';
  labelKey: string;
  featureFlagKey: PortalFeatureFlagKey | null;
  /** Optional: only show for these treatment types; empty = all */
  treatmentTypes?: PortalTreatmentType[];
  defaultOn: boolean;
}
