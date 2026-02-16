/**
 * CENTRALIZED TIMEOUT CONFIGURATION
 * ==================================
 *
 * All external service timeouts defined in one place.
 * Import these constants instead of hardcoding timeout values.
 *
 * Current configuration:
 *   - Stripe: 30s (complex financial operations)
 *   - OpenAI: 60s (AI generation can be slow)
 *   - Twilio SMS: 10s (simple API call)
 *   - AWS SES: 10s connection / 10s socket
 *   - Lifefile (Pharmacy): 20s
 *   - Database queries: 4s (health checks), 15s (normal)
 *   - Redis: 5s
 *   - Internal fetch: 30s
 *
 * @module resilience/timeouts
 */

// ============================================================================
// External Service Timeouts (milliseconds)
// ============================================================================

export const TIMEOUTS = {
  /** Stripe API — financial operations, webhooks */
  STRIPE: 30_000,

  /** OpenAI API — chat completions, embeddings */
  OPENAI: 60_000,

  /** Twilio — SMS sending, account lookups */
  TWILIO: 10_000,

  /** AWS SES — email sending */
  SES_CONNECTION: 5_000,
  SES_SOCKET: 10_000,

  /** Lifefile Pharmacy API */
  LIFEFILE: 20_000,

  /** Database health check — fail fast to avoid blocking pool */
  DB_HEALTH: 4_000,

  /** Normal database transaction timeout */
  DB_TRANSACTION: 15_000,

  /** Redis cache operations */
  REDIS: 5_000,

  /** Internal API calls (server-to-server) */
  INTERNAL_FETCH: 30_000,

  /** Webhook delivery to external endpoints */
  WEBHOOK_DELIVERY: 10_000,

  /** Default for any uncategorized external call */
  DEFAULT: 15_000,
} as const;

// ============================================================================
// Timeout Utilities
// ============================================================================

/**
 * Wrap a promise with a timeout.
 * Rejects with a TimeoutError if the promise doesn't resolve within the specified time.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string = 'Operation'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`${label} timed out after ${ms}ms`, ms)),
        ms
      )
    ),
  ]);
}

/**
 * Create a fetch wrapper with a built-in timeout using AbortController.
 * Prefer this over the generic withTimeout for HTTP requests.
 */
export function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = TIMEOUTS.DEFAULT, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...fetchOptions,
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Custom error for timeout scenarios.
 * Allows callers to distinguish timeouts from other errors.
 */
export class TimeoutError extends Error {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Check if an error is a timeout error.
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (error instanceof Error && error.name === 'AbortError');
}
