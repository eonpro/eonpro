'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { dispatchSessionExpired, clearAuthTokens, refreshAuthToken } from '@/lib/api/fetch';
import { isBrowser, safeWindow } from '@/lib/utils/ssr-safe';

/** Public routes where fetch interception for session expiry should be skipped */
const PUBLIC_ROUTE_PREFIXES = ['/affiliate/', '/login', '/register', '/reset-password', '/verify-email'];

/** Auth cookie names that may have stale hostname-scoped duplicates */
const AUTH_COOKIE_NAMES = [
  'auth-token',
  'admin-token',
  'super_admin-token',
  'provider-token',
  'staff-token',
  'patient-token',
  'affiliate-token',
  'support-token',
];

/** Subdomains that are NOT clinic-specific (don't need cookie cleanup) */
const NON_CLINIC_SUBDOMAINS = ['www', 'app', 'api', 'admin', 'staging'];

/**
 * On clinic subdomains (e.g. ot.eonpro.io), clear hostname-scoped auth cookies
 * so only the server-set .eonpro.io parent-domain cookies are used.
 *
 * Background: a past bug set auth cookies on the hostname (ot.eonpro.io) via
 * document.cookie. Browsers send hostname cookies before parent-domain cookies,
 * so stale hostname tokens override valid .eonpro.io tokens → 403 loops.
 * The code bug is fixed, but users who haven't cleared cookies still have stale
 * hostname cookies. This cleanup runs once on app init to remove them.
 */
function clearStaleSubdomainCookies(): void {
  if (typeof document === 'undefined') return;

  const hostname = window.location.hostname;

  // Only run on clinic subdomains of eonpro.io (e.g. ot.eonpro.io)
  if (!hostname.endsWith('.eonpro.io')) return;
  const subdomain = hostname.split('.')[0];
  if (!subdomain || NON_CLINIC_SUBDOMAINS.includes(subdomain)) return;

  // Clear hostname-scoped auth cookies (no domain = current hostname only).
  // The .eonpro.io parent-domain cookies set by the server are unaffected.
  AUTH_COOKIE_NAMES.forEach((name) => {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });

  console.info('[CookieCleanup] Cleared hostname-scoped auth cookies on', hostname);
}

/**
 * Global Fetch Interceptor
 *
 * This component patches the global fetch to intercept 401/403 responses
 * and trigger the session expiration flow. This ensures that ALL fetch calls
 * (not just those using apiFetch) properly handle expired sessions.
 *
 * IMPORTANT: On 401, the interceptor first attempts a token refresh before
 * clearing tokens and showing the session expired modal. This prevents
 * premature logouts when the access token simply expired and can be refreshed.
 *
 * Also performs one-time cleanup of stale hostname-scoped auth cookies on
 * clinic subdomains to prevent 403 loops from legacy duplicate cookies.
 */
export default function GlobalFetchInterceptor() {
  const pathname = usePathname();
  const isPublicPage = PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix));
  const cookieCleanupDone = useRef(false);
  // Deduplicate: only one session-expiration flow runs at a time
  const sessionExpirationInProgress = useRef(false);

  // One-time stale cookie cleanup on mount
  useEffect(() => {
    if (!isBrowser || !safeWindow) return;
    if (cookieCleanupDone.current) return;
    cookieCleanupDone.current = true;
    clearStaleSubdomainCookies();
  }, []);

  useEffect(() => {
    // SSR guard - only run on client
    if (!isBrowser || !safeWindow) return;

    // Don't patch fetch on public-facing pages — no session to expire
    if (isPublicPage) return;

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
              errorCode === 'FORBIDDEN' ||
              errorMessage.toLowerCase().includes('access denied') ||
              errorMessage.toLowerCase().includes('permission denied') ||
              errorMessage.toLowerCase().includes('not authorized') ||
              errorMessage.toLowerCase().includes('forbidden') ||
              errorMessage.toLowerCase().includes('no clinic') ||
              errorMessage.toLowerCase().includes('insufficient permissions') ||
              (response.status === 403 && errorMessage.toLowerCase().includes('only providers'));

            if (isPermissionError) {
              console.warn('[GlobalFetchInterceptor] Permission denied (not session expiration)', {
                url,
                status: response.status,
                errorCode,
              });
              return response;
            }

            // Deduplicate: if another 401 handler is already running, skip
            if (sessionExpirationInProgress.current) {
              return response;
            }

            // Attempt a token refresh BEFORE clearing tokens.
            // This prevents premature logouts when the access token simply expired
            // but the refresh token is still valid (the normal case).
            //
            // Uses the shared refreshAuthToken with originalFetch to:
            //   1. Avoid infinite recursion (originalFetch bypasses this interceptor)
            //   2. Share the global dedup lock so concurrent 401s don't race
            sessionExpirationInProgress.current = true;
            try {
              const refreshed = await refreshAuthToken(originalFetch);

              if (refreshed) {
                // Refresh succeeded — retry the original request with the new cookie/token.
                // The server set new httpOnly cookies via Set-Cookie, so the retry will
                // automatically pick them up via credentials: 'include'.
                console.info('[GlobalFetchInterceptor] Token refreshed, retrying request', { url });
                sessionExpirationInProgress.current = false;

                const retryResponse = await originalFetch(input, init);
                return retryResponse;
              }

              // Refresh failed — session is truly expired. Clear tokens and notify.
              clearAuthTokens();
              dispatchSessionExpired(errorMessage);

              console.warn('[GlobalFetchInterceptor] Session expired (refresh failed), redirecting to login', {
                url,
                status: response.status,
              });
            } finally {
              sessionExpirationInProgress.current = false;
            }
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
  }, [isPublicPage]);

  return null; // This component doesn't render anything
}
