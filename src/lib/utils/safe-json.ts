/**
 * Safe JSON parsing for API responses and localStorage.
 * Avoids treating invalid JSON as successful payload and prevents runtime crashes from malformed data.
 */

/**
 * Parse a string as JSON. Returns null on parse failure instead of throwing.
 * Use for localStorage, sessionStorage, or any untrusted string to avoid crashes.
 */
export function safeParseJsonString<T = unknown>(text: string | null | undefined): T | null {
  if (text == null || !String(text).trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Parse response body as JSON. Returns null on parse failure instead of throwing.
 * Callers should check for null and handle explicitly (e.g. show error, don't assume success).
 */
export async function safeParseJson(response: Response): Promise<unknown | null> {
  try {
    const text = await response.text();
    if (!text || !text.trim()) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parse response body as JSON, or return a fallback value on parse failure.
 */
export async function safeParseJsonOr<T>(
  response: Response,
  fallback: T
): Promise<unknown | T> {
  const result = await safeParseJson(response);
  return result !== null ? result : fallback;
}
