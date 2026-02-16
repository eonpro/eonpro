import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { standardRateLimit } from '@/lib/rateLimit';
import { notificationService } from '@/services/notification';
import cache from '@/lib/cache/redis';
import { getClinicContext } from '@/lib/db';
import { tenantCacheKey, TENANT_NOTIFICATIONS_NAMESPACE } from '@/lib/cache/tenant-cache-keys';
import { logger } from '@/lib/logger';

const COUNT_CACHE_TTL_SECONDS = 15; // Reduce DB load under connection pool pressure

/** Invalidate cached count for a user in a clinic (call after mark-as-read / archive). Clinic-scoped to avoid cross-tenant cache. */
export async function invalidateNotificationsCountCache(
  userId: number,
  clinicId?: number
): Promise<void> {
  try {
    if (!cache.isReady()) return;
    const cid = clinicId ?? getClinicContext();
    if (cid == null) return; // No clinic context; skip cache invalidation
    const key = tenantCacheKey(cid, 'notifications', 'count', userId);
    await cache.delete(key, { namespace: TENANT_NOTIFICATIONS_NAMESPACE });
  } catch {
    // Non-critical
  }
}

/**
 * GET /api/notifications/count
 * Get unread notification count for badge display.
 * Uses short TTL cache to avoid exhausting the DB connection pool under heavy polling.
 */
async function getUnreadCountHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const clinicId = getClinicContext();
    if (clinicId == null) {
      // Super admins have no clinic context by design — return 0 instead of 400
      const res = NextResponse.json({ count: 0 });
      res.headers.set('Cache-Control', 'private, max-age=60');
      return res;
    }
    const cacheKey = tenantCacheKey(clinicId, 'notifications', 'count', user.id);

    if (cache.isReady()) {
      const cached = await cache.get<{ count: number }>(cacheKey, {
        namespace: TENANT_NOTIFICATIONS_NAMESPACE,
      });
      if (cached != null && typeof cached.count === 'number') {
        const res = NextResponse.json({ count: cached.count });
        res.headers.set('Cache-Control', 'private, max-age=15');
        return res;
      }
    }

    const count = await notificationService.getUnreadCount(user.id);

    if (cache.isReady()) {
      await cache.set(cacheKey, { count }, {
        namespace: TENANT_NOTIFICATIONS_NAMESPACE,
        ttl: COUNT_CACHE_TTL_SECONDS,
      });
    }

    const res = NextResponse.json({ count });
    res.headers.set('Cache-Control', 'private, max-age=15');
    return res;
  } catch (error) {
    const err = error as { code?: string };
    const isPoolExhausted = err?.code === 'P2024';
    if (isPoolExhausted) {
      logger.warn('[Notifications Count] Connection pool busy (P2024), returning cached 0');
    } else {
      logger.error('[Notifications Count] Error', { error: error instanceof Error ? error.message : String(error) });
    }
    // Return 0 on any error - notifications are non-critical; avoid retries on pool exhaustion
    const res = NextResponse.json({ count: 0 });
    if (isPoolExhausted) res.headers.set('Cache-Control', 'private, max-age=60');
    return res;
  }
}

export const GET = standardRateLimit(withAuth(getUnreadCountHandler));
