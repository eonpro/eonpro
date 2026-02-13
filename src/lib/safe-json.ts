/**
 * Safe JSON parsing for API responses
 * Prevents silent JSON parse crashes and provides diagnostic context.
 *
 * @module lib/safe-json
 */

const MAX_BODY_PREVIEW = 300;

export class SafeJsonParseError extends Error {
  constructor(
    message: string,
    public status: number,
    public contentType: string,
    public bodyPreview: string
  ) {
    super(message);
    this.name = 'SafeJsonParseError';
  }
}

/**
 * Parse response as JSON with validation.
 * - Validates content-type is application/json (or includes it)
 * - Throws SafeJsonParseError with status, contentType, bodyPreview if invalid
 * - Never swallows errors; always throws descriptive error
 */
export async function safeJson<T = unknown>(response: Response): Promise<T> {
  const status = response.status;
  const contentType = response.headers.get('content-type') ?? '';

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.length > MAX_BODY_PREVIEW
      ? text.slice(0, MAX_BODY_PREVIEW) + '...'
      : text;
    throw new SafeJsonParseError(
      `Response is not JSON. Status=${status} Content-Type=${contentType} Body=${preview}`,
      status,
      contentType,
      preview
    );
  }

  const text = await response.text();
  const preview = text.length > MAX_BODY_PREVIEW
    ? text.slice(0, MAX_BODY_PREVIEW) + '...'
    : text;

  try {
    return JSON.parse(text) as T;
  } catch (parseErr) {
    const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new SafeJsonParseError(
      `JSON parse failed. Status=${status} Error=${msg} Body=${preview}`,
      status,
      contentType,
      preview
    );
  }
}
