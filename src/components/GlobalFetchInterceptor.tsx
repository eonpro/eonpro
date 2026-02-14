'use client';

import { useEffect } from 'react';
import { dispatchSessionExpired, clearAuthTokens } from '@/lib/api/fetch';
import { isBrowser, safeWindow } from '@/lib/utils/ssr-safe';

/**
 * Global Fetch Interceptor
 *
 * This component patches the global fetch to intercept 401/403 responses
 * and trigger the session expiration flow. This ensures that ALL fetch calls
 * (not just those using apiFetch) properly handle expired sessions.
 */
export default function GlobalFetchInterceptor() {
  useEffect(() => {
    // SSR guard - only run on client
    if (!isBrowser || !safeWindow) return;

    // Store original fetch
    const originalFetch = window.fetch;

    // Create patched fetch
    window.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit
    ): Promise<Response> {
      try {
        const response = await originalFetch(input, init);

        // Check for auth errors on API routes
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const isApiRoute = url.includes('/api/');

        if (isApiRoute && (response.status === 401 || response.status === 403)) {
          // Skip interception for apiFetch requests - they handle 401 with token refresh + retry
          const req = typeof input === 'object' && 'headers' in input ? (input as Request) : null;
          const headers = init?.headers ?? req?.headers;
          const hasAuthRetry =
            headers instanceof Headers
              ? headers.get('X-Eonpro-Auth-Retry') === '1'
              : (headers as Record<string, string>)?.['X-Eonpro-Auth-Retry'] === '1' ||
                (headers as Record<string, string>)?.['x-eonpro-auth-retry'] === '1';

          // Check if this is a login/auth route (don't intercept those)
          const isAuthRoute =
            url.includes('/api/auth/login') ||
            url.includes('/api/auth/verify') ||
            url.includes('/api/auth/refresh') ||
            url.includes('/api/affiliate/auth/login') ||
            url.includes('/api/affiliate/auth/me');

          if (!isAuthRoute && !hasAuthRetry) {
            // Clone response to read the body without consuming it
            const clonedResponse = response.clone();
            let errorMessage = 'Session expired';
            let errorCode = '';

            try {
              const errorData = await clonedResponse.json();
              errorMessage = errorData.error || errorData.message || errorMessage;
              errorCode = errorData.code || '';
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
              console.warn('[GlobalFetchInterceptor] Permission denied (not session expiration)', {
                url,
                status: response.status,
                errorCode,
              });
              // Don't clear tokens or dispatch session expired - just return the response
              return response;
            }

            // Clear tokens and dispatch expiration event for actual session issues
            clearAuthTokens();
            dispatchSessionExpired(errorMessage);

            console.warn('[GlobalFetchInterceptor] Session expired, redirecting to login', {
              url,
              status: response.status,
            });
          }
        }

        return response;
      } catch (error) {
        // Re-throw network errors
        throw error;
      }
    };

    // Cleanup: restore original fetch on unmount
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return null; // This component doesn't render anything
}
