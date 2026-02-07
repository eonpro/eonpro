'use client';

/**
 * Authentication Context
 *
 * SECURITY: Uses server-side JWT verification.
 * The JWT secret is NEVER exposed to the client.
 * All token verification happens via /api/auth/session endpoint.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { logger } from '@/lib/logger';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

// Auth types
interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'provider' | 'patient' | 'influencer';
  providerId?: number;
  patientId?: number;
  influencerId?: number;
  permissions?: string[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, role?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  checkPermission: (permission: string) => boolean;
  checkRole: (roles: string[]) => boolean;
  isAuthenticated: boolean;
}

// Session configuration matching EONPRO
const SESSION_CONFIG = {
  ACCESS_TOKEN_EXPIRY: 3600 * 1000, // 1 hour
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 3600 * 1000, // 7 days
  SESSION_CHECK_INTERVAL: 60 * 1000, // Check every minute
  INACTIVITY_TIMEOUT: 15 * 60 * 1000, // 15 minutes
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Protected routes configuration
const ROUTE_PERMISSIONS = {
  '/admin': ['admin'],
  '/providers': ['admin', 'provider'],
  '/patients': ['admin', 'provider'],
  '/influencer': ['admin', 'influencer'],
  '/billing': ['admin'],
  '/soap-notes': ['admin', 'provider'],
  '/patient-portal': ['patient', 'admin', 'provider'],
  '/portal': ['patient', 'admin', 'provider'],
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  
  const router = useRouter();
  const pathname = usePathname();

  // Token management
  const getTokens = useCallback(() => {
    if (typeof window === 'undefined') return { access: null, refresh: null };
    
    return {
      access: localStorage.getItem('access_token'),
      refresh: localStorage.getItem('refresh_token'),
    };
  }, []);

  const setTokens = useCallback((access: string, refresh: string) => {
    localStorage.setItem('access_token', access);
    localStorage.setItem('refresh_token', refresh);
    localStorage.setItem('token_timestamp', Date.now().toString());
  }, []);

  const clearTokens = useCallback(() => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('token_timestamp');
    
    // Clear all role-specific cookies
    document.cookie = 'auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'admin-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'provider-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'influencer-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    document.cookie = 'patient-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  }, []);

  /**
   * SECURITY: Server-side token verification
   * Uses /api/auth/session to verify tokens without exposing JWT secret
   */
  const verifyToken = useCallback(async (token: string): Promise<User | null> => {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        // Don't cache session verification
        cache: 'no-store',
      });

      if (!response.ok) {
        logger.error('Session verification failed:', { status: response.status });
        return null;
      }

      const data = await response.json();

      if (!data.authenticated || !data.user) {
        if (data.expired) {
          logger.info('Token expired, needs refresh');
        }
        return null;
      }

      return {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role as User['role'],
        providerId: data.user.providerId,
        patientId: data.user.patientId,
        influencerId: data.user.influencerId,
        permissions: data.user.permissions,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Token verification failed:', { error: errorMessage });
      return null;
    }
  }, []);

  // Login function
  const login = useCallback(async (email: string, password: string, role: string = 'patient') => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store tokens
      setTokens(data.token, data.refreshToken);
      
      // Decode and set user
      const userData = await verifyToken(data.token);
      if (userData) {
        setUser(userData);
        
        // Note: Login audit logging is handled server-side in /api/auth/login
        
        // Redirect based on role
        switch (userData.role) {
          case 'admin':
            router.push('/admin');
            break;
          case 'provider':
            router.push('/provider');
            break;
          case 'influencer':
            router.push('/influencer/dashboard');
            break;
          case 'patient':
            router.push(PATIENT_PORTAL_PATH);
            break;
          default:
            router.push('/');
        }
      }
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [router, setTokens, verifyToken]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      // Call logout endpoint
      const { access } = getTokens();
      if (access) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${access}`,
          },
        });
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Logout error:', error);
    } finally {
      // Clear local state
      setUser(null);
      clearTokens();
      window.location.href = '/login';
    }
  }, [clearTokens, getTokens]);

  // Refresh token function
  const refreshToken = useCallback(async () => {
    const { refresh } = getTokens();
    if (!refresh) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Token refresh failed');
      }

      // Update tokens
      setTokens(data.token, data.refreshToken);
      
      // Update user data
      const userData = await verifyToken(data.token);
      if (userData) {
        setUser(userData);
      }
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Token refresh failed:', error);
      await logout();
      throw error;
    }
  }, [getTokens, setTokens, verifyToken, logout]);

  // Check permission
  const checkPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    if ((user.role as string) === "admin") return true; // Admins have all permissions
    return user.permissions?.includes(permission) || false;
  }, [user]);

  // Check role
  const checkRole = useCallback((roles: string[]): boolean => {
    if (!user) return false;
    return roles.includes(user.role);
  }, [user]);

  // Session management
  useEffect(() => {
    const checkSession = async () => {
      const { access, refresh } = getTokens();
      
      if (!access) {
        setLoading(false);
        return;
      }

      // Verify token is still valid
      const userData = await verifyToken(access);
      if (userData) {
        setUser(userData);
      } else if (refresh) {
        // Try to refresh if access token is invalid
        try {
          await refreshToken();
        } catch (error: any) {
    // @ts-ignore
   
          logger.error('Session refresh failed:', error);
        }
      }
      
      setLoading(false);
    };

    checkSession();
  }, [getTokens, verifyToken, refreshToken]);

  // Activity tracking for session timeout
  useEffect(() => {
    const handleActivity = () => {
      setLastActivity(Date.now());
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((event: any) => window.addEventListener(event, handleActivity));

    return () => {
      events.forEach((event: any) => window.removeEventListener(event, handleActivity));
    };
  }, []);

  // Session timeout check
  useEffect(() => {
    const interval = setInterval(() => {
      if (user && Date.now() - lastActivity > SESSION_CONFIG.INACTIVITY_TIMEOUT) {
        logger.info('Session timeout due to inactivity');
        logout();
      }
    }, SESSION_CONFIG.SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, lastActivity, logout]);

  // Route protection
  useEffect(() => {
    if (loading) return;

    // Check if current route requires authentication
    const requiredRoles = Object.entries(ROUTE_PERMISSIONS).find(([path]) => 
      pathname.startsWith(path)
    )?.[1];

    if (requiredRoles && !user) {
      // Redirect to login if not authenticated
      router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
    } else if (requiredRoles && user && !requiredRoles.includes(user.role)) {
      // Redirect to unauthorized if wrong role
      router.push('/unauthorized');
    }
  }, [pathname, user, loading, router]);

  // Token refresh interval
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(async () => {
      const tokenTimestamp = localStorage.getItem('token_timestamp');
      if (tokenTimestamp) {
        const elapsed = Date.now() - parseInt(tokenTimestamp, 10);
        if (elapsed > SESSION_CONFIG.ACCESS_TOKEN_EXPIRY * 0.9) {
          // Refresh when 90% of token lifetime has passed
          try {
            await refreshToken();
          } catch (error: any) {
    // @ts-ignore
   
            logger.error('Auto refresh failed:', error);
          }
        }
      }
    }, SESSION_CONFIG.SESSION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [user, refreshToken]);

  const value = {
    user,
    loading,
    error,
    login,
    logout,
    refreshToken,
    checkPermission,
    checkRole,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook to use auth context
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// HOC for protected pages
export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  allowedRoles?: string[]
) {
  return function ProtectedComponent(props: P) {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!loading) {
        if (!user) {
          router.push('/login');
        } else if (allowedRoles && !allowedRoles.includes(user.role)) {
          router.push('/unauthorized');
        }
      }
    }, [user, loading, router]);

    if (loading) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      );
    }

    if (!user || (allowedRoles && !allowedRoles.includes(user.role))) {
      return null;
    }

    return <Component {...props} />;
  };
}
