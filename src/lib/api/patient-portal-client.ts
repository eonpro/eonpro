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
  if (response.status === 403) return SESSION_EXPIRED_MESSAGE;
  return null;
}

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Fetch from the API with patient-portal auth (Bearer token + credentials).
 * Uses a default 30s timeout and supports AbortSignal for cancellation (e.g. in useEffect cleanup).
 * Use instead of raw fetch() in patient-portal pages and components.
 *
 * Cache: Defaults to `no-store` so refetches after mutations (e.g. progress widgets) return fresh
 * data. Callers can override via init.cache if needed.
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  const userSignal = init?.signal;
  let removeUserAbort: (() => void) | undefined;
  if (userSignal) {
    const onAbort = () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
    userSignal.addEventListener('abort', onAbort);
    removeUserAbort = () => userSignal.removeEventListener('abort', onAbort);
  }

  try {
    return await fetch(path, {
      ...init,
      headers,
      signal: controller.signal,
      credentials: 'include',
      cache: init?.cache ?? 'no-store',
    });
  } finally {
    clearTimeout(timeoutId);
    removeUserAbort?.();
  }
}
