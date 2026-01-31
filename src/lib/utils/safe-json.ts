/**
 * Safe JSON Parsing Utilities
 *
 * ENTERPRISE: Provides safe wrappers for JSON.parse and JSON.stringify
 * to prevent runtime crashes from malformed JSON data.
 *
 * @module lib/utils/safe-json
 */

import { logger } from '@/lib/logger';

/**
 * Result type for safe parse operations
 */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Safely parse JSON string with error handling
 *
 * @param json - JSON string to parse
 * @param context - Optional context for error logging
 * @returns SafeParseResult with parsed data or error
 *
 * @example
 * const result = safeJsonParse<User>(jsonString, 'user-profile');
 * if (result.success) {
 *   console.log(result.data);
 * } else {
 *   console.error(result.error);
 * }
 */
export function safeJsonParse<T = unknown>(
  json: string | null | undefined,
  context?: string
): SafeParseResult<T> {
  if (json === null || json === undefined) {
    return {
      success: false,
      error: 'Input is null or undefined',
    };
  }

  if (typeof json !== 'string') {
    return {
      success: false,
      error: `Expected string, got ${typeof json}`,
    };
  }

  try {
    const data = JSON.parse(json) as T;
    return { success: true, data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown parse error';

    if (context) {
      logger.warn(`[SAFE_JSON] Parse failed for ${context}`, {
        error: errorMessage,
        inputLength: json.length,
        inputPreview: json.substring(0, 100),
      });
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Parse JSON with a default fallback value
 *
 * @param json - JSON string to parse
 * @param defaultValue - Value to return if parsing fails
 * @param context - Optional context for error logging
 * @returns Parsed data or default value
 *
 * @example
 * const config = safeJsonParseOr(jsonString, { enabled: false });
 */
export function safeJsonParseOr<T>(
  json: string | null | undefined,
  defaultValue: T,
  context?: string
): T {
  const result = safeJsonParse<T>(json, context);
  return result.success ? result.data : defaultValue;
}

/**
 * Safely stringify a value to JSON
 *
 * @param value - Value to stringify
 * @param context - Optional context for error logging
 * @returns JSON string or null if stringify fails
 */
export function safeJsonStringify(
  value: unknown,
  context?: string
): string | null {
  try {
    return JSON.stringify(value);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown stringify error';

    if (context) {
      logger.warn(`[SAFE_JSON] Stringify failed for ${context}`, {
        error: errorMessage,
        valueType: typeof value,
      });
    }

    return null;
  }
}

/**
 * Safely stringify with pretty formatting
 */
export function safeJsonStringifyPretty(
  value: unknown,
  context?: string
): string | null {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown stringify error';

    if (context) {
      logger.warn(`[SAFE_JSON] Pretty stringify failed for ${context}`, {
        error: errorMessage,
      });
    }

    return null;
  }
}

/**
 * Parse JSON from request body with validation
 *
 * @param request - Request object with json() method
 * @param context - Context for logging
 * @returns SafeParseResult with parsed body
 */
export async function safeRequestJson<T = unknown>(
  request: Request,
  context?: string
): Promise<SafeParseResult<T>> {
  try {
    const body = await request.json();
    return { success: true, data: body as T };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (context) {
      logger.warn(`[SAFE_JSON] Request body parse failed for ${context}`, {
        error: errorMessage,
      });
    }

    return {
      success: false,
      error: `Failed to parse request body: ${errorMessage}`,
    };
  }
}

/**
 * Type guard to check if value is a valid JSON object
 */
export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard to check if value is a valid JSON array
 */
export function isJsonArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Safe property access with type checking
 *
 * @example
 * const email = safeGet(user, 'email', '');
 * const count = safeGet(data, 'count', 0);
 */
export function safeGet<T>(
  obj: unknown,
  key: string,
  defaultValue: T
): T {
  if (!isJsonObject(obj)) {
    return defaultValue;
  }

  const value = obj[key];

  if (value === undefined || value === null) {
    return defaultValue;
  }

  return value as T;
}

/**
 * Safe deep property access
 *
 * @example
 * const city = safeGetDeep(user, ['address', 'city'], 'Unknown');
 */
export function safeGetDeep<T>(
  obj: unknown,
  path: string[],
  defaultValue: T
): T {
  let current: unknown = obj;

  for (const key of path) {
    if (!isJsonObject(current)) {
      return defaultValue;
    }
    current = current[key];
  }

  if (current === undefined || current === null) {
    return defaultValue;
  }

  return current as T;
}

/**
 * Get JSON from localStorage safely
 *
 * @param key - Storage key
 * @param defaultValue - Default value if key not found or invalid JSON
 * @returns Parsed value or default
 */
export function getStorageJson<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }

  try {
    const item = localStorage.getItem(key);
    if (item === null) {
      return defaultValue;
    }
    return safeJsonParseOr<T>(item, defaultValue, `localStorage:${key}`);
  } catch {
    return defaultValue;
  }
}

/**
 * Set JSON to localStorage safely
 *
 * @param key - Storage key
 * @param value - Value to store
 * @returns true if successful, false otherwise
 */
export function setStorageJson(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const json = safeJsonStringify(value, `localStorage:${key}`);
    if (json === null) {
      return false;
    }
    localStorage.setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely create a JSON response (for use in API routes)
 *
 * @param data - Data to send
 * @param init - Response init options
 * @returns Response object
 */
export function safeResponseJson(
  data: unknown,
  init?: ResponseInit
): Response {
  const json = safeJsonStringify(data, 'response');
  if (json === null) {
    return new Response(
      JSON.stringify({ error: 'Failed to serialize response' }),
      { status: 500, headers: { 'Content-Type': 'application/json' }, ...init }
    );
  }

  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}
