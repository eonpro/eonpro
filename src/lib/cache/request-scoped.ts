/**
 * Request-scoped in-memory cache with TTL
 * Used for session storage and clinic resolution to reduce Redis/DB hits.
 *
 * NOT for user data - only for infra lookups.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const TTL_MS = 60_000; // 60 seconds
const MAX_ENTRIES = 10_000;

// Session storage cache: sessionId -> SessionState (avoids Redis get)
const sessionStorageCache = new Map<string, CacheEntry<unknown>>();
// Clinic resolution cache: subdomain (lowercase) -> clinicId
const clinicCache = new Map<string, CacheEntry<number>>();

function pruneIfNeeded<T>(cache: Map<string, CacheEntry<T>>) {
  if (cache.size < MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of cache) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

export function getSessionFromCache(sessionId: string): unknown | null {
  const entry = sessionStorageCache.get(sessionId);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.value;
}

export function setSessionInCache(sessionId: string, session: unknown): void {
  pruneIfNeeded(sessionStorageCache);
  sessionStorageCache.set(sessionId, {
    value: session,
    expiresAt: Date.now() + TTL_MS,
  });
}

export function invalidateSessionCache(sessionId: string): void {
  sessionStorageCache.delete(sessionId);
}

export function getClinicBySubdomainCache(subdomain: string): number | null {
  const key = subdomain.toLowerCase();
  const entry = clinicCache.get(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.value;
}

export function setClinicBySubdomainCache(subdomain: string, clinicId: number): void {
  pruneIfNeeded(clinicCache);
  clinicCache.set(subdomain.toLowerCase(), {
    value: clinicId,
    expiresAt: Date.now() + TTL_MS,
  });
}
