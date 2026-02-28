/**
 * Token refresh endpoint
 * Enterprise: hashed storage, rotate on use, revoke all on reuse.
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { JWT_SECRET, JWT_REFRESH_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { logger } from '@/lib/logger';
import { basePrisma as prisma } from '@/lib/db';
import {
  hashRefreshToken,
  findSessionByRefreshHash,
  handleRefreshTokenReuse,
  rotateSessionRefreshToken,
} from '@/lib/auth/refresh-token-rotation';
import { createSessionRecord } from '@/lib/auth/session-manager';
import { withApiHandler } from '@/domains/shared/errors';
import {
  getRequestHostWithUrlFallback,
  shouldUseEonproCookieDomain,
} from '@/lib/request-host';

async function refreshTokenHandler(req: NextRequest) {
  try {
    // Get refresh token from Authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Refresh token required in Authorization header' },
        { status: 401 }
      );
    }

    const refreshToken = authHeader.slice(7);

    // Verify refresh token — use JWT_REFRESH_SECRET; fall back to JWT_SECRET for
    // tokens issued before the secret separation (graceful migration).
    let payload;
    try {
      const result = await jwtVerify(refreshToken, JWT_REFRESH_SECRET);
      payload = result.payload;
    } catch {
      // Fallback: try the old shared secret for tokens issued before the migration
      try {
        const fallbackResult = await jwtVerify(refreshToken, JWT_SECRET);
        payload = fallbackResult.payload;
        logger.warn('Refresh token verified with legacy JWT_SECRET — will rotate to JWT_REFRESH_SECRET');
      } catch {
        logger.warn('Invalid refresh token attempt');
        return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
      }
    }

    // Check if it's a refresh token
    if (payload.type !== 'refresh') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    // Get user based on ID and role from the token
    const userId = payload.id as number;

    // Since we don't store the role in refresh token, we need to check multiple tables
    // In production, you'd want to store user sessions in a dedicated table

    // Try provider first
    const providerUser = await prisma.provider.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true, clinicId: true },
    });

    if (providerUser) {
      // Create session record so production auth (validateSession) can find it
      const { sessionId } = await createSessionRecord(
        String(providerUser.id),
        'provider',
        providerUser.clinicId ?? undefined,
        req
      );

      const tokenPayload: Record<string, unknown> = {
        id: providerUser.id,
        email: providerUser.email || '',
        name: `${providerUser.firstName} ${providerUser.lastName}`,
        role: 'provider',
        sessionId,
      };
      if (providerUser.clinicId != null) tokenPayload.clinicId = providerUser.clinicId;

      const newAccessToken = await new SignJWT(tokenPayload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.provider)
        .sign(JWT_SECRET);

      // Create new refresh token (signed with dedicated refresh secret)
      const newRefreshToken = await new SignJWT({
        id: providerUser.id,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_REFRESH_SECRET);

      logger.info('Token refreshed for provider', { userId: providerUser.id });

      const response = NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: providerUser.id,
          email: providerUser.email,
          name: `${providerUser.firstName} ${providerUser.lastName}`,
          role: 'provider',
        },
      });

      // Set httpOnly cookies so the browser uses the refreshed token on next request
      const host = getRequestHostWithUrlFallback(req);
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      response.cookies.set({
        name: 'auth-token',
        value: newAccessToken,
        ...AUTH_CONFIG.cookie,
        maxAge: 60 * 60 * 24,
        ...(cookieDomain && { domain: cookieDomain }),
      });
      response.cookies.set({
        name: 'provider-token',
        value: newAccessToken,
        ...AUTH_CONFIG.cookie,
        maxAge: 60 * 60 * 24,
        ...(cookieDomain && { domain: cookieDomain }),
      });

      return response;
    }

    // User table: session-backed rotation + reuse detection (when session has refreshTokenHash)
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await findSessionByRefreshHash(tokenHash);

    if (session) {
      const appUser = session.user;
      if (appUser) {
        // Create session record so production auth (validateSession) can find it
        const userRole = String(appUser.role).toLowerCase();
        let userClinicId = (appUser as { clinicId?: number }).clinicId ?? null;

        // Resolve clinicId from related records when User.clinicId is null.
        // During login, clinicId is resolved from subdomain/UserClinic/Patient fallbacks,
        // but the refresh path previously only read User.clinicId. When it was null,
        // the refreshed token lacked clinicId, causing TenantContextRequiredError (500s)
        // on every subsequent API call for that patient.
        if (userClinicId == null) {
          try {
            const patientId = (appUser as { patientId?: number }).patientId;
            if (userRole === 'patient' && patientId) {
              const patient = await prisma.patient.findUnique({
                where: { id: patientId },
                select: { clinicId: true },
              });
              if (patient?.clinicId) userClinicId = patient.clinicId;
            }
            if (userClinicId == null) {
              const uc = await prisma.userClinic.findFirst({
                where: { userId: appUser.id, isActive: true },
                select: { clinicId: true },
                orderBy: { createdAt: 'desc' },
              });
              if (uc?.clinicId) userClinicId = uc.clinicId;
            }
          } catch (err) {
            logger.warn('[RefreshToken] clinicId resolution fallback failed', {
              userId: appUser.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const { sessionId } = await createSessionRecord(
          String(appUser.id),
          userRole,
          userClinicId ?? undefined,
          req
        );

        const expiry =
          userRole === 'patient'
            ? AUTH_CONFIG.tokenExpiry.patient
            : AUTH_CONFIG.tokenExpiry.access;
        const tokenPayload: Record<string, unknown> = {
          id: appUser.id,
          email: appUser.email,
          name: `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email,
          role: appUser.role,
          sessionId,
        };
        if (userClinicId != null) tokenPayload.clinicId = userClinicId;
        if (userRole === 'patient' && userClinicId == null) {
          logger.warn('[RefreshToken] Patient token refreshed without clinicId', {
            userId: appUser.id,
            patientId: (appUser as { patientId?: number }).patientId,
          });
        }
        if ((appUser as { providerId?: number }).providerId != null)
          tokenPayload.providerId = (appUser as { providerId?: number }).providerId;
        if ((appUser as { patientId?: number }).patientId != null)
          tokenPayload.patientId = (appUser as { patientId?: number }).patientId;
        // Compute effective permissions from role defaults + per-user overrides
        {
          const {
            getEffectivePermissionStrings,
            getEffectiveFeatureStrings,
            parseOverrides,
          } = await import('@/lib/auth/permissions');

          const permOverrides = parseOverrides(
            (appUser as { permissions?: unknown }).permissions,
          );
          const featOverrides = parseOverrides(
            (appUser as { features?: unknown }).features,
          );

          tokenPayload.permissions = getEffectivePermissionStrings(userRole, permOverrides);
          tokenPayload.features = getEffectiveFeatureStrings(userRole, featOverrides);
        }

        const newAccessToken = await new SignJWT(tokenPayload)
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(expiry)
          .sign(JWT_SECRET);

        const newRefreshToken = await new SignJWT({
          id: appUser.id,
          type: 'refresh',
        })
          .setProtectedHeader({ alg: 'HS256' })
          .setIssuedAt()
          .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
          .sign(JWT_REFRESH_SECRET);

        await rotateSessionRefreshToken(session.id, newRefreshToken);

        logger.info('Token refreshed for user', {
          userId: appUser.id,
          role: appUser.role,
          clinicId: userClinicId ?? undefined,
        });

        const response = NextResponse.json({
          token: newAccessToken,
          refreshToken: newRefreshToken,
          user: {
            id: appUser.id,
            email: appUser.email,
            firstName: appUser.firstName,
            lastName: appUser.lastName,
            name: `${appUser.firstName || ''} ${appUser.lastName || ''}`.trim() || appUser.email,
            role: appUser.role,
            clinicId: userClinicId ?? undefined,
            providerId: (appUser as { providerId?: number }).providerId ?? undefined,
            patientId: (appUser as { patientId?: number }).patientId ?? undefined,
          },
        });

        // Set httpOnly cookies so the browser uses the refreshed token on next request
        const host = getRequestHostWithUrlFallback(req);
        const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
        const roleCookieName = `${userRole}-token`;
        response.cookies.set({
          name: 'auth-token',
          value: newAccessToken,
          ...AUTH_CONFIG.cookie,
          maxAge: 60 * 60 * 24,
          ...(cookieDomain && { domain: cookieDomain }),
        });
        response.cookies.set({
          name: roleCookieName,
          value: newAccessToken,
          ...AUTH_CONFIG.cookie,
          maxAge: 60 * 60 * 24,
          ...(cookieDomain && { domain: cookieDomain }),
        });

        return response;
      }
    }

    // No session with this hash: differentiate legacy (REAUTH) vs reuse (TOKEN_REUSE)
    const userExists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (userExists) {
      const hasRotatedSessions = await prisma.userSession.count({
        where: { userId, refreshTokenHash: { not: null } },
      });
      if (hasRotatedSessions > 0) {
        await handleRefreshTokenReuse(userId);
        return NextResponse.json(
          { error: 'Refresh token was already used. Please log in again.', code: 'TOKEN_REUSE' },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { error: 'Please log in again.', code: 'REAUTH_REQUIRED' },
        { status: 401 }
      );
    }

    // Check for admin (special case)
    if (userId === 0 && process.env.ADMIN_EMAIL) {
      // Create session record so production auth (validateSession) can find it
      const { sessionId } = await createSessionRecord(
        '0',
        'admin',
        undefined,
        req
      );

      const newAccessToken = await new SignJWT({
        id: 0,
        email: process.env.ADMIN_EMAIL,
        name: 'Admin',
        role: 'admin',
        sessionId,
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
        .sign(JWT_SECRET);

      const newRefreshToken = await new SignJWT({
        id: 0,
        type: 'refresh',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
        .sign(JWT_REFRESH_SECRET);

      logger.info(`Token refreshed for admin`);

      const response = NextResponse.json({
        token: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: 0,
          email: process.env.ADMIN_EMAIL,
          name: 'Admin',
          role: 'admin',
        },
      });

      // Set httpOnly cookies so the browser uses the refreshed token on next request
      const host = getRequestHostWithUrlFallback(req);
      const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;
      response.cookies.set({
        name: 'auth-token',
        value: newAccessToken,
        ...AUTH_CONFIG.cookie,
        maxAge: 60 * 60 * 24,
        ...(cookieDomain && { domain: cookieDomain }),
      });
      response.cookies.set({
        name: 'admin-token',
        value: newAccessToken,
        ...AUTH_CONFIG.cookie,
        maxAge: 60 * 60 * 24,
        ...(cookieDomain && { domain: cookieDomain }),
      });

      return response;
    }

    // No user found
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  } catch (error: unknown) {
    logger.error('Token refresh error:', error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
  }
}

export const POST = withApiHandler(refreshTokenHandler);
