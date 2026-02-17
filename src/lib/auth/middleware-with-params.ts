/**
 * Authentication Middleware for API Routes with Dynamic Parameters
 * Handles Next.js App Router routes that need context parameter
 *
 * SECURITY HARDENING (2026-02-16):
 * - JWT: algorithm restriction (HS256), clockTolerance, claims validation, token version revocation
 * - Session: "Session not found" carve-out aligned with withAuth
 * - Context: runWithClinicContext (AsyncLocalStorage) replaces deprecated global setClinicContext
 * - Responses: requestId, structured error shape, security headers
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, JWTPayload } from 'jose';
import { JWT_SECRET, AUTH_CONFIG } from './config';
import { runWithClinicContext, basePrisma } from '@/lib/db';
import { validateSession } from './session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import { validateTokenClaims } from './middleware';
import type { AuthUser, UserRole } from './middleware';

// Re-export AuthUser type for convenience
export type { AuthUser };

// ============================================================================
// Types
// ============================================================================

interface TokenValidationResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: 'EXPIRED' | 'INVALID' | 'REVOKED' | 'MALFORMED';
}

interface AuthOptions {
  roles?: string[];
  optional?: boolean;
}

// ============================================================================
// Clinic Access Check
// ============================================================================

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

// ============================================================================
// Token Verification (aligned with withAuth)
// ============================================================================

/**
 * Verify JWT token with full security checks.
 *
 * SECURITY: Demo tokens are DISABLED in production environments.
 * They are only available when NODE_ENV !== 'production' AND
 * ENABLE_DEMO_TOKENS === 'true' (explicit opt-in required).
 */
async function verifyToken(token: string): Promise<TokenValidationResult> {
  // SECURITY: Demo tokens only work in non-production with explicit flag
  const isDemoEnabled =
    process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_TOKENS === 'true';

  if (isDemoEnabled && token.includes('demo-')) {
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

    const demoUser = demoUsers[token];
    if (demoUser) {
      return { valid: true, user: demoUser };
    }
    return { valid: false, error: 'Invalid demo token', errorCode: 'INVALID' };
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });

    // Validate required claims (reused from withAuth)
    const validationError = validateTokenClaims(payload);
    if (validationError) {
      return {
        valid: false,
        error: validationError,
        errorCode: 'MALFORMED',
      };
    }

    // Check token version for revocation
    const tokenVersion = (payload as unknown as AuthUser).tokenVersion || 1;
    if (tokenVersion < AUTH_CONFIG.security.minimumTokenVersion) {
      return {
        valid: false,
        error: 'Token has been revoked',
        errorCode: 'REVOKED',
      };
    }

    const user: AuthUser = {
      id: payload.id as number,
      email: payload.email as string,
      role: payload.role as UserRole,
      clinicId: payload.clinicId as number | undefined,
      sessionId: payload.sessionId as string | undefined,
      providerId: payload.providerId as number | undefined,
      patientId: payload.patientId as number | undefined,
      affiliateId: payload.affiliateId as number | undefined,
      permissions: payload.permissions as string[] | undefined,
      tokenVersion: tokenVersion,
      iat: payload.iat,
      exp: payload.exp,
    };

    return { valid: true, user };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return {
          valid: false,
          error: 'Token has expired',
          errorCode: 'EXPIRED',
        };
      }
      if (error.message.includes('signature')) {
        return {
          valid: false,
          error: 'Invalid token signature',
          errorCode: 'INVALID',
        };
      }
    }

    logger.error('Token verification failed', error as Error);
    return {
      valid: false,
      error: 'Token verification failed',
      errorCode: 'INVALID',
    };
  }
}

// ============================================================================
// Token Extraction
// ============================================================================

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
        'auth-token',
        'super_admin-token',
        'admin-token',
        'provider-token',
        'patient-token',
        'staff-token',
        'support-token',
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

// ============================================================================
// Security Helpers
// ============================================================================

/**
 * Add security headers to response (aligned with withAuth)
 */
function addSecurityHeaders(response: Response, requestId: string): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Request-ID', requestId);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Build a JSON error response with consistent shape and security headers
 */
function errorResponse(
  error: string,
  code: string,
  status: number,
  requestId: string,
): NextResponse {
  const res = NextResponse.json({ error, code, requestId }, { status });
  res.headers.set('X-Request-ID', requestId);
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options', 'DENY');
  return res;
}

// ============================================================================
// Main Authentication Middleware
// ============================================================================

/**
 * Authentication middleware for routes with params
 * Handles the App Router context parameter
 */
