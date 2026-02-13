/**
 * Admin Rate Limit Management API
 *
 * Allows administrators to view and manage rate limits.
 * Enterprise feature for unblocking legitimate users.
 *
 * GET  /api/admin/rate-limits - Get rate limit status
 * POST /api/admin/rate-limits/clear - Clear rate limits
 *
 * @module api/admin/rate-limits
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import {
  adminGetRateLimitStatus,
  adminClearRateLimit,
  RateLimitStatus,
} from '@/lib/security/enterprise-rate-limiter';
import { logger } from '@/lib/logger';

// ============================================================================
// GET - View Rate Limit Status
// ============================================================================

interface GetStatusRequest {
  ip?: string;
  email?: string;
}

async function getStatusHandler(
  request: NextRequest,
  user: { id: number; role: string }
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get('ip');
    const email = searchParams.get('email');

    if (!ip && !email) {
      return NextResponse.json({ error: 'IP address or email required' }, { status: 400 });
    }

    const status = await adminGetRateLimitStatus(ip || 'unknown', email || undefined);

    // Log admin access
    logger.info('[RateLimitAdmin] Status viewed', {
      adminId: user.id,
      targetIp: ip,
      targetEmail: email ? `${email.substring(0, 3)}***` : undefined,
    });

    return NextResponse.json({
      success: true,
      status: {
        ip: status.ip,
        email: status.email,
        isTrustedNetwork: status.isTrustedNetwork,
        effectiveLimits: status.effectiveLimits,
        ipStatus: status.ipEntry
          ? {
              attempts: status.ipEntry.attempts,
              isBlocked: status.ipEntry.blocked,
              blockedUntil: status.ipEntry.blockedUntil
                ? new Date(status.ipEntry.blockedUntil * 1000).toISOString()
                : null,
              securityLevel: status.ipEntry.securityLevel,
              captchaRequired: status.ipEntry.captchaRequired,
              emailVerificationRequired: status.ipEntry.emailVerificationRequired,
              firstAttempt: new Date(status.ipEntry.firstAttempt * 1000).toISOString(),
              lastAttempt: new Date(status.ipEntry.lastAttempt * 1000).toISOString(),
            }
          : null,
        emailStatus: status.emailEntry
          ? {
              attempts: status.emailEntry.attempts,
              isBlocked: status.emailEntry.blocked,
              blockedUntil: status.emailEntry.blockedUntil
                ? new Date(status.emailEntry.blockedUntil * 1000).toISOString()
                : null,
              securityLevel: status.emailEntry.securityLevel,
              captchaRequired: status.emailEntry.captchaRequired,
              emailVerificationRequired: status.emailEntry.emailVerificationRequired,
              firstAttempt: new Date(status.emailEntry.firstAttempt * 1000).toISOString(),
              lastAttempt: new Date(status.emailEntry.lastAttempt * 1000).toISOString(),
            }
          : null,
        combinedStatus: status.comboEntry
          ? {
              attempts: status.comboEntry.attempts,
              isBlocked: status.comboEntry.blocked,
              blockedUntil: status.comboEntry.blockedUntil
                ? new Date(status.comboEntry.blockedUntil * 1000).toISOString()
                : null,
              securityLevel: status.comboEntry.securityLevel,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error('[RateLimitAdmin] Get status failed', {
      error,
      adminId: user.id,
    });

    return NextResponse.json({ error: 'Failed to get rate limit status' }, { status: 500 });
  }
}

// ============================================================================
// POST - Clear Rate Limits
// ============================================================================

interface ClearRequest {
  ip?: string;
  email?: string;
  reason?: string;
}

async function clearHandler(
  request: NextRequest,
  user: { id: number; role: string; email: string }
): Promise<NextResponse> {
  try {
    const body: ClearRequest = await request.json();
    const { ip, email, reason } = body;

    if (!ip && !email) {
      return NextResponse.json({ error: 'IP address or email required' }, { status: 400 });
    }

    // Get current status before clearing (for audit)
    const statusBefore = await adminGetRateLimitStatus(ip || 'unknown', email);

    // Clear the rate limit
    const result = await adminClearRateLimit(ip, email, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Log admin action with full audit trail
    logger.security('[RateLimitAdmin] Rate limit cleared', {
      adminId: user.id,
      adminEmail: user.email,
      action: 'RATE_LIMIT_CLEAR',
      targetIp: ip,
      targetEmail: email ? `${email.substring(0, 3)}***` : undefined,
      reason: reason || 'No reason provided',
      statusBefore: {
        ipAttempts: statusBefore.ipEntry?.attempts || 0,
        emailAttempts: statusBefore.emailEntry?.attempts || 0,
        wasBlocked: statusBefore.ipEntry?.blocked || statusBefore.emailEntry?.blocked || false,
      },
    });

    return NextResponse.json({
      success: true,
      message: result.message,
      clearedAt: new Date().toISOString(),
      clearedBy: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    logger.error('[RateLimitAdmin] Clear failed', {
      error,
      adminId: user.id,
    });

    return NextResponse.json({ error: 'Failed to clear rate limit' }, { status: 500 });
  }
}

// ============================================================================
// Export with Admin Auth
// ============================================================================

export const GET = withAdminAuth(getStatusHandler);
export const POST = withAdminAuth(clearHandler);
