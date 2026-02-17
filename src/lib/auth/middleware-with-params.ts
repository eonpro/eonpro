/**
 * Authentication Middleware for API Routes with Dynamic Parameters
 * Handles Next.js App Router routes that need context parameter
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from './config';
import { setClinicContext, basePrisma } from '@/lib/db';
import { validateSession } from './session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import type { AuthUser } from './middleware';

// Re-export AuthUser type for convenience
export type { AuthUser };

async function hasAccessToClinic(user: AuthUser, clinicId: number): Promise<boolean> {
  try {
    const [uc, pc] = await Promise.all([
      basePrisma.userClinic.findFirst({
        where: { userId: user.id, clinicId, isActive: true },
        select: { id: true },
      }),
      user.providerId
        ? basePrisma.providerClinic.findFirst({
            where: { providerId: user.providerId, clinicId, isActive: true },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return !!uc || !!pc;
  } catch {
    return false;
  }
}

/**
 * Verify JWT token from various sources
 *
 * SECURITY: Demo tokens are DISABLED in production environments.
 * They are only available when NODE_ENV !== 'production' AND
 * ENABLE_DEMO_TOKENS === 'true' (explicit opt-in required).
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  // SECURITY: Demo tokens only work in non-production with explicit flag
  const isDemoEnabled =
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_TOKENS === 'true';

  if (isDemoEnabled && token.includes('demo-')) {
    // Demo tokens for development/testing only
    // WARNING: Never enable in production!
    const demoUsers: Record<string, AuthUser> = {
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBsaWZlZmlsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJjbGluaWNJZCI6MX0.demo-admin-token':
        {
          id: 1,
          email: 'admin@eonpro.com',
          role: 'admin',
          clinicId: 1,
        },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZW1haWwiOiJwcm92aWRlckBsaWZlZmlsZS5jb20iLCJyb2xlIjoicHJvdmlkZXIiLCJjbGluaWNJZCI6MX0.demo-provider-token':
        {
          id: 2,
          email: 'provider@eonpro.com',
          role: 'provider',
          clinicId: 1,
        },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiZW1haWwiOiJzdGFmZkBsaWZlZmlsZS5jb20iLCJyb2xlIjoic3RhZmYiLCJjbGluaWNJZCI6MX0.demo-staff-token':
        {
          id: 3,
          email: 'staff@eonpro.com',
          role: 'staff',
          clinicId: 1,
        },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwiZW1haWwiOiJzdXBwb3J0QGxpZmVmaWxlLmNvbSIsInJvbGUiOiJzdXBwb3J0IiwiY2xpbmljSWQiOjF9.demo-support-token':
        {
          id: 4,
          email: 'support@eonpro.com',
          role: 'support',
          clinicId: 1,
        },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NSwiZW1haWwiOiJwYXRpZW50QGV4YW1wbGUuY29tIiwicm9sZSI6InBhdGllbnQiLCJjbGluaWNJZCI6MX0.demo-patient-token':
        {
          id: 5,
          email: 'patient@example.com',
          role: 'patient',
          clinicId: 1,
          patientId: 1,
        },
    };

    return demoUsers[token] || null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthUser;
  } catch {
    return null;
  }
}

/**
 * Extract token from request
 *
 * IMPORTANT: Cookie order is route-aware to prevent cross-portal token
 * collisions. Affiliate cookies are only prioritised on affiliate routes;
 * otherwise `auth-token` and role-specific cookies come first so that a
 * stale `affiliate_session` cookie cannot shadow the admin/provider token
 * and cause 403s on non-affiliate endpoints (e.g. portal-invite).
 */
function extractToken(req: NextRequest): string | null {
  // Priority 1: Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Priority 2: HTTP-only cookies — order depends on the route being accessed
  const pathname = req.nextUrl.pathname;
  const isAffiliateRoute =
    pathname.startsWith('/api/affiliate') || pathname.startsWith('/affiliate');

  const cookieTokens = isAffiliateRoute
    ? [
        // Affiliate routes: prefer affiliate-specific cookies
        'affiliate_session',
        'affiliate-token',
        'auth-token',
        'super_admin-token',
        'admin-token',
        'provider-token',
        'patient-token',
        'staff-token',
        'support-token',
        'token',
        'SUPER_ADMIN-token',
      ]
    : [
        // All other routes: prefer general auth / role-specific cookies
        'auth-token',
        'super_admin-token',
        'admin-token',
        'provider-token',
        'patient-token',
        'staff-token',
        'support-token',
        // Affiliate cookies last — only used as fallback for non-affiliate routes
        'affiliate_session',
        'affiliate-token',
        'token',
        'SUPER_ADMIN-token',
      ];

  for (const cookieName of cookieTokens) {
    const token = req.cookies.get(cookieName)?.value;
    if (token) {
      return token;
    }
  }
  return null;
}

/**
 * Options for authentication middleware
 */
interface AuthOptions {
  roles?: string[];
  optional?: boolean;
}

/**
 * Authentication middleware for routes with params
 * Handles the App Router context parameter
 */
