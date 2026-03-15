/**
 * Emergency Rate Limit Flush
 *
 * Clears ALL auth rate-limit keys from Redis and in-memory cache.
 * Requires super_admin authentication — this is a dangerous operation.
 *
 * POST /api/admin/emergency-flush-rate-limits
 */

import { NextRequest, NextResponse } from 'next/server';
import { withSuperAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { emergencyFlushAllAuthRateLimits } from '@/lib/security/enterprise-rate-limiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const result = await emergencyFlushAllAuthRateLimits();

    logger.security('[EmergencyFlush] Rate limits flushed', {
      cleared: result.cleared,
      userId: user.id,
      ip: req.headers.get('x-forwarded-for') || 'unknown',
    });

    return NextResponse.json({
      success: true,
      cleared: result.cleared,
      message: `Flushed ${result.cleared} rate-limit entries. All accounts are now unlocked.`,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[EmergencyFlush] Failed', { error: err });
    return NextResponse.json({ error: 'Flush failed' }, { status: 500 });
  }
}

export const POST = withSuperAdminAuth(handler);
