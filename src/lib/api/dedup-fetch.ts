/**
 * In-flight request deduplication for API calls.
 *
 * When multiple components call the same endpoint simultaneously (e.g.
 * 6+ components all calling /api/auth/me on mount), this ensures only
 * ONE network request is made. Subsequent callers receive the same
 * promise and response.
 *
 * The cache is keyed by URL and auto-clears after the request completes
 * (with a short grace period to catch closely-spaced calls).
 */

const inflight = new Map<string, { promise: Promise<Response>; timestamp: number }>();

const GRACE_MS = 500;

/**
 * Fetch with automatic deduplication of concurrent GET requests.
 * Only deduplicates GET requests to the same URL. Non-GET requests
 * pass through directly.
 */
export function dedupFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const method = (options?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') {
    return fetch(url, options);
  }

  const existing = inflight.get(url);
  if (existing && Date.now() - existing.timestamp < 30_000) {
    return existing.promise.then((r) => r.clone());
  }

  const promise = fetch(url, options).then((response) => {
    setTimeout(() => {
      const entry = inflight.get(url);
      if (entry && entry.promise === promise) {
        inflight.delete(url);
      }
    }, GRACE_MS);
    return response;
  }).catch((err) => {
    inflight.delete(url);
    throw err;
  });

  inflight.set(url, { promise, timestamp: Date.now() });
  return promise.then((r) => r.clone());
}
