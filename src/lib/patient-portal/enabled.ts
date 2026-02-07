/**
 * Patient portal — compute which modules are enabled for a given clinic's features (and optional treatment).
 * Pure functions, no side effects. Used by layout and progress page.
 */

import type { PortalFeatures, PortalTreatmentType } from './types';
import { NAV_MODULES, PROGRESS_TRACKING_MODULES } from './registry';
import type { NavModuleId, ProgressTabId } from './registry';

function matchesTreatment(
  moduleTreatmentTypes: PortalTreatmentType[] | undefined,
  primaryTreatment: PortalTreatmentType | undefined
): boolean {
  if (!primaryTreatment) return true;
  if (!moduleTreatmentTypes?.length) return true;
  return moduleTreatmentTypes.includes(primaryTreatment);
}

/**
 * Returns nav module ids that should be shown.
 * Logic: feature on (or defaultOn) AND (no treatment filter or primaryTreatment in module.treatmentTypes).
 */
export function getEnabledNavModuleIds(
  features: PortalFeatures,
  primaryTreatment?: PortalTreatmentType
): NavModuleId[] {
  return NAV_MODULES.filter((m) => {
    if (!matchesTreatment(m.treatmentTypes, primaryTreatment)) return false;
    if (m.featureFlagKey === null) return true;
    const value = features[m.featureFlagKey];
    return value === true || (value === undefined && m.defaultOn);
  }).map((m) => m.id);
}

/**
 * Returns progress tab ids that should be shown (weight, water, exercise, sleep, nutrition).
 */
export function getEnabledProgressTabIds(
  features: PortalFeatures,
  primaryTreatment?: PortalTreatmentType
): ProgressTabId[] {
  return PROGRESS_TRACKING_MODULES.filter((m) => {
    if (!matchesTreatment(m.treatmentTypes, primaryTreatment)) return false;
    if (m.featureFlagKey === null) return true;
    const value = features[m.featureFlagKey];
    return value === true || (value === undefined && m.defaultOn);
  }).map((m) => m.tabId);
}

/**
 * Check if a specific nav module is enabled (e.g. for route guard or conditional render).
 */
export function isNavModuleEnabled(
  moduleId: NavModuleId,
  features: PortalFeatures,
  primaryTreatment?: PortalTreatmentType
): boolean {
  return getEnabledNavModuleIds(features, primaryTreatment).includes(moduleId);
}

/**
 * Check if a specific progress tab is enabled.
 */
export function isProgressTabEnabled(
  tabId: ProgressTabId,
  features: PortalFeatures,
  primaryTreatment?: PortalTreatmentType
): boolean {
  return getEnabledProgressTabIds(features, primaryTreatment).includes(tabId);
}
