/**
 * API Fetch Utility with Session Expiration Handling
 *
 * This module provides a wrapper around fetch that:
 * 1. Automatically includes auth headers
 * 2. Handles 401/403 errors by triggering logout
 * 3. Broadcasts session expiration events for UI handling
 */

// Custom event for session expiration
export const SESSION_EXPIRED_EVENT = 'eonpro:session:expired';

/**
 * Dispatch session expired event for global handling
 */
export function dispatchSessionExpired(reason: string = 'session_expired') {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT, { detail: { reason } }));
  }
}

/**
 * Get the auth token from localStorage
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;

  // Check all possible token locations
  return (
    localStorage.getItem('auth-token') ||
    localStorage.getItem('access_token') ||
    localStorage.getItem('super_admin-token') ||
    localStorage.getItem('admin-token') ||
    localStorage.getItem('provider-token') ||
    null
  );
}

/**
 * Clear all auth tokens
 */
export function clearAuthTokens() {
  if (typeof window === 'undefined') return;

  // Clear localStorage
  const tokenKeys = [
    'auth-token',
    'access_token',
    'refresh_token',
    'super_admin-token',
    'admin-token',
    'provider-token',
    'influencer-token',
    'patient-token',
    'token_timestamp',
    'user',
  ];

  tokenKeys.forEach((key) => localStorage.removeItem(key));

  // Clear cookies
  const cookieNames = [
    'auth-token',
    'admin-token',
    'provider-token',
    'influencer-token',
    'patient-token',
  ];

  cookieNames.forEach((name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });
}

/**
 * Redirect to login page with reason
 */
export function redirectToLogin(reason: string = 'session_expired') {
  if (typeof window === 'undefined') return;

  const currentPath = window.location.pathname;
  const loginUrl = `/login?redirect=${encodeURIComponent(currentPath)}&reason=${reason}`;

  // Use replace to prevent back navigation to expired page
  window.location.replace(loginUrl);
}

/**
 * Handle API response errors
 */
async function handleResponseError(response: Response): Promise<Response> {
  if (response.status === 401 || response.status === 403) {
    // Check if this is an auth-related error
    const contentType = response.headers.get('content-type');
    let errorMessage = 'Session expired';

    try {
      if (contentType?.includes('application/json')) {
        const errorData = await response.clone().json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Clear tokens and dispatch event
    clearAuthTokens();
    dispatchSessionExpired(errorMessage);

    // Throw a specific error that can be caught by callers
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    (error as any).isAuthError = true;
    throw error;
  }

  return response;
}

/**
 * API Fetch wrapper with automatic auth and error handling
 *
 * @example
 * ```ts
 * // Simple GET request
 * const response = await apiFetch('/api/patients');
 * const data = await response.json();
 *
 * // POST request with body
 * const response = await apiFetch('/api/patients', {
 *   method: 'POST',
 *   body: JSON.stringify({ name: 'John' }),
 * });
 * ```
 */
export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Add auth header if token exists
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Include cookies
    });

    // Check for auth errors
    return await handleResponseError(response);
  } catch (error: any) {
    // Re-throw auth errors
    if (error.isAuthError) {
      throw error;
    }

    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      console.error('Network error:', error);
    }

    throw error;
  }
}

/**
 * Convenience method for GET requests
 */
export async function apiGet(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, { ...options, method: 'GET' });
}

/**
 * Convenience method for POST requests
 */
export async function apiPost(
  url: string,
  body?: any,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for PATCH requests
 */
export async function apiPatch(
  url: string,
  body?: any,
  options: RequestInit = {}
): Promise<Response> {
  return apiFetch(url, {
    ...options,
    method: 'PATCH',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Convenience method for DELETE requests
 */
export async function apiDelete(url: string, options: RequestInit = {}): Promise<Response> {
  return apiFetch(url, { ...options, method: 'DELETE' });
}

export default apiFetch;
