/**
 * Centralized Auth Token Utility
 * 
 * Provides consistent token retrieval across the application.
 * Checks all possible token storage locations in priority order.
 */

import { getLocalStorageItem } from './ssr-safe';

/**
 * Token storage keys in priority order
 */
const TOKEN_KEYS = [
  'auth-token',
  'patient-token',
  'access_token',
  'provider-token',
  'admin-token',
  'super_admin-token',
  'staff-token',
] as const;

/**
 * Get the current auth token from localStorage
 * Checks multiple possible storage keys in order of priority
 * 
 * @returns The auth token string or null if not found
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  for (const key of TOKEN_KEYS) {
    const token = getLocalStorageItem(key);
    if (token) {
      return token;
    }
  }

  return null;
}

/**
 * Check if user is authenticated (has any valid token)
 * 
 * @returns boolean indicating if a token exists
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null;
}

/**
 * Get headers object with Authorization header
 * 
 * @returns Headers object with Bearer token or empty object
 */
export function getAuthHeaders(): HeadersInit {
  const token = getAuthToken();
  if (!token) {
    return {};
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

/**
 * Check if running on Vercel/serverless (no WebSocket support)
 */
export function isServerlessEnvironment(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  const hostname = window.location.hostname;
  return (
    hostname.includes('.vercel.app') ||
    hostname.includes('eonpro.io') ||
    hostname.includes('netlify.app') ||
    process.env.NEXT_PUBLIC_VERCEL === '1'
  );
}
