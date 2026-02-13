/**
 * In-memory cache for admin dashboard per clinic (15-30s TTL).
 * Reduces DB load for repeat visits.
 */

import type { AdminDashboardPayload } from '@/lib/dashboard/admin-dashboard';

const TTL_MS = 20_000; // 20 seconds
const MAX_ENTRIES = 500;

interface Entry {
  payload: AdminDashboardPayload;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

function cacheKey(clinicId: number | undefined, userId: number): string {
  return `dashboard:${clinicId ?? 'all'}:${userId}`;
}

export function getDashboardCache(clinicId: number | undefined, userId: number): AdminDashboardPayload | null {
  const key = cacheKey(clinicId, userId);
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.payload;
}

export function setDashboardCache(
  clinicId: number | undefined,
  userId: number,
  payload: AdminDashboardPayload
): void {
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (v.expiresAt < now) cache.delete(k);
    }
  }
  cache.set(cacheKey(clinicId, userId), {
    payload,
    expiresAt: Date.now() + TTL_MS,
  });
}
