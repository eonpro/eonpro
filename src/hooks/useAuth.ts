'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { clientLogger } from '@/lib/clientLogger';
import { isBrowser, getLocalStorageItem, removeLocalStorageItem } from '@/lib/utils/ssr-safe';
import { redirectToLogin as redirectToLoginFromFetch } from '@/lib/api/fetch';

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  clinicId?: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

export function useAuth(requiredRole?: string | string[]) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    loading: true,
    error: null,
  });

  // Check authentication on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = useCallback(async () => {
    // SSR guard - only run on client
    if (!isBrowser) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    try {
      const token =
        getLocalStorageItem('auth-token') ||
        getLocalStorageItem('super_admin-token') ||
        getLocalStorageItem('admin-token');

      if (!token) {
        setState((prev) => ({ ...prev, loading: false, error: 'No token found' }));
        redirectToLogin('no_session');
        return;
      }

      // Verify token is still valid
      const response = await fetch('/api/auth/verify', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        // Token is invalid or expired
        clearAuth();
        redirectToLogin('session_expired');
        return;
      }

      const data = await response.json();

      // Check role if required
      if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        const userRole = data.user?.role?.toLowerCase();
        const hasRole = roles.some((r) => r.toLowerCase() === userRole);

        if (!hasRole) {
          setState((prev) => ({ ...prev, loading: false, error: 'Insufficient permissions' }));
          router.push('/unauthorized');
          return;
        }
      }

      setState({
        user: data.user,
        token,
        loading: false,
        error: null,
      });
    } catch (error) {
      clientLogger.error('Auth check failed:', error);
      clearAuth();
      redirectToLogin('error');
    }
  }, [requiredRole, router]);

  const redirectToLogin = (reason: string) => {
    redirectToLoginFromFetch(reason);
  };

  const clearAuth = () => {
    removeLocalStorageItem('auth-token');
    removeLocalStorageItem('super_admin-token');
    removeLocalStorageItem('admin-token');
    removeLocalStorageItem('user');
    setState({
      user: null,
      token: null,
      loading: false,
      error: null,
    });
  };

  const logout = async () => {
    try {
      const token = state.token || localStorage.getItem('auth-token');
      if (token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      // Log but don't fail on logout errors - we're clearing auth anyway
      clientLogger.warn(
        '[useAuth] Logout API call failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
    clearAuth();
    window.location.href = '/login';
  };

  // Fetch helper with auto-auth
  const authFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = state.token || getLocalStorageItem('auth-token');

      const response = await fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle auth errors globally
      if (response.status === 401 || response.status === 403) {
        clearAuth();
        redirectToLogin('session_expired');
        throw new Error('Session expired');
      }

      return response;
    },
    [state.token, router]
  );

  return {
    user: state.user,
    token: state.token,
    loading: state.loading,
    error: state.error,
    isAuthenticated: !!state.user && !!state.token,
    logout,
    authFetch,
    checkAuth,
  };
}

export default useAuth;
