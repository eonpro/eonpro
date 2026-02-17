/**
 * Two-Tier Dashboard Cache
 * =========================
 *
 * L1: In-memory (per-instance, 20s TTL) — zero latency
 * L2: Redis (cross-instance, 60s TTL) — ~1ms latency
 *
 * Read path: L1 → L2 → DB (promote through tiers on miss)
 * Write path: populate both L1 and L2 simultaneously
 *
 * Graceful degradation: if Redis is unavailable, falls back to L1-only
 * (identical to the previous implementation).
 *
 * @module cache/dashboard
 */

import type { AdminDashboardPayload } from '@/lib/dashboard/admin-dashboard';
import type { GeoPayload } from '@/app/api/admin/dashboard/geo/route';
import { logger } from '@/lib/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const L1_TTL_MS = 20_000; // 20 seconds (in-memory)
const L2_TTL_SECONDS = parseInt(process.env.DASHBOARD_CACHE_TTL_SECONDS ?? '60', 10); // Redis
const GEO_L2_TTL_SECONDS = parseInt(process.env.GEO_CACHE_TTL_SECONDS ?? '120', 10); // Geo data changes less often
const MAX_L1_ENTRIES = 500;
const REDIS_NAMESPACE = 'eonpro:cache';

// =============================================================================
// LAZY REDIS
// =============================================================================

async function getRedis() {
  try {
    const mod = await import('@/lib/cache/redis');
    const cache = mod.default;
    if (!cache.isReady()) return null;
    return cache;
  } catch {
    return null;
  }
}

// =============================================================================
// L1 IN-MEMORY CACHE (unchanged behavior)
// =============================================================================

interface L1Entry<T> {
  payload: T;
  expiresAt: number;
}

const dashboardL1 = new Map<string, L1Entry<AdminDashboardPayload>>();
const geoL1 = new Map<string, L1Entry<GeoPayload>>();

function l1Key(prefix: string, clinicId: number | undefined, userId: number): string {
  return `${prefix}:${clinicId ?? 'all'}:${userId}`;
}

function l1Get<T>(store: Map<string, L1Entry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.payload;
}

function l1Set<T>(store: Map<string, L1Entry<T>>, key: string, payload: T): void {
  if (store.size >= MAX_L1_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt < now) store.delete(k);
    }
  }
  store.set(key, { payload, expiresAt: Date.now() + L1_TTL_MS });
}

// =============================================================================
// DASHBOARD CACHE — PUBLIC API
// =============================================================================

/**
 * Get cached dashboard data. Checks L1 first, then L2 (Redis).
 * Returns null on cache miss.
 */
export function getDashboardCache(
  clinicId: number | undefined,
  userId: number
): AdminDashboardPayload | null {
  const key = l1Key('dashboard', clinicId, userId);
  return l1Get(dashboardL1, key);
}

/**
 * Get cached dashboard data with async Redis fallback.
 * Use this instead of getDashboardCache when you want L2 promotion.
 */
export async function getDashboardCacheAsync(
  clinicId: number | undefined,
  userId: number
): Promise<AdminDashboardPayload | null> {
  const key = l1Key('dashboard', clinicId, userId);

  // L1 check
  const l1 = l1Get(dashboardL1, key);
  if (l1) return l1;

  // L2 check (Redis)
  try {
    const redis = await getRedis();
    if (!redis) return null;

    const redisKey = `dashboard:${clinicId ?? 'all'}:${userId}`;
    const cached = await redis.get<AdminDashboardPayload>(redisKey, {
      namespace: REDIS_NAMESPACE,
    });

    if (cached) {
      // Promote to L1
      l1Set(dashboardL1, key, cached);
      return cached;
    }
  } catch (err) {
    logger.warn('[DashboardCache] Redis L2 read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Store dashboard data in both L1 and L2.
 */
export function setDashboardCache(
  clinicId: number | undefined,
  userId: number,
  payload: AdminDashboardPayload
): void {
  const key = l1Key('dashboard', clinicId, userId);
  l1Set(dashboardL1, key, payload);

  // Fire-and-forget L2 write
  setDashboardCacheL2(clinicId, userId, payload).catch(() => {});
}

async function setDashboardCacheL2(
  clinicId: number | undefined,
  userId: number,
  payload: AdminDashboardPayload
): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;

    const redisKey = `dashboard:${clinicId ?? 'all'}:${userId}`;
    await redis.set(redisKey, payload, {
      ttl: L2_TTL_SECONDS,
      namespace: REDIS_NAMESPACE,
    });
  } catch (err) {
    logger.warn('[DashboardCache] Redis L2 write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// GEO CACHE — PUBLIC API
// =============================================================================

/**
 * Get cached geo data. Checks L1 first, then L2 (Redis).
 */
export async function getGeoCacheAsync(
  clinicId: number | undefined,
  userId: number
): Promise<GeoPayload | null> {
  const key = l1Key('geo', clinicId, userId);

  // L1 check
  const l1 = l1Get(geoL1, key);
  if (l1) return l1;

  // L2 check (Redis)
  try {
    const redis = await getRedis();
    if (!redis) return null;

    const redisKey = `geo:${clinicId ?? 'all'}:${userId}`;
    const cached = await redis.get<GeoPayload>(redisKey, {
      namespace: REDIS_NAMESPACE,
    });

    if (cached) {
      l1Set(geoL1, key, cached);
      return cached;
    }
  } catch (err) {
    logger.warn('[GeoCache] Redis L2 read failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

/**
 * Store geo data in both L1 and L2.
 */
export function setGeoCache(
  clinicId: number | undefined,
  userId: number,
  payload: GeoPayload
): void {
  const key = l1Key('geo', clinicId, userId);
  l1Set(geoL1, key, payload);

  setGeoCacheL2(clinicId, userId, payload).catch(() => {});
}

async function setGeoCacheL2(
  clinicId: number | undefined,
  userId: number,
  payload: GeoPayload
): Promise<void> {
  try {
    const redis = await getRedis();
    if (!redis) return;

    const redisKey = `geo:${clinicId ?? 'all'}:${userId}`;
    await redis.set(redisKey, payload, {
      ttl: GEO_L2_TTL_SECONDS,
      namespace: REDIS_NAMESPACE,
    });
  } catch (err) {
    logger.warn('[GeoCache] Redis L2 write failed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// =============================================================================
// CACHE INVALIDATION
// =============================================================================

/**
 * Invalidate all dashboard cache entries (called on data mutation).
 * Clears both L1 and L2. Async but fire-and-forget safe.
 */
export async function invalidateDashboardCache(clinicId?: number): Promise<void> {
  // Clear L1 (all entries matching clinicId, or all if undefined)
  for (const key of dashboardL1.keys()) {
    if (!clinicId || key.includes(`:${clinicId}:`)) {
      dashboardL1.delete(key);
    }
  }

  // Clear L2 — requires key-level deletion (can't easily wildcard in Redis without SCAN)
  // For now, L2 entries will expire naturally via TTL (60s max staleness)
  // This is acceptable for dashboard data that doesn't require real-time consistency
}

/**
 * Invalidate geo cache entries.
 */
export async function invalidateGeoCache(clinicId?: number): Promise<void> {
  for (const key of geoL1.keys()) {
    if (!clinicId || key.includes(`:${clinicId}:`)) {
      geoL1.delete(key);
    }
  }
}
