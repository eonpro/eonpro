'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SESSION_EXPIRED_EVENT, clearAuthTokens, redirectToLogin } from '@/lib/api/fetch';
import { AlertTriangle, LogOut } from 'lucide-react';

/**
 * Session Expiration Handler Component
 *
 * This component:
 * 1. Listens for session expiration events
 * 2. Shows a modal when session expires
 * 3. Redirects to login after acknowledgment or timeout
 */
export default function SessionExpirationHandler() {
  const [isExpired, setIsExpired] = useState(false);
  const [reason, setReason] = useState('Your session has expired');
  const [countdown, setCountdown] = useState(10);
  const router = useRouter();

  const handleLogout = useCallback(() => {
    clearAuthTokens();
    redirectToLogin('session_expired');
  }, []);

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = (event: CustomEvent) => {
      setIsExpired(true);
      setReason(event.detail?.reason || 'Your session has expired');
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);

    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired as EventListener);
    };
  }, []);

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

  // Periodically check if token is still valid
  useEffect(() => {
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
        const response = await fetch('/api/auth/verify', {
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
  }, [isExpired]);

  if (!isExpired) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="bg-amber-50 px-6 py-4 border-b border-amber-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Session Expired</h2>
              <p className="text-sm text-gray-600">Please log in again to continue</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-700 mb-4">{reason}</p>
          <p className="text-sm text-gray-500">
            For your security, you will be redirected to the login page in{' '}
            <span className="font-semibold text-amber-600">{countdown}</span> seconds.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#4fa77e] text-white rounded-lg font-medium hover:bg-[#3f8660] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Log In Now
          </button>
        </div>
      </div>
    </div>
  );
}
