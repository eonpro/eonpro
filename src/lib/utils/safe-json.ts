/**
 * Safe JSON Parsing Utilities
 * ===========================
 * 
 * Provides type-safe JSON parsing with proper error handling
 * to prevent runtime crashes from malformed JSON.
 * 
 * Usage:
 *   import { safeJsonParse, safeJsonStringify } from '@/lib/utils/safe-json';
 *   const data = safeJsonParse<UserData>(jsonString, defaultValue);
 * 
 * @module lib/utils/safe-json
 */

import { logger } from '@/lib/logger';

/**
 * Safely parse JSON with type inference and error handling
 * 
 * @param json - The JSON string to parse
 * @param fallback - The fallback value to return if parsing fails
 * @param context - Optional context for logging (e.g., 'localStorage.user')
 * @returns The parsed value or fallback
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  fallback: T,
  context?: string
): T {
  if (!json) {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';
    
    if (context) {
      logger.warn(`[SafeJSON] Failed to parse ${context}:`, { error: errorMessage });
    }
    
    return fallback;
  }
}

/**
 * Safely stringify a value to JSON with error handling
 * 
 * @param value - The value to stringify
 * @param fallback - The fallback string to return if stringify fails
 * @param context - Optional context for logging
 * @returns The JSON string or fallback
 */
export function safeJsonStringify<T>(
  value: T,
  fallback: string = '{}',
  context?: string
): string {
  try {
    return JSON.stringify(value);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown stringify error';
    
    if (context) {
      logger.warn(`[SafeJSON] Failed to stringify ${context}:`, { error: errorMessage });
    }
    
    return fallback;
  }
}

/**
 * Parse JSON from localStorage safely
 * 
 * @param key - The localStorage key
 * @param fallback - The fallback value
 * @returns The parsed value or fallback
 */
export function getStorageJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  
  try {
    const item = localStorage.getItem(key);
    return safeJsonParse(item, fallback, `localStorage.${key}`);
  } catch (error) {
    // localStorage itself might throw (e.g., in private browsing)
    logger.warn(`[SafeJSON] localStorage access failed for ${key}`);
    return fallback;
  }
}

/**
 * Set JSON in localStorage safely
 * 
 * @param key - The localStorage key
 * @param value - The value to store
 * @returns true if successful, false otherwise
 */
export function setStorageJson<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  
  try {
    const json = safeJsonStringify(value, '', `localStorage.${key}`);
    if (json) {
      localStorage.setItem(key, json);
      return true;
    }
    return false;
  } catch (error) {
    // localStorage itself might throw (e.g., quota exceeded)
    logger.warn(`[SafeJSON] localStorage write failed for ${key}`);
    return false;
  }
}

/**
 * Parse JSON response body safely
 * 
 * @param response - The fetch Response object
 * @param fallback - The fallback value
 * @returns The parsed value or fallback
 */
export async function safeResponseJson<T>(
  response: Response,
  fallback: T
): Promise<T> {
  try {
    const text = await response.text();
    return safeJsonParse(text, fallback, `response:${response.url}`);
  } catch (error) {
    logger.warn(`[SafeJSON] Failed to read response body from ${response.url}`);
    return fallback;
  }
}
