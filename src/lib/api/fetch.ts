/**
 * API Fetch Utility with Session Expiration Handling and Automatic Token Refresh
 *
 * This module provides a wrapper around fetch that:
 * 1. Automatically includes auth headers
 * 2. Handles 401/403 errors by triggering logout
 * 3. Broadcasts session expiration events for UI handling
 * 4. Automatically refreshes tokens before expiry
 */

// Custom event for session expiration
export const SESSION_EXPIRED_EVENT = 'eonpro:session:expired';

// Token refresh state
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

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
 * Get the refresh token from localStorage
 */
function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('refresh-token') || localStorage.getItem('refresh_token');
}

/**
 * Parse JWT token to get expiration time
 */
function parseTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
  } catch {
    return null;
  }
}

/**
 * Check if token is about to expire
 */
function isTokenExpiringSoon(token: string): boolean {
  const expiry = parseTokenExpiry(token);
  if (!expiry) return false;
  return Date.now() > expiry - TOKEN_REFRESH_BUFFER_MS;
}

/**
 * Refresh the auth token
 */
async function refreshAuthToken(): Promise<boolean> {
  // If already refreshing, wait for that to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return false;
  }

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${refreshToken}`,
        },
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();

      // Store new tokens
      if (data.token) {
        localStorage.setItem('auth-token', data.token);
        // Set cookie for server-side auth
        document.cookie = `auth-token=${data.token}; path=/; secure; samesite=strict`;
      }
      if (data.refreshToken) {
        localStorage.setItem('refresh-token', data.refreshToken);
      }
      if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
      }

      console.debug('[Auth] Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Auth] Token refresh failed:', error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Ensure token is valid, refresh if needed
 */
async function ensureValidToken(): Promise<string | null> {
  const token = getAuthToken();
  if (!token) return null;

  // Check if token is expiring soon
  if (isTokenExpiringSoon(token)) {
    console.debug('[Auth] Token expiring soon, attempting refresh');
    const refreshed = await refreshAuthToken();
    if (refreshed) {
      return getAuthToken();
    }
    // If refresh failed but token is still valid, continue with old token
    const expiry = parseTokenExpiry(token);
    if (expiry && Date.now() < expiry) {
      return token;
    }
    return null;
  }

  return token;
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
    let errorCode = '';

    try {
      if (contentType?.includes('application/json')) {
        const errorData = await response.clone().json();
        errorMessage = errorData.error || errorData.message || errorMessage;
        errorCode = errorData.code || '';
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Don't treat permission/authorization errors as session expiration
    // These are valid 403s that indicate the user lacks permission, not that their session expired
    const isPermissionError =
      errorCode === 'PROVIDER_NOT_FOUND' ||
      errorCode === 'ACCESS_DENIED' ||
      errorCode === 'PERMISSION_DENIED' ||
      errorMessage.toLowerCase().includes('access denied') ||
      errorMessage.toLowerCase().includes('permission denied') ||
      errorMessage.toLowerCase().includes('not authorized') ||
      (response.status === 403 && errorMessage.toLowerCase().includes('only providers'));

    if (isPermissionError) {
      // Return the response without treating it as session expiration
      // Let the caller handle the permission error appropriately
      return response;
    }

    // Clear tokens and dispatch event for actual session issues
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
 * API Fetch wrapper with automatic auth, token refresh, and error handling
 *
 * Features:
 * - Automatic token refresh before expiry
 * - Retry on 401 with fresh token
 * - Session expiration handling
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
  options: RequestInit = {},
  retryCount = 0
): Promise<Response> {
  // Get valid token (with automatic refresh if needed)
  const token = await ensureValidToken();

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

    // If we get a 401 and haven't retried yet, try refreshing the token
    if (response.status === 401 && retryCount === 0) {
      console.debug('[Auth] Got 401, attempting token refresh');
      const refreshed = await refreshAuthToken();
      if (refreshed) {
        // Retry the request with the new token
        return apiFetch(url, options, retryCount + 1);
      }
    }

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