export function withAuthParams<T extends { params: any }>(
  handler: (req: NextRequest, user: AuthUser, context: T) => Promise<Response>,
  options: AuthOptions = {}
) {
  return async (req: NextRequest, context: T): Promise<Response> => {
    const requestId = crypto.randomUUID();

    try {
      const token = extractToken(req);

      if (!token) {
        if (options.optional) {
          return handler(req, null as any, context);
        }

        await auditLog(req, {
          userId: 'unknown',
          eventType: AuditEventType.LOGIN_FAILED,
          resourceType: 'API',
          action: 'AUTHENTICATION_FAILED',
          outcome: 'FAILURE',
          reason: 'No token provided',
          metadata: { requestId },
        });

        return errorResponse(
          'Authentication required',
          'AUTH_REQUIRED',
          401,
          requestId,
        );
      }

      // Verify token (now with HS256 restriction, claims validation, revocation check)
      const tokenResult = await verifyToken(token);

      if (!tokenResult.valid || !tokenResult.user) {
        if (options.optional) {
          return handler(req, null as any, context);
        }

        await auditLog(req, {
          userId: 'unknown',
          eventType: AuditEventType.LOGIN_FAILED,
          resourceType: 'API',
          action: 'AUTHENTICATION_FAILED',
          outcome: 'FAILURE',
          reason: tokenResult.error || 'Invalid or expired token',
          metadata: { code: tokenResult.errorCode, requestId },
        });

        return errorResponse(
          tokenResult.error || 'Invalid or expired token',
          tokenResult.errorCode || 'AUTH_FAILED',
          401,
          requestId,
        );
      }

      const user = tokenResult.user;

      // Validate session (check for timeout)
      // Aligned with withAuth: missing sessionId is allowed through (JWT is verified).
      // "Session not found" in Redis is also allowed through (parity carve-out).
      if (!user.sessionId) {
        const isSuperAdmin = user.role === 'super_admin';
        if (!isSuperAdmin) {
          logger.warn('Token missing sessionId — allowing (JWT verified)', {
            userId: user.id,
            role: user.role,
            path: req.nextUrl.pathname,
            requestId,
          });
        } else {
          logger.debug('Token missing sessionId (super_admin)', {
            userId: user.id,
            path: req.nextUrl.pathname,
            requestId,
          });
        }
      } else {
        const sessionValidation = await validateSession(token, req);

        // PARITY FIX: Only block if session is genuinely invalid.
        // "Session not found" in Redis is allowed through (same as withAuth).
        if (!sessionValidation.valid && sessionValidation.reason !== 'Session not found') {
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
            metadata: { requestId },
          });

          return errorResponse(
            sessionValidation.reason || 'Session expired',
            'SESSION_EXPIRED',
            401,
            requestId,
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
            metadata: { requestId },
          });

          return errorResponse(
            'Insufficient permissions',
            'FORBIDDEN',
            403,
            requestId,
          );
        }
      }

      // Resolve effective clinic context
      let effectiveClinicId: number | undefined =
        user.clinicId != null && user.role !== 'super_admin' ? Number(user.clinicId) : undefined;

      // Fallback: x-clinic-id header from Edge middleware
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
              requestId,
            });
          }
        }
      }

      // Subdomain override
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
                requestId,
              });
            }
          }
        } catch {
          // Keep effectiveClinicId from previous resolution
        }
      }

      // Add user info to request headers for downstream use
      const modifiedReq = req.clone();
      modifiedReq.headers.set('x-user-id', user.id.toString());
      modifiedReq.headers.set('x-user-role', user.role);
      modifiedReq.headers.set('x-request-id', requestId);
      if (effectiveClinicId != null) {
        modifiedReq.headers.set('x-clinic-id', effectiveClinicId.toString());
      }

      const userForHandler: AuthUser =
        effectiveClinicId !== user.clinicId ? { ...user, clinicId: effectiveClinicId } : user;

      // Execute handler within clinic context (AsyncLocalStorage — thread-safe)
      // Replaces deprecated global setClinicContext() to prevent race conditions
      const response = await runWithClinicContext(effectiveClinicId, () =>
        handler(modifiedReq as NextRequest, userForHandler, context)
      );

      // Add security headers to response
      return addSecurityHeaders(response, requestId);
    } catch (error) {
      // Unhandled error — return 500 with requestId for correlation
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error('AUTH_PARAMS_MIDDLEWARE_CATCH', {
        requestId,
        errorMessage: errMsg,
        route: req.nextUrl.pathname,
        method: req.method,
      });

      return errorResponse(
        'Internal server error',
        'INTERNAL_ERROR',
        500,
        requestId,
      );
    }
  };
}
