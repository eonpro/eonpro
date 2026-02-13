/**
 * Utility Functions Index
 * =======================
 *
 * Re-exports all utility functions for easy importing.
 *
 * Usage:
 *   import { safeJsonParse, isBrowser, useIsMounted } from '@/lib/utils';
 */

// Safe JSON utilities
export {
  safeJsonParse,
  safeJsonStringify,
  getStorageJson,
  setStorageJson,
  safeResponseJson,
} from './safe-json';

// SSR-safe utilities
export {
  isBrowser,
  isServer,
  safeWindow,
  safeDocument,
  safeLocalStorage,
  safeSessionStorage,
  useClientValue,
  useIsMounted,
  clientOnly,
  getLocalStorageItem,
  setLocalStorageItem,
  removeLocalStorageItem,
} from './ssr-safe';
