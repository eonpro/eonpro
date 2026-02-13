/**
 * Tenant-scoped cache keys – prevents cross-tenant cache collisions.
 * Use for any cache entry that is specific to a clinic (e.g. notifications count per clinic, branding).
 *
 * @module lib/cache/tenant-cache-keys
 */

/**
 * Build a cache key that includes tenant (clinic) ID.
 * Use for: notification counts, user-online status per clinic, per-clinic rate limits, etc.
 *
 * @example
 * tenantCacheKey(clinicId, 'notifications', 'count', userId) => "5:notifications:count:123"
 */
export function tenantCacheKey(clinicId: number, ...parts: (string | number)[]): string {
  const safe = parts.map((p) => String(p).replace(/:/g, '_'));
  return [clinicId, ...safe].join(':');
}

/**
 * Namespace for tenant-scoped notification count (use with cache.get/set namespace).
 * Key body should be from tenantCacheKey(clinicId, 'count', userId).
 */
export const TENANT_NOTIFICATIONS_NAMESPACE = 'notifications:tenant';

/**
 * Namespace for tenant-scoped rate limits (use with rate limiter).
 * Key body: tenantCacheKey(clinicId, 'ip', ip) or tenantCacheKey(clinicId, 'user', userId).
 */
export const TENANT_RATELIMIT_NAMESPACE = 'ratelimit:tenant';
