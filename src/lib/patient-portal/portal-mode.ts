/**
 * Portal Mode Detection
 *
 * Determines whether a patient sees the "lead" portal (conversion-focused)
 * or the "patient" portal (health-tracking) based on their profile status
 * and intake completion state.
 *
 * IMPORTANT: The intake/lead portal is gated behind this flag.
 * Set to `true` only when the intake flow is fully ready for production.
 */

import type { PortalMode } from './types';

const INTAKE_PORTAL_ENABLED = false;

type ProfileStatus = 'ACTIVE' | 'LEAD' | 'PENDING_COMPLETION' | 'MERGED' | 'ARCHIVED';

export function getPortalMode(
  profileStatus: ProfileStatus | string,
  hasCompletedIntake: boolean,
): PortalMode {
  if (!INTAKE_PORTAL_ENABLED) {
    return 'patient';
  }

  if (profileStatus === 'ACTIVE') {
    return 'patient';
  }

  if (profileStatus === 'LEAD' || profileStatus === 'PENDING_COMPLETION') {
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
