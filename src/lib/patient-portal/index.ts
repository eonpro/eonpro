/**
 * Patient portal modular feature system.
 * Single source of truth for tabs/widgets; clinic and treatment-based visibility.
 * No database changes; all config from Clinic.settings.patientPortal.
 */

export * from './types';
export {
  NAV_MODULES,
  PROGRESS_TRACKING_MODULES,
  MOBILE_LABEL_OVERRIDE,
  type NavModuleId,
  type ProgressTabId,
} from './registry';
export {
  getEnabledNavModuleIds,
  getEnabledProgressTabIds,
  isNavModuleEnabled,
  isProgressTabEnabled,
} from './enabled';
export { getNavModuleIdForPath, isPortalPath } from './route-guard';
export {
  TREATMENT_PRESETS,
  TREATMENT_PRESET_LABELS,
  applyPresetToFeatures,
  type PortalFeaturePreset,
} from './presets';
