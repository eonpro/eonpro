/**
 * Patient portal module registry and enabled-helpers — unit tests.
 * Ensures parity with current layout nav logic and no regressions.
 */

import { describe, it, expect } from 'vitest';
import {
  NAV_MODULES,
  PROGRESS_TRACKING_MODULES,
  getEnabledNavModuleIds,
  getEnabledProgressTabIds,
  isNavModuleEnabled,
  isProgressTabEnabled,
  getNavModuleIdForPath,
  isPortalPath,
  TREATMENT_PRESETS,
  applyPresetToFeatures,
} from '@/lib/patient-portal';
import type { PortalFeatures } from '@/lib/patient-portal';

/** Default features (all flags true where layout expects show) — matches defaultBranding.features */
const defaultFeatures: PortalFeatures = {
  showBMICalculator: true,
  showCalorieCalculator: true,
  showDoseCalculator: true,
  showShipmentTracking: true,
  showMedicationReminders: true,
  showWeightTracking: true,
  showResources: true,
  showBilling: true,
  showProgressPhotos: false,
  showLabResults: false,
  showDietaryPlans: true,
  showExerciseTracking: true,
  showWaterTracking: true,
  showSleepTracking: true,
  showSymptomChecker: true,
  showHealthScore: true,
  showAchievements: true,
  showCommunityChat: false,
  showAppointments: true,
  showTelehealth: false,
  showChat: true,
  showCarePlan: true,
  showCareTeam: true,
};

describe('Patient portal registry', () => {
  it('NAV_MODULES has expected length and ids', () => {
    expect(NAV_MODULES.length).toBe(16);
    const ids = NAV_MODULES.map((m) => m.id);
    expect(ids).toContain('home');
    expect(ids).toContain('appointments');
    expect(ids).toContain('care-team');
    expect(ids).toContain('health-score');
    expect(ids).toContain('documents');
    expect(ids).toContain('progress');
    expect(ids).toContain('settings');
    expect(ids).toContain('medications');
    expect(ids).toContain('shipments');
    expect(ids).toContain('billing');
  });

  it('PROGRESS_TRACKING_MODULES has five tabs', () => {
    expect(PROGRESS_TRACKING_MODULES.length).toBe(5);
    const tabIds = PROGRESS_TRACKING_MODULES.map((m) => m.tabId);
    expect(tabIds).toEqual(['weight', 'water', 'exercise', 'sleep', 'nutrition']);
  });
});

describe('getEnabledNavModuleIds', () => {
  it('with default features returns 15 nav modules (documents excluded when showLabResults false)', () => {
    const ids = getEnabledNavModuleIds(defaultFeatures);
    expect(ids.length).toBe(15);
    expect(ids).toContain('home');
    expect(ids).toContain('settings');
    expect(ids).toContain('progress');
    expect(ids).toContain('appointments');
    expect(ids).toContain('care-team');
    expect(ids).toContain('health-score');
    expect(ids).not.toContain('documents');
  });

  it('with empty features uses defaultOn for flags', () => {
    const ids = getEnabledNavModuleIds({});
    // All current modules have defaultOn: true; so we still get 16
    expect(ids.length).toBe(16);
  });

  it('with showWeightTracking false hides progress only', () => {
    const ids = getEnabledNavModuleIds({ ...defaultFeatures, showWeightTracking: false });
    expect(ids).not.toContain('progress');
    expect(ids).toContain('home');
    expect(ids).toContain('appointments');
    expect(ids.length).toBe(14);
  });

  it('with showAppointments false hides appointments only', () => {
    const ids = getEnabledNavModuleIds({ ...defaultFeatures, showAppointments: false });
    expect(ids).not.toContain('appointments');
    expect(ids.length).toBe(14);
  });

  it('items with featureFlagKey null are always included', () => {
    const allOff = {
      showWeightTracking: false,
      showAppointments: false,
      showCarePlan: false,
      showAchievements: false,
      showShipmentTracking: false,
      showSymptomChecker: false,
      showResources: false,
      showBilling: false,
    };
    const ids = getEnabledNavModuleIds(allOff);
    expect(ids).toContain('home');
    expect(ids).toContain('photos');
    expect(ids).toContain('medications');
    expect(ids).toContain('calculators');
    expect(ids).toContain('settings');
  });
});

