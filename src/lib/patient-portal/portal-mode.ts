/**
 * Portal Mode Detection
 *
 * Determines whether a patient sees the "lead" portal (conversion-focused)
 * or the "patient" portal (health-tracking) based on their profile status
 * and intake completion state.
 */

import type { PortalMode } from './types';

type ProfileStatus = 'ACTIVE' | 'LEAD' | 'PENDING_COMPLETION' | 'MERGED' | 'ARCHIVED';

export function getPortalMode(
  profileStatus: ProfileStatus | string,
  hasCompletedIntake: boolean,
): PortalMode {
  if (profileStatus === 'ACTIVE' && hasCompletedIntake) {
    return 'patient';
  }

  if (profileStatus === 'LEAD' || profileStatus === 'PENDING_COMPLETION') {
    return 'lead';
  }

  if (profileStatus === 'ACTIVE' && !hasCompletedIntake) {
    return 'lead';
  }

  return 'patient';
}

export function isLeadMode(portalMode: PortalMode): boolean {
  return portalMode === 'lead';
}

export function isPatientMode(portalMode: PortalMode): boolean {
  return portalMode === 'patient';
}
