/**
 * Emergency Rate Limit Flush
 *
 * Clears ALL auth rate-limit keys from Redis and in-memory cache.
 * Authenticated via CRON_SECRET header (no user auth required since
 * the purpose is to recover from a state where nobody can log in).
 *
 * POST /api/admin/emergency-flush-rate-limits
 * Header: x-cron-secret: <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { emergencyFlushAllAuthRateLimits } from '@/lib/security/enterprise-rate-limiter';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await emergencyFlushAllAuthRateLimits();

    logger.security('[EmergencyFlush] Rate limits flushed', {
      cleared: result.cleared,
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
