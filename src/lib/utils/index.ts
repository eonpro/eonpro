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

const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#039;': "'",
  '&#x5C;': '\\',
  '&#x60;': '`',
};

const ENTITY_REGEX = /&(?:amp|lt|gt|quot|#x27|#039|#x5C|#x60);/g;

/**
 * Decode HTML entities that were incorrectly stored in the DB
 * by legacy sanitization functions.
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  return text.replace(ENTITY_REGEX, (match) => HTML_ENTITY_MAP[match] || match);
}
