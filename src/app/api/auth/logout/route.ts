/**
 * Logout endpoint
 *
 * Terminates the user session and clears authentication cookies.
 * HIPAA Compliant: Logs all logout events for audit trail.
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

/**
 * POST /api/auth/logout
 * Logout endpoint - terminates session and clears cookies
 */
export async function POST(req: NextRequest) {
  try {
    // Get token from Authorization header or cookies
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    let userId: string | undefined;
    let sessionId: string | undefined;
    let userRole: string | undefined;
    let clinicId: number | undefined;

    // Try to decode token to get user info for audit logging
    if (token) {
      try {
        const { payload } = await jwtVerify(token, JWT_SECRET);
        userId = String(payload.id || payload.userId);
        sessionId = payload.sessionId as string;
        userRole = payload.role as string;
        clinicId = payload.clinicId as number;

        // Terminate session if sessionId exists
        if (sessionId) {
          await terminateSession(sessionId, 'user_logout', req);
        }

        // Also invalidate any UserSession records in database
        if (userId) {
          try {
            // Delete user sessions by truncated token
            const tokenPrefix = token.substring(0, 64);
            await prisma.userSession.deleteMany({
              where: {
                OR: [
                  { userId: parseInt(userId, 10) },
                  { token: tokenPrefix },
                ],
              },
            });
          } catch (dbError) {
            // UserSession table might not exist or query might fail
            logger.debug('[Logout] UserSession cleanup skipped', {
              error: dbError instanceof Error ? dbError.message : 'Unknown error',
            });
          }
        }

        // Audit log the logout
        await auditLog(req, {
          userId,
          userRole,
          clinicId,
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
      } catch (verifyError) {
        // Token is invalid or expired, but we still want to clear cookies
        logger.debug('[Logout] Token verification failed during logout', {
          error: verifyError instanceof Error ? verifyError.message : 'Unknown error',
        });
      }
    }

    // Prepare response
    const response = NextResponse.json({ success: true });

    // Clear all authentication cookies
    const cookieStore = await cookies();
    const cookieNames = [
      'auth-token',
      'admin-token',
      'provider-token',
      'patient-token',
      'influencer-token',
      'super_admin-token',
      'staff-token',
      'support-token',
    ];

    // Delete cookies via cookieStore
    for (const name of cookieNames) {
      try {
        cookieStore.delete(name);
      } catch {
        // Cookie might not exist, ignore
      }
    }

    // Also set expired cookies in response (belt and suspenders approach)
    for (const name of cookieNames) {
      response.cookies.set({
        name,
        value: '',
        ...AUTH_CONFIG.cookie,
        maxAge: 0,
        expires: new Date(0),
      });
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Logout] Error during logout', { error: errorMessage });

    // Even on error, clear cookies and return success
    // User should still be logged out client-side
    const response = NextResponse.json({ success: true });

    const cookieNames = [
      'auth-token',
      'admin-token',
      'provider-token',
      'patient-token',
      'influencer-token',
      'super_admin-token',
    ];

    for (const name of cookieNames) {
      response.cookies.set({
        name,
        value: '',
        ...AUTH_CONFIG.cookie,
        maxAge: 0,
        expires: new Date(0),
      });
    }

    return response;
  }
}
