/**
 * Logout endpoint
 *
 * Terminates the user session and clears authentication cookies.
 * HIPAA Compliant: Logs all logout events for audit trail.
 *
 * Responds immediately with cleared cookies to avoid Vercel timeout when
 * the DB connection pool is exhausted; session/audit cleanup runs best-effort in background.
 *
 * @module api/auth/logout
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { terminateSession } from '@/lib/auth/session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import { getRequestHostWithUrlFallback, shouldUseEonproCookieDomain } from '@/lib/request-host';
import { withApiHandler } from '@/domains/shared/errors';

const LOGOUT_CLEANUP_TIMEOUT_MS = 4000; // Don't block response; avoid holding DB connection

const COOKIE_NAMES = [
  'auth-token',
  'admin-token',
  'provider-token',
  'patient-token',
  'affiliate-token',
  'super_admin-token',
  'staff-token',
  'support-token',
  'selected-clinic', // So next visit doesn't use stale clinic context (critical for ot.eonpro.io and multi-subdomain)
];

/**
 * Clear auth cookies on BOTH the shared .eonpro.io domain AND the hostname
 * (e.g. app.eonpro.io). Hostname-only cookies take precedence in the browser's
 * Cookie header, so a stale hostname-only httpOnly cookie would shadow the
 * domain cookie and cause auth issues (e.g. 403 "Insufficient permissions").
 *
 * NOTE: response.cookies.set() uses cookie name as key and overwrites, so we
 * use response.headers.append('Set-Cookie', ...) for one layer and the
 * cookies API for the other to ensure both are sent.
 */
function clearCookiesOnResponse(response: NextResponse, req: NextRequest): void {
  const host = getRequestHostWithUrlFallback(req);
  const isEonproIo = shouldUseEonproCookieDomain(host);
  const isSecure = process.env.NODE_ENV === 'production';

  for (const name of COOKIE_NAMES) {
    // Layer 1: Clear hostname-only cookies via raw Set-Cookie header
    // (no domain attribute = applies to current hostname only)
    response.headers.append(
      'Set-Cookie',
      `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${isSecure ? '; Secure' : ''}`
    );

    // Layer 2: Clear .eonpro.io domain cookies via response.cookies API
    if (isEonproIo) {
      response.cookies.set({
        name,
        value: '',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        httpOnly: true,
        sameSite: 'lax',
        secure: isSecure,
        domain: '.eonpro.io',
      });
    }
  }
}

/**
 * POST /api/auth/logout
 * Logout endpoint - clears cookies and returns immediately; session/audit cleanup is best-effort.
 */
async function logoutHandler(req: NextRequest) {
  try {
    let userId: string | undefined;
    let sessionId: string | undefined;
    let userRole: string | undefined;
    let clinicId: number | undefined;
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Decode token only for audit context (fast, no DB)
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = String(payload.id || payload.userId);
        sessionId = payload.sessionId as string;
        userRole = payload.role as string;
        clinicId = payload.clinicId as number;
      } catch {
        // Invalid/expired token - still clear cookies
      }
    }

    // Build response and clear cookies first so we never block on DB
    const response = NextResponse.json({ success: true });
    clearCookiesOnResponse(response, req);

    const cookieStore = await cookies();
    for (const name of COOKIE_NAMES) {
      try {
        cookieStore.delete(name);
      } catch {
        // ignore
      }
    }

    // Best-effort cleanup in background so logout never times out when pool is exhausted
    if (token && (sessionId || userId)) {
      const cleanup = async () => {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Logout cleanup timeout')), LOGOUT_CLEANUP_TIMEOUT_MS)
        );
        await Promise.race([
          (async () => {
            if (sessionId) await terminateSession(sessionId, 'user_logout', req);
            if (userId) {
              try {
                const tokenPrefix = token.substring(0, 64);
                await prisma.userSession.deleteMany({
                  where: {
                    OR: [{ userId: parseInt(userId!, 10) }, { token: tokenPrefix }],
                  },
                });
              } catch (dbError) {
                logger.debug('[Logout] UserSession cleanup skipped', {
                  error: dbError instanceof Error ? dbError.message : 'Unknown error',
                });
              }
            }
            await auditLog(req, {
              userId: userId ?? 'anonymous',
              userRole,
              clinicId: clinicId ?? undefined,
              eventType: AuditEventType.LOGOUT,
              resourceType: 'Session',
              resourceId: sessionId || 'unknown',
              action: 'LOGOUT',
              outcome: 'SUCCESS',
            });
            logger.info('[Logout] User logged out successfully', {
              userId,
              role: userRole,
              clinicId,
            });
          })(),
          timeout,
        ]);
      };
      cleanup().catch((err) => {
        logger.warn('[Logout] Background cleanup failed (user still logged out)', {
          error: err instanceof Error ? err.message : String(err),
          userId,
        });
      });
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Logout] Error during logout', { error: errorMessage });
    const response = NextResponse.json({ success: true });
    clearCookiesOnResponse(response, req);
    return response;
  }
}

export const POST = withApiHandler(logoutHandler);
