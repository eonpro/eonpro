'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch, SESSION_EXPIRED_EVENT, clearAuthTokens, redirectToLogin } from '@/lib/api/fetch';
import { AlertTriangle, LogOut } from 'lucide-react';

/**
 * Session Expiration Handler Component
 *
 * This component:
 * 1. Listens for session expiration events
 * 2. Shows a modal when session expires
 * 3. Redirects to login after acknowledgment or timeout
 */
/** Public routes that should never trigger session expiration logic */
const PUBLIC_ROUTE_PREFIXES = ['/affiliate/', '/login', '/register', '/reset-password', '/verify-email'];

export default function SessionExpirationHandler() {
  const [isExpired, setIsExpired] = useState(false);
  const [reason, setReason] = useState('Your session has expired');
  const [countdown, setCountdown] = useState(10);
  const pathname = usePathname();

  // Skip all session logic on public-facing pages
  const isPublicPage = PUBLIC_ROUTE_PREFIXES.some((prefix) => pathname?.startsWith(prefix));

  const handleLogout = useCallback(() => {
    clearAuthTokens();
    redirectToLogin('session_expired');
  }, []);

  // Listen for session expiration events (skip on public pages)
  useEffect(() => {
    if (isPublicPage) return;

    const handleSessionExpired = (event: CustomEvent) => {
      setIsExpired(true);
      setReason(event.detail?.reason || 'Your session has expired');
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    };
  }, [isPublicPage]);

  // Countdown timer when expired
  useEffect(() => {
    if (!isExpired) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          handleLogout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isExpired, handleLogout]);

  // Periodically check if token is still valid (skip on public pages)
  useEffect(() => {
    if (isPublicPage) return;

    const checkTokenValidity = async () => {
      // Skip if already showing expired modal
      if (isExpired) return;

      // Check if we have any tokens
      const hasToken =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('access_token') ||
        localStorage.getItem('admin-token');

      if (!hasToken) return;

      try {
        const response = await apiFetch('/api/auth/verify', {
          headers: {
            Authorization: `Bearer ${hasToken}`,
          },
        });

        if (response.status === 401 || response.status === 403) {
          setIsExpired(true);
          setReason('Your session has expired due to inactivity');
        }
      } catch (error) {
        // Network error - don't show expired modal for network issues
        console.warn('Token verification failed:', error);
      }
    };

    // Check every 2 minutes
    const interval = setInterval(checkTokenValidity, 2 * 60 * 1000);

    // Also check on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkTokenValidity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isExpired, isPublicPage]);

  // Never render the expiration modal on public pages
  if (isPublicPage || !isExpired) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="animate-in fade-in zoom-in mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl duration-200">
        {/* Header */}
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Session Expired</h2>
              <p className="text-sm text-gray-600">Please log in again to continue</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="mb-4 text-gray-700">{reason}</p>
          <p className="text-sm text-gray-500">
            For your security, you will be redirected to the login page in{' '}
            <span className="font-semibold text-amber-600">{countdown}</span> seconds.
          </p>
        </div>

        {/* Actions */}
        <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4fa77e] px-4 py-2.5 font-medium text-white transition-colors hover:bg-[#3f8660]"
          >
            <LogOut className="h-4 w-4" />
            Log In Now
          </button>
        </div>
      </div>
    </div>
  );
}
