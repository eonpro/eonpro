'use client';

import { useEffect } from 'react';
import { dispatchSessionExpired, clearAuthTokens } from '@/lib/api/fetch';

/**
 * Global Fetch Interceptor
 * 
 * This component patches the global fetch to intercept 401/403 responses
 * and trigger the session expiration flow. This ensures that ALL fetch calls
 * (not just those using apiFetch) properly handle expired sessions.
 */
export default function GlobalFetchInterceptor() {
  useEffect(() => {
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
        const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        const isApiRoute = url.includes('/api/');

        if (isApiRoute && (response.status === 401 || response.status === 403)) {
          // Check if this is a login/auth route (don't intercept those)
          const isAuthRoute = url.includes('/api/auth/login') || 
                              url.includes('/api/auth/verify') ||
                              url.includes('/api/auth/refresh') ||
                              url.includes('/api/affiliate/auth/login') ||
                              url.includes('/api/affiliate/auth/me') ||
                              url.includes('/api/influencers/auth/');
          
          if (!isAuthRoute) {
            // Clone response to read the body without consuming it
            const clonedResponse = response.clone();
            let errorMessage = 'Session expired';

            try {
              const errorData = await clonedResponse.json();
              errorMessage = errorData.error || errorData.message || errorMessage;
            } catch {
              // Ignore JSON parse errors
            }

            // Clear tokens and dispatch expiration event
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