export function withAuthParams<T extends { params: any }>(
  handler: (req: NextRequest, user: AuthUser, context: T) => Promise<Response>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest, context: T) => {
    const token = extractToken(req);

    if (!token) {
      if (options.optional) {
        return handler(req, null as any, context);
      }

      // Log failed authentication
      await auditLog(req, {
        userId: 'unknown',
        eventType: AuditEventType.LOGIN_FAILED,
        resourceType: 'API',
        action: 'AUTHENTICATION_FAILED',
        outcome: 'FAILURE',
        reason: 'No token provided',
      });

      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const user = await verifyToken(token);

    if (!user) {
      if (options.optional) {
        return handler(req, null as any, context);
      }

      // Log failed authentication
      await auditLog(req, {
        userId: 'unknown',
        eventType: AuditEventType.LOGIN_FAILED,
        resourceType: 'API',
        action: 'AUTHENTICATION_FAILED',
        outcome: 'FAILURE',
        reason: 'Invalid or expired token',
      });

      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
    }

    // Validate session (check for timeout)
    // Security: Log tokens without sessionId for monitoring (super_admin may use API tokens without session)
    if (!user.sessionId) {
      const isSuperAdmin = user.role === 'super_admin';
      if (!isSuperAdmin) {
        logger.warn('Token missing sessionId', {
          userId: user.id,
          role: user.role,
          path: req.nextUrl.pathname,
        });
      } else {
        logger.debug('Token missing sessionId (super_admin)', {
          userId: user.id,
          path: req.nextUrl.pathname,
        });
      }
    } else {
      const sessionValidation = await validateSession(token, req);

      if (!sessionValidation.valid) {
        setClinicContext(undefined);

        await auditLog(req, {
          userId: user.id.toString(),
          userEmail: user.email,
          userRole: user.role,
          eventType: AuditEventType.SESSION_TIMEOUT,
          resourceType: 'Session',
          resourceId: user.sessionId,
          action: 'SESSION_VALIDATION_FAILED',
          outcome: 'FAILURE',
          reason: sessionValidation.reason,
        });

        return NextResponse.json(
          { error: sessionValidation.reason || 'Session expired' },
          { status: 401 }
        );
      }
    }

    // Check role-based access
    if (options.roles && options.roles.length > 0) {
      const userRole = user.role.toLowerCase();
      const allowedRoles = options.roles.map((r) => r.toLowerCase());
      if (!allowedRoles.includes(userRole)) {
        await auditLog(req, {
          userId: user.id.toString(),
          userEmail: user.email,
          userRole: user.role,
          clinicId: user.clinicId,
          eventType: AuditEventType.SYSTEM_ACCESS,
          resourceType: 'API',
          action: 'AUTHORIZATION_FAILED',
          outcome: 'FAILURE',
          reason: `Required roles: ${options.roles.join(', ')}`,
        });

        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
      }
    }

    // Resolve effective clinic context
    // For non-super-admin: start with JWT clinicId
    // For super_admin: start undefined, but allow subdomain/header override below
    let effectiveClinicId: number | undefined =
      user.clinicId != null && user.role !== 'super_admin' ? Number(user.clinicId) : undefined;

    // Fallback: if JWT has no clinicId, use the x-clinic-id header set by the edge
    // clinic middleware. This ensures clinic context is always available even when
    // the JWT was minted without clinicId (avoids "No clinic associated" 403s).
    if (effectiveClinicId == null && user.role !== 'super_admin') {
      const headerClinicId = req.headers.get('x-clinic-id');
      if (headerClinicId) {
        const parsed = parseInt(headerClinicId, 10);
        if (!isNaN(parsed) && parsed > 0) {
          effectiveClinicId = parsed;
          logger.info('[AuthParams] Using x-clinic-id header as clinicId fallback', {
            userId: user.id,
            clinicId: parsed,
            jwtClinicId: user.clinicId ?? null,
          });
        }
      }
    }

    // When on a clinic subdomain (e.g. ot.eonpro.io), use that clinic if the user has access
    // so that data shown is scoped to the subdomain's clinic.
    // Super admins also get subdomain clinic context for tenant isolation.
    const subdomain = req.headers.get('x-clinic-subdomain');
    if (
      subdomain &&
      !['www', 'app', 'api', 'admin', 'staging'].includes(subdomain.toLowerCase())
    ) {
      try {
        const subdomainClinic = await basePrisma.clinic.findFirst({
          where: {
            subdomain: { equals: subdomain, mode: 'insensitive' },
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (subdomainClinic && subdomainClinic.id !== effectiveClinicId) {
          const hasAccess =
            user.role === 'super_admin' ||
            user.clinicId === subdomainClinic.id ||
            (await hasAccessToClinic(user, subdomainClinic.id));
          if (hasAccess) {
            effectiveClinicId = subdomainClinic.id;
            logger.debug('[AuthParams] Using subdomain clinic for context', {
              userId: user.id,
              subdomain,
              clinicId: subdomainClinic.id,
            });
          }
        }
      } catch {
        // Keep effectiveClinicId from previous resolution
      }
    }

    // Set clinic context for database queries
    if (effectiveClinicId != null) {
      setClinicContext(effectiveClinicId);
    }

    // Add user to request headers for downstream use
    const modifiedReq = req.clone();
    modifiedReq.headers.set('x-user-id', user.id.toString());
    modifiedReq.headers.set('x-user-role', user.role);
    if (effectiveClinicId != null) {
      modifiedReq.headers.set('x-clinic-id', effectiveClinicId.toString());
    }

    const userForHandler: AuthUser =
      effectiveClinicId !== user.clinicId ? { ...user, clinicId: effectiveClinicId } : user;

    try {
      const response = await handler(modifiedReq as NextRequest, userForHandler, context);

      // Clear clinic context after request
      setClinicContext(undefined);

      return response;
    } catch (error) {
      // Clear clinic context on error
      setClinicContext(undefined);
      throw error;
    }
  };
}