describe('getEnabledProgressTabIds', () => {
  it('with default features returns all five tabs', () => {
    const tabIds = getEnabledProgressTabIds(defaultFeatures);
    expect(tabIds).toEqual(['weight', 'water', 'exercise', 'sleep', 'nutrition']);
  });

  it('with showWaterTracking false hides water tab only', () => {
    const tabIds = getEnabledProgressTabIds({ ...defaultFeatures, showWaterTracking: false });
    expect(tabIds).not.toContain('water');
    expect(tabIds).toContain('weight');
    expect(tabIds.length).toBe(4);
  });

  it('with showDietaryPlans false hides nutrition tab only', () => {
    const tabIds = getEnabledProgressTabIds({ ...defaultFeatures, showDietaryPlans: false });
    expect(tabIds).not.toContain('nutrition');
    expect(tabIds.length).toBe(4);
  });
});

describe('isNavModuleEnabled / isProgressTabEnabled', () => {
  it('isNavModuleEnabled matches getEnabledNavModuleIds', () => {
    const features: PortalFeatures = { ...defaultFeatures, showShipmentTracking: false };
    const ids = getEnabledNavModuleIds(features);
    expect(isNavModuleEnabled('home', features)).toBe(true);
    expect(isNavModuleEnabled('shipments', features)).toBe(false);
    NAV_MODULES.forEach((m) => {
      expect(isNavModuleEnabled(m.id, features)).toBe(ids.includes(m.id));
    });
  });

  it('isProgressTabEnabled matches getEnabledProgressTabIds', () => {
    const features: PortalFeatures = { ...defaultFeatures, showSleepTracking: false };
    const tabIds = getEnabledProgressTabIds(features);
    expect(isProgressTabEnabled('weight', features)).toBe(true);
    expect(isProgressTabEnabled('sleep', features)).toBe(false);
    PROGRESS_TRACKING_MODULES.forEach((m) => {
      expect(isProgressTabEnabled(m.tabId, features)).toBe(tabIds.includes(m.tabId));
    });
  });
});

describe('Route guard (getNavModuleIdForPath, isPortalPath)', () => {
  const base = '/portal';

  it('isPortalPath identifies portal paths', () => {
    expect(isPortalPath('/portal', base)).toBe(true);
    expect(isPortalPath('/portal/', base)).toBe(true);
    expect(isPortalPath('/portal/appointments', base)).toBe(true);
    expect(isPortalPath('/portal/calculators/bmi', base)).toBe(true);
    expect(isPortalPath('/login', base)).toBe(false);
    expect(isPortalPath('/portal-other', base)).toBe(false);
  });

  it('getNavModuleIdForPath resolves home and top-level routes', () => {
    expect(getNavModuleIdForPath('/portal', base)).toBe('home');
    expect(getNavModuleIdForPath('/portal/', base)).toBe('home');
    expect(getNavModuleIdForPath('/portal/appointments', base)).toBe('appointments');
    expect(getNavModuleIdForPath('/portal/care-team', base)).toBe('care-team');
    expect(getNavModuleIdForPath('/portal/health-score', base)).toBe('health-score');
    expect(getNavModuleIdForPath('/portal/documents', base)).toBe('documents');
    expect(getNavModuleIdForPath('/portal/progress', base)).toBe('progress');
    expect(getNavModuleIdForPath('/portal/settings', base)).toBe('settings');
    expect(getNavModuleIdForPath('/portal/subscription', base)).toBe('billing');
  });

  it('getNavModuleIdForPath resolves sub-routes to parent module', () => {
    expect(getNavModuleIdForPath('/portal/calculators/bmi', base)).toBe('calculators');
    expect(getNavModuleIdForPath('/portal/calculators/calories', base)).toBe('calculators');
    expect(getNavModuleIdForPath('/portal/photos/progress', base)).toBe('photos');
  });

  it('getNavModuleIdForPath returns null for non-portal path', () => {
    expect(getNavModuleIdForPath('/login', base)).toBe(null);
  });
});

describe('Treatment presets', () => {
  it('applyPresetToFeatures merges preset into current without removing unset keys', () => {
    const current: PortalFeatures = { showWeightTracking: true, showBilling: false };
    const preset = TREATMENT_PRESETS.weight_loss;
    const merged = applyPresetToFeatures(current as Record<string, boolean>, preset);
    expect(merged.showWeightTracking).toBe(true);
    expect(merged.showBilling).toBe(true);
    expect(Object.keys(merged).length).toBeGreaterThan(2);
  });

  it('getEnabledNavModuleIds with primaryTreatment includes achievements for weight_loss (treatmentTypes)', () => {
    const ids = getEnabledNavModuleIds(defaultFeatures, 'weight_loss');
    expect(ids.length).toBe(15);
    expect(ids).toContain('achievements');
  });

  it('getEnabledNavModuleIds with primaryTreatment sexual_health excludes achievements (treatmentTypes filter)', () => {
    const ids = getEnabledNavModuleIds(defaultFeatures, 'sexual_health');
    expect(ids).not.toContain('achievements');
    expect(ids.length).toBe(14);
  });
});
