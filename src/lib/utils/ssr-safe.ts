/**
 * SSR-Safe Utilities
 * ==================
 *
 * Provides utilities for safely accessing browser APIs
 * in a server-side rendering context.
 *
 * Usage:
 *   import { isBrowser, safeWindow, useClientValue } from '@/lib/utils/ssr-safe';
 *
 * @module lib/utils/ssr-safe
 */

import { useState, useEffect } from 'react';

/**
 * Check if code is running in the browser
 */
export const isBrowser = typeof window !== 'undefined';

/**
 * Check if code is running on the server
 */
export const isServer = typeof window === 'undefined';

/**
 * Safely access window object
 * Returns undefined on server
 */
export const safeWindow = isBrowser ? window : undefined;

/**
 * Safely access document object
 * Returns undefined on server
 */
export const safeDocument = isBrowser ? document : undefined;

/**
 * Safely access localStorage
 * Returns a stub object on server that does nothing
 */
export const safeLocalStorage: Storage = isBrowser
  ? localStorage
  : {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };

/**
 * Safely access sessionStorage
 * Returns a stub object on server that does nothing
 */
export const safeSessionStorage: Storage = isBrowser
  ? sessionStorage
  : {
      length: 0,
      clear: () => {},
      getItem: () => null,
      key: () => null,
      removeItem: () => {},
      setItem: () => {},
    };

/**
 * Hook to get a value that depends on client-side APIs
 * Returns the initial value during SSR and hydration,
 * then updates to the client value after mount.
 *
 * @param getClientValue - Function that returns the client-side value
 * @param serverValue - Value to use during SSR and initial hydration
 * @returns The server value during SSR, client value after mount
 *
 * @example
 * const windowWidth = useClientValue(() => window.innerWidth, 0);
 */
export function useClientValue<T>(getClientValue: () => T, serverValue: T): T {
  const [value, setValue] = useState<T>(serverValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setValue(getClientValue());
  }, []);

  return mounted ? value : serverValue;
}

/**
 * Hook to check if the component has mounted (client-side)
 * Useful for conditionally rendering client-only content
 *
 * @returns true after first client render, false during SSR
 *
 * @example
 * const mounted = useIsMounted();
 * if (!mounted) return <Skeleton />;
 * return <RealComponent />;
 */
export function useIsMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

/**
 * Wrapper to safely execute a function only on the client
 *
 * @param fn - The function to execute
 * @param fallback - Optional fallback value for server
 * @returns The function result or fallback
 *
 * @example
 * const token = clientOnly(() => localStorage.getItem('token'), null);
 */
export function clientOnly<T>(fn: () => T, fallback: T): T {
  if (isBrowser) {
    try {
      return fn();
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Get a value from localStorage safely (SSR-safe)
 *
 * @param key - The localStorage key
 * @param defaultValue - Default value if not found
 * @returns The stored value or default
 */
export function getLocalStorageItem(key: string, defaultValue: string = ''): string {
  if (!isBrowser) {
    return defaultValue;
  }

  try {
    return localStorage.getItem(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a value in localStorage safely (SSR-safe)
 *
 * @param key - The localStorage key
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export function setLocalStorageItem(key: string, value: string): boolean {
  if (!isBrowser) {
    return false;
  }

  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove a value from localStorage safely (SSR-safe)
 *
 * @param key - The localStorage key
 * @returns true if successful, false otherwise
 */
export function removeLocalStorageItem(key: string): boolean {
  if (!isBrowser) {
    return false;
  }

  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}
