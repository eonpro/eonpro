/**
 * Shared Middleware Cache Layer
 * =============================
 *
 * Eliminates redundant DB queries from auth middleware by caching:
 * - Subdomain → clinicId mappings (Redis, 5 min TTL)
 * - User/Provider → clinic access checks (Redis, 5 min TTL)
 * - Session activity tracking (Redis-only, batch sync to DB)
 *
 * Both withAuth and withAuthParams use these helpers to ensure
 * a single cache layer and consistent behavior.
 *
 * Impact: Reduces middleware DB calls from 2-4 per request to 0-1.
 *
 * @module auth/middleware-cache
 */

import cache from '@/lib/cache/redis';
import { basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';

// Cache TTLs (seconds) — reduced from 5 min to 60s for tenant security
// (revoked clinic access propagates within 60s instead of 5 min)
const SUBDOMAIN_CACHE_TTL = 300; // 5 minutes (subdomain→clinic mapping is stable)
const CLINIC_ACCESS_CACHE_TTL = 60; // 60 seconds (reduced for faster revocation propagation)
const SESSION_ACTIVITY_THROTTLE_TTL = 300; // 5 minutes — session idle timeout (30 min) still works at this granularity

const CACHE_NAMESPACE = 'mw'; // short namespace for middleware caches

// ============================================================================
// Env Map: SUBDOMAIN_CLINIC_ID_MAP (parsed once, cached in-memory)
// ============================================================================

let _envMapParsed = false;
let _envMap: Map<string, number> | null = null;

/**
 * Parse SUBDOMAIN_CLINIC_ID_MAP env var into a Map (once per process).
 * Format: "sub1:1,sub2:2,sub3:3"
 * Returns null if the env var is not set.
 */
function getSubdomainEnvMap(): Map<string, number> | null {
  if (_envMapParsed) return _envMap;
  _envMapParsed = true;

  const raw = process.env.SUBDOMAIN_CLINIC_ID_MAP;
  if (!raw) return null;

  _envMap = new Map();
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split(':').map((s) => s.trim());
    if (k && v) {
      const id = parseInt(v, 10);
      if (!isNaN(id)) _envMap.set(k.toLowerCase(), id);
    }
  }
  return _envMap;
}

// ============================================================================
// Subdomain → Clinic ID Resolution (Redis-backed)
// ============================================================================

/**
 * Resolve subdomain to clinicId using a three-tier cache-first strategy:
 *
 *   1. SUBDOMAIN_CLINIC_ID_MAP env var  (in-process, zero latency)
 *   2. Redis cache                       (Upstash HTTP, ~1-3 ms)
 *   3. Database lookup                   (Prisma → PostgreSQL, ~5-50 ms)
 *
 * Successful DB lookups are cached in Redis for 5 minutes.
 * If Redis is unavailable, the DB fallback is always preserved.
 *
 * Cache key: mw:subdomain:<subdomain> → clinicId (number) or -1 (not found)
 *
 * @returns clinicId or null if subdomain doesn't map to an active clinic
 */
