/**
 * Patient Portal API Client
 *
 * Centralized fetch for patient-portal API calls. Always attaches auth headers
 * and credentials so requests are authenticated. Use this for all patient-portal
 * → API requests to avoid 401s from missing auth.
 */

import { getAuthHeaders } from '@/lib/utils/auth-token';

/** User-facing message when session is expired (401). Use for setError() so patients know to log in again. */
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';

/**
 * Returns a user-facing error message for portal API responses, or null if none.
 * Use after portalFetch(): if (getPortalResponseError(res)) { setError(getPortalResponseError(res)); return; }
 */
export function getPortalResponseError(response: Response): string | null {
  if (response.status === 401) return SESSION_EXPIRED_MESSAGE;
  if (response.status === 403) return 'Access denied. Please contact your care team.';
  return null;
}

/**
 * Fetch from the API with patient-portal auth (Bearer token + credentials).
 * Use instead of raw fetch() in patient-portal pages and components.
 */
export async function portalFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const headers = new Headers(init?.headers);
  const auth = getAuthHeaders();
  if (auth && typeof auth === 'object' && !Array.isArray(auth)) {
    for (const [k, v] of Object.entries(auth)) {
      if (v) headers.set(k, String(v));
    }
  }
  return fetch(path, {
    ...init,
    headers,
    credentials: 'include',
    // Ensure refetches (e.g. after logging weight/water) get fresh data on the portal
    cache: init?.cache ?? 'no-store',
  });
}
