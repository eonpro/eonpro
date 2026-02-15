/**
 * Patient portal: minimal user payload for localStorage to reduce PHI at rest.
 * Store only session identifiers (id, role, patientId); resolve display name from API when needed.
 */

export interface MinimalPortalUser {
  id?: number;
  role?: string;
  patientId?: number;
}

/**
 * Returns a minimal user object safe to store in localStorage (no PHI).
 * Use when updating portal user in storage (e.g. after /api/auth/me).
 */
export function getMinimalPortalUserPayload(
  from: { id?: number; role?: string; patientId?: number } | null
): MinimalPortalUser | null {
  if (!from) return null;
  return {
    id: from.id,
    role: from.role,
    patientId: from.patientId,
  };
}

const USER_KEY = 'user';

/**
 * Writes minimal portal user to localStorage. Call this instead of
 * localStorage.setItem('user', JSON.stringify(fullUser)) in portal code.
 */
export function setPortalUserStorage(payload: MinimalPortalUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (payload === null) {
      window.localStorage.removeItem(USER_KEY);
      return;
    }
    window.localStorage.setItem(USER_KEY, JSON.stringify(payload));
  } catch {
    // localStorage unavailable (private browsing, quota exceeded)
  }
}