export async function resolveSubdomainClinicId(subdomain: string): Promise<number | null> {
  const sub = subdomain.toLowerCase();

  // ── Tier 1: In-process env map (free — no I/O) ──────────────────────
  const envMap = getSubdomainEnvMap();
  if (envMap) {
    const envId = envMap.get(sub);
    if (envId !== undefined) {
      logger.debug('[MiddlewareCache] Subdomain resolved via env map', { subdomain: sub, clinicId: envId });
      return envId;
    }
  }

  // ── Tier 2: Redis cache ──────────────────────────────────────────────
  const cacheKey = `subdomain:${sub}`;
  try {
    const cached = await cache.get<number>(cacheKey, { namespace: CACHE_NAMESPACE });
    if (cached !== null) {
      if (cached === -1) {
        logger.debug('[MiddlewareCache] Subdomain resolved via Redis (negative cache)', { subdomain: sub });
        return null;
      }
      logger.debug('[MiddlewareCache] Subdomain resolved via Redis', { subdomain: sub, clinicId: cached });
      return cached;
    }
    logger.debug('[MiddlewareCache] Subdomain cache miss — falling back to DB', { subdomain: sub });
  } catch {
    logger.debug('[MiddlewareCache] Redis unavailable for subdomain lookup — falling back to DB', { subdomain: sub });
  }

  // ── Tier 3: Database fallback ────────────────────────────────────────
  try {
    const clinic = await basePrisma.clinic.findFirst({
      where: {
        subdomain: { equals: subdomain, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const clinicId = clinic?.id ?? null;

    logger.debug('[MiddlewareCache] Subdomain resolved via DB', {
      subdomain: sub,
      clinicId,
    });

    // Cache result (even null as -1 sentinel to prevent repeated DB misses)
    try {
      await cache.set(cacheKey, clinicId ?? -1, {
        ttl: SUBDOMAIN_CACHE_TTL,
        namespace: CACHE_NAMESPACE,
      });
    } catch {
      // Cache write failure is non-critical — next request retries
    }

    return clinicId;
  } catch (err) {
    logger.warn('[MiddlewareCache] Subdomain DB lookup failed — returning null', {
      subdomain: sub,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ============================================================================
// Clinic Access Check (Redis-backed)
// ============================================================================

/**
 * Check if a user (and optionally their provider) has access to a clinic.
 * Uses Redis cache to avoid the Promise.all([userClinic, providerClinic]) DB query.
 *
 * Cache key: mw:clinic-access:<userId>:<clinicId>[:p<providerId>] → boolean
 */
export async function hasClinicAccess(
  userId: number,
  clinicId: number,
  providerId?: number,
): Promise<boolean> {
  const cacheKey = providerId
    ? `clinic-access:${userId}:${clinicId}:p${providerId}`
    : `clinic-access:${userId}:${clinicId}`;

  try {
    const cached = await cache.get<boolean>(cacheKey, { namespace: CACHE_NAMESPACE });
    if (cached !== null) {
      return cached;
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  // DB fallback: check UserClinic and ProviderClinic in parallel
  try {
    const [uc, pc] = await Promise.all([
      basePrisma.userClinic.findFirst({
        where: { userId, clinicId, isActive: true },
        select: { id: true },
      }),
      providerId
        ? basePrisma.providerClinic.findFirst({
            where: { providerId, clinicId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    const hasAccess = !!uc || !!pc;

    // Cache the result
    try {
      await cache.set(cacheKey, hasAccess, {
        ttl: CLINIC_ACCESS_CACHE_TTL,
        namespace: CACHE_NAMESPACE,
      });
    } catch {
      // Cache write failure is non-critical
    }

    return hasAccess;
  } catch {
    return false;
  }
}

// ============================================================================
// Session Activity Tracking (Redis-only)
// ============================================================================

/**
 * Track user session activity in Redis only.
 * This replaces the fire-and-forget $executeRaw UPDATE on UserSession
 * that consumed a DB connection on every authenticated request.
 *
 * A separate cron/background process can batch-sync from Redis to DB
 * for persistent storage. The Redis data is sufficient for real-time
 * "online status" indicators.
 *
 * Cache key: mw:session-activity:<userId> → { lastActivity, ipAddress }
 */
export async function trackSessionActivity(
  userId: number,
  ipAddress: string,
): Promise<void> {
  const throttleKey = `session-activity-throttle:${userId}`;

  try {
    // Throttle: only update once per minute per user
    const alreadyUpdated = await cache.exists(throttleKey, { namespace: CACHE_NAMESPACE });
    if (alreadyUpdated) {
      return;
    }

    // Set throttle marker
    await cache.set(throttleKey, 1, {
      ttl: SESSION_ACTIVITY_THROTTLE_TTL,
      namespace: CACHE_NAMESPACE,
    });

    // Store activity data for real-time presence
    await cache.set(
      `session-activity:${userId}`,
      { lastActivity: new Date().toISOString(), ipAddress },
      { ttl: 3600, namespace: CACHE_NAMESPACE }, // 1 hour TTL
    );
  } catch {
    // Non-critical — silently ignore Redis failures
  }
}

// ============================================================================
// Batch Session Activity Lookup (for User Activity Monitor)
// ============================================================================

interface SessionActivityData {
  lastActivity: string;
  ipAddress: string;
}

/**
 * Get all user IDs with recent session activity from Redis.
 * Used by the User Activity Monitor to supplement DB-based online detection.
 *
 * Scans `mw:session-activity:*` keys, batch-fetches values, and returns only
 * those with activity within the given threshold.
 *
 * @param thresholdMinutes - Consider active if lastActivity is within this many minutes (default 15)
 * @returns Map of userId → { lastActivity, ipAddress } for recently active users
 */
export async function getRecentlyActiveUserIds(
  thresholdMinutes: number = 15,
): Promise<Map<number, SessionActivityData>> {
  const result = new Map<number, SessionActivityData>();
  const threshold = new Date(Date.now() - thresholdMinutes * 60 * 1000);

  try {
    const keys = await cache.keys('mw:session-activity:*');
    if (keys.length === 0) return result;

    const userEntries: { userId: number; cacheKey: string }[] = [];
    for (const key of keys) {
      const match = key.match(/^mw:session-activity:(\d+)$/);
      if (match) {
        userEntries.push({
          userId: parseInt(match[1], 10),
          cacheKey: `session-activity:${match[1]}`,
        });
      }
    }

    if (userEntries.length === 0) return result;

    const cacheKeys = userEntries.map((e) => e.cacheKey);
    const values = await cache.mget<SessionActivityData>(cacheKeys, { namespace: CACHE_NAMESPACE });

    for (let i = 0; i < userEntries.length; i++) {
      const value = values[i];
      if (value && value.lastActivity) {
        const activityTime = new Date(value.lastActivity);
        if (activityTime >= threshold) {
          result.set(userEntries[i].userId, value);
        }
      }
    }
  } catch {
    // Redis unavailable — return empty (DB-based status will still work)
  }

  return result;
}

// ============================================================================
// Cache Invalidation Helpers
// ============================================================================

/**
 * Invalidate clinic access cache for a user (call on clinic switch, role change, etc.)
 */
export async function invalidateClinicAccessCache(
  userId: number,
  clinicId?: number,
): Promise<void> {
  try {
    if (clinicId) {
      await cache.delete(`clinic-access:${userId}:${clinicId}`, { namespace: CACHE_NAMESPACE });
    }
    // For full invalidation without specific clinicId, the TTL will handle expiry
  } catch {
    // Non-critical
  }
}

/**
 * Invalidate subdomain cache (call on clinic subdomain change)
 */
export async function invalidateSubdomainCache(subdomain: string): Promise<void> {
  try {
    await cache.delete(`subdomain:${subdomain.toLowerCase()}`, { namespace: CACHE_NAMESPACE });
  } catch {
    // Non-critical
  }
}
