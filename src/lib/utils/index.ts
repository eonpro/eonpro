/**
 * Utility Functions Index
 * =======================
 *
 * Re-exports all utility functions for easy importing.
 *
 * Usage:
 *   import { safeParseJsonString, isBrowser, useIsMounted } from '@/lib/utils';
 */

// Safe JSON utilities
export {
  safeParseJsonString,
  safeParseJson,
  safeParseJsonOr,
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
