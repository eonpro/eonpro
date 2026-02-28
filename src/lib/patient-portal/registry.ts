/**
 * Patient portal module registry — single source of truth for nav and progress tabs.
 * Add new modules here with defaultOn: false to ship without affecting existing clinics.
 * Layout and progress page consume this; admin UI uses it to show all toggles.
 */

import type { PortalNavModule, ProgressTrackingModule, PortalTreatmentType } from './types';

/** Treatment types that show achievements (streaks, milestones); empty = all treatments */
const ACHIEVEMENTS_TREATMENTS: PortalTreatmentType[] = [
  'weight_loss',
  'general_wellness',
  'mens_health',
  'womens_health',
  'anti_aging',
];

/** Base path is applied by consumer (PATIENT_PORTAL_PATH from config) */
export const NAV_MODULES: readonly PortalNavModule[] = [
  {
    id: 'home',
    pathSuffix: '',
    labelKey: 'navHome',
    featureFlagKey: null,
    navSlot: 'both',
    exact: true,
    defaultOn: true,
  },
  // TODO: Re-enable provider appointments when scheduling integration is ready
  // {
  //   id: 'appointments',
  //   pathSuffix: '/appointments',
  //   labelKey: 'navAppointments',
  //   featureFlagKey: 'showAppointments',
  //   navSlot: 'both',
  //   defaultOn: true,
  // },
  // Disabled until care plan content is ready
  // {
  //   id: 'care-plan',
  //   pathSuffix: '/care-plan',
  //   labelKey: 'navCarePlan',
  //   featureFlagKey: 'showCarePlan',
  //   navSlot: 'main',
  //   defaultOn: true,
  // },
  {
    id: 'care-team',
    pathSuffix: '/care-team',
    labelKey: 'navCareTeam',
    featureFlagKey: 'showCareTeam',
    navSlot: 'main',
    defaultOn: true,
  },
  // Disabled until health score feature is ready
  // {
  //   id: 'health-score',
  //   pathSuffix: '/health-score',
  //   labelKey: 'navHealthScore',
  //   featureFlagKey: 'showHealthScore',
  //   navSlot: 'main',
  //   defaultOn: true,
  // },
  {
    id: 'progress',
    pathSuffix: '/progress',
    labelKey: 'navProgress',
    featureFlagKey: 'showWeightTracking',
    navSlot: 'both',
    defaultOn: true,
  },
  {
    id: 'photos',
    pathSuffix: '/photos',
    labelKey: 'navPhotos',
    featureFlagKey: null,
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'achievements',
    pathSuffix: '/achievements',
    labelKey: 'navAchievements',
    featureFlagKey: 'showAchievements',
    navSlot: 'main',
    defaultOn: false,
    treatmentTypes: ACHIEVEMENTS_TREATMENTS,
  },
  {
    id: 'medications',
    pathSuffix: '/medications',
    labelKey: 'navMedications',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
  {
    id: 'shipments',
    pathSuffix: '/shipments',
    labelKey: 'navShipments',
    featureFlagKey: 'showShipmentTracking',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'symptom-checker',
    pathSuffix: '/symptom-checker',
    labelKey: 'navSymptomChecker',
    featureFlagKey: 'showSymptomChecker',
    navSlot: 'main',
    defaultOn: false,
  },
  {
    id: 'calculators',
    pathSuffix: '/calculators',
    labelKey: 'navTools',
    featureFlagKey: null,
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'resources',
    pathSuffix: '/resources',
    labelKey: 'navResources',
    featureFlagKey: 'showResources',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'documents',
    pathSuffix: '/documents',
    labelKey: 'navDocuments',
    featureFlagKey: 'showDocuments',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'bloodwork',
    pathSuffix: '/bloodwork',
    labelKey: 'navBloodwork',
    featureFlagKey: 'showLabResults',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'billing',
    pathSuffix: '/subscription',
    labelKey: 'navBilling',
    featureFlagKey: 'showBilling',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'devices',
    pathSuffix: '/devices',
    labelKey: 'navDevices',
    featureFlagKey: 'showDevices',
    navSlot: 'main',
    defaultOn: false,
  },
  {
    id: 'support',
    pathSuffix: '/support',
    labelKey: 'navSupport',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
  {
    id: 'settings',
    pathSuffix: '/settings',
    labelKey: 'navSettings',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
] as const;

/** Mobile nav uses shorter label keys for some items; registry uses main labelKey; layout maps id -> mobile labelKey where different */
export const MOBILE_LABEL_OVERRIDE: Record<string, string> = {
  medications: 'navMeds',
  settings: 'navProfile',
};

/** Progress page sub-tabs — visibility gated by feature flags and (future) treatment type */
export const PROGRESS_TRACKING_MODULES: readonly ProgressTrackingModule[] = [
  {
    id: 'progress-weight',
    tabId: 'weight',
    labelKey: 'progressWeight',
    featureFlagKey: 'showWeightTracking',
    defaultOn: true,
  },
  {
    id: 'progress-water',
    tabId: 'water',
    labelKey: 'progressWater',
    featureFlagKey: 'showWaterTracking',
    defaultOn: true,
  },
  {
    id: 'progress-exercise',
    tabId: 'exercise',
    labelKey: 'progressExercise',
    featureFlagKey: 'showExerciseTracking',
    defaultOn: true,
  },
  {
    id: 'progress-sleep',
    tabId: 'sleep',
    labelKey: 'progressSleep',
    featureFlagKey: 'showSleepTracking',
    defaultOn: true,
  },
  {
    id: 'progress-nutrition',
    tabId: 'nutrition',
    labelKey: 'progressNutrition',
    featureFlagKey: 'showDietaryPlans',
    defaultOn: false,
  },
] as const;

/**
 * Lead portal nav modules — conversion-focused experience for patients who
 * have created an account but have not yet completed their intake form.
 */
export const LEAD_NAV_MODULES: readonly PortalNavModule[] = [
  {
    id: 'lead-home',
    pathSuffix: '',
    labelKey: 'navHome',
    featureFlagKey: null,
    navSlot: 'both',
    exact: true,
    defaultOn: true,
  },
  {
    id: 'lead-intake',
    pathSuffix: '/intake',
    labelKey: 'navIntake',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
  {
    id: 'lead-treatments',
    pathSuffix: '/treatments',
    labelKey: 'navTreatments',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
  {
    id: 'lead-specials',
    pathSuffix: '/specials',
    labelKey: 'navSpecials',
    featureFlagKey: null,
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'lead-resources',
    pathSuffix: '/resources',
    labelKey: 'navResources',
    featureFlagKey: 'showResources',
    navSlot: 'main',
    defaultOn: true,
  },
  {
    id: 'lead-settings',
    pathSuffix: '/settings',
    labelKey: 'navSettings',
    featureFlagKey: null,
    navSlot: 'both',
    defaultOn: true,
  },
] as const;

export const LEAD_MOBILE_LABEL_OVERRIDE: Record<string, string> = {
  'lead-treatments': 'navTx',
  'lead-settings': 'navProfile',
};

export type NavModuleId = (typeof NAV_MODULES)[number]['id'];
export type LeadNavModuleId = (typeof LEAD_NAV_MODULES)[number]['id'];
export type ProgressTabId = (typeof PROGRESS_TRACKING_MODULES)[number]['tabId'];
