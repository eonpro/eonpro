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

// Cache TTLs (seconds)
const SUBDOMAIN_CACHE_TTL = 300; // 5 minutes
const CLINIC_ACCESS_CACHE_TTL = 300; // 5 minutes
const SESSION_ACTIVITY_THROTTLE_TTL = 60; // 1 minute

const CACHE_NAMESPACE = 'mw'; // short namespace for middleware caches

// ============================================================================
// Subdomain → Clinic ID Resolution (Redis-backed)
// ============================================================================

/**
 * Resolve subdomain to clinicId using Redis cache with DB fallback.
 * Eliminates the basePrisma.clinic.findFirst call on every request.
 *
 * Cache key: mw:subdomain:<subdomain> → clinicId (number) or -1 (not found)
 *
 * @returns clinicId or null if subdomain doesn't map to an active clinic
 */
export async function resolveSubdomainClinicId(subdomain: string): Promise<number | null> {
  const key = `subdomain:${subdomain.toLowerCase()}`;

  try {
    // Check Redis first
    const cached = await cache.get<number>(key, { namespace: CACHE_NAMESPACE });
    if (cached !== null) {
      // -1 sentinel means "known not to exist" — avoid repeated DB lookups
      return cached === -1 ? null : cached;
    }
  } catch {
    // Redis unavailable — fall through to DB
  }

  // DB fallback
  try {
    const clinic = await basePrisma.clinic.findFirst({
      where: {
        subdomain: { equals: subdomain, mode: 'insensitive' },
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    const clinicId = clinic?.id ?? null;

    // Cache result (even null as -1 sentinel to prevent repeated DB misses)
    try {
      await cache.set(key, clinicId ?? -1, {
        ttl: SUBDOMAIN_CACHE_TTL,
        namespace: CACHE_NAMESPACE,
      });
    } catch {
      // Cache write failure is non-critical
    }

    return clinicId;
  } catch (err) {
    logger.warn('[MiddlewareCache] Subdomain clinic lookup failed', {
      subdomain,
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
