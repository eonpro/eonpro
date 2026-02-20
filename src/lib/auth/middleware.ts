/**
 * Authentication Middleware for API Routes
 * HIPAA-Compliant - Production Ready
 *
 * @module auth/middleware
 * @version 2.0.0
 * @security CRITICAL - This module handles all authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, JWTPayload } from 'jose';
import { Prisma } from '@prisma/client';
import { JWT_SECRET, AUTH_CONFIG } from './config';
import { setClinicContext, runWithClinicContext, prisma, basePrisma } from '@/lib/db';
import { validateSession } from './session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import {
  getClinicBySubdomainCache,
  setClinicBySubdomainCache,
} from '@/lib/cache/request-scoped';
import { handleApiError } from '@/domains/shared/errors';
import cache from '@/lib/cache/redis';
import {
  isAuthBlocked,
  recordAuthFailure,
  clearAuthFailures,
} from '@/lib/auth/auth-rate-limiter';
import {
  resolveSubdomainClinicId,
  hasClinicAccess,
  trackSessionActivity,
} from './middleware-cache';

// Throttle session activity updates to once per 60s per user via Redis
// In-memory map is unreliable in serverless (each cold start resets it)
const ACTIVITY_UPDATE_INTERVAL_S = 60; // seconds

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  clinicId?: number;
  sessionId?: string;
  providerId?: number;
  patientId?: number;
  affiliateId?: number;
  permissions?: string[];
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'provider'
  | 'affiliate'
  | 'patient'
  | 'staff'
  | 'support'
  | 'sales_rep';

export interface AuthOptions {
  /** Allowed roles for this endpoint */
  roles?: UserRole[];
  /** If true, unauthenticated requests will pass through with null user */
  optional?: boolean;
  /** Skip session validation (use only for specific endpoints like logout) @deprecated Will be enforced in a future release */
  skipSessionValidation?: boolean;
  /** Required permissions for this endpoint */
  permissions?: string[];
  /** Custom error message for unauthorized access */
  unauthorizedMessage?: string;
  /** If true, require that a clinic context is resolved (returns 403 if missing). Default: false */
  requireClinic?: boolean;
}

interface TokenValidationResult {
  valid: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: 'EXPIRED' | 'INVALID' | 'REVOKED' | 'MALFORMED';
}

// ============================================================================
// Session Activity Tracking
// ============================================================================

/**
 * Update user session activity via Redis-only (no DB connection consumed).
 *
 * POOL EXHAUSTION FIX: Previously this performed a fire-and-forget $executeRaw
 * UPDATE on every authenticated request, consuming a DB connection even after
 * the response was sent. Now activity is tracked in Redis only. A background
 * cron can batch-sync to PostgreSQL for persistent storage if needed.
 *
 * @see middleware-cache.ts trackSessionActivity
 */
async function updateSessionActivity(userId: number, ipAddress: string): Promise<void> {
  await trackSessionActivity(userId, ipAddress);
}

// ============================================================================
// Token Verification
// ============================================================================

/**
 * Verify and decode JWT token
 * @security This function ONLY accepts properly signed JWTs - NO demo/test tokens
 */
async function verifyToken(token: string): Promise<TokenValidationResult> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30, // Allow 30 seconds clock skew
    });

    // Validate required claims
    const validationError = validateTokenClaims(payload);
    if (validationError) {
      return {
        valid: false,
        error: validationError,
        errorCode: 'MALFORMED',
      };
    }

    // Check token version for revocation
    // Use ?? (nullish coalescing) instead of || so that tokenVersion=0 is not
    // silently coerced to 1, which would bypass the revocation check.
    const tokenVersion = (payload as unknown as AuthUser).tokenVersion ?? 1;
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
      // jose JWTExpired has code 'ERR_JWT_EXPIRED' but message is
      // '"exp" claim timestamp check failed' (no "expired" substring).
      // Check .code first for reliable detection, then fall back to message.
      const errCode = (error as Error & { code?: string }).code;
      if (errCode === 'ERR_JWT_EXPIRED' || error.message.includes('expired')) {
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

/**
 * Validate required JWT claims
 * Exported for reuse in middleware-with-params.ts (parity requirement)
 */
export function validateTokenClaims(payload: JWTPayload): string | null {
  if (!payload.id || typeof payload.id !== 'number') {
    return 'Missing or invalid user ID in token';
  }

  if (!payload.email || typeof payload.email !== 'string') {
    return 'Missing or invalid email in token';
  }

  if (!payload.role || typeof payload.role !== 'string') {
    return 'Missing or invalid role in token';
  }

  const validRoles: UserRole[] = [
    'super_admin',
    'admin',
    'provider',
    'affiliate',
    'patient',
    'staff',
    'support',
    'sales_rep',
  ];

  if (!validRoles.includes(payload.role as UserRole)) {
    return `Invalid role: ${payload.role}`;
  }

  return null;
}

// ============================================================================
// Token Extraction
// ============================================================================

/**
 * Token extraction result with source tracking.
 * The `source` field identifies WHERE the token came from (e.g. 'auth-token',
 * 'affiliate_session', 'authorization-header'). This is critical for detecting
 * stale session fallbacks — e.g. when an admin's auth-token expires but a
 * 30-day affiliate_session cookie remains and hijacks the root page redirect.
 */
interface ExtractedToken {
  token: string | null;
  source: string | null;
}

/**
 * Extract authentication token from request
 * Checks multiple sources in priority order.
 *
 * IMPORTANT: Cookie order is route-aware to prevent cross-portal token
 * collisions. Affiliate cookies are only prioritised on affiliate routes;
 * otherwise `auth-token` and role-specific cookies come first so that a
 * stale `affiliate_session` cookie cannot shadow the admin/provider token
 * and cause 403s on non-affiliate endpoints.
 */
function extractToken(req: NextRequest): ExtractedToken {
  // Priority 1: Authorization header (most secure)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return { token: authHeader.slice(7).trim(), source: 'authorization-header' };
  }

  // Priority 2: HTTP-only cookies — order depends on the route being accessed
  const pathname = new URL(req.url).pathname;
  const isAffiliateRoute =
    pathname.startsWith('/api/affiliate') || pathname.startsWith('/affiliate');

  const cookieTokenNames = isAffiliateRoute
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
      ];

  for (const cookieName of cookieTokenNames) {
    const token = req.cookies.get(cookieName)?.value;
    if (token) {
      // Detection: warn when affiliate cookie is used as fallback on non-affiliate routes
      if (!isAffiliateRoute && (cookieName === 'affiliate_session' || cookieName === 'affiliate-token')) {
        logger.warn('[Auth] Stale affiliate cookie used as fallback on non-affiliate route', {
          route: pathname,
          cookieName,
          hint: 'Admin/provider session likely expired while 30-day affiliate cookie remained',
        });
      }
      return { token, source: cookieName };
    }
  }

  // Priority 3: Query parameter — RESTRICTED to explicit email-link verification paths only.
  // Tokens in URLs leak via Referer headers, browser history, and server logs.
  const QUERY_TOKEN_ALLOWED_PATHS = [
    '/api/auth/verify-email',
    '/api/auth/reset-password',
    '/api/patient-portal/verify',
  ];
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    if (QUERY_TOKEN_ALLOWED_PATHS.some((p) => url.pathname.startsWith(p))) {
      logger.info('Token passed via query parameter (allowed path)', {
        path: url.pathname,
        ip: getClientIP(req),
      });
      return { token: queryToken, source: 'query-parameter' };
    }
    logger.security('BLOCKED: Token passed via query parameter on non-allowed path', {
      path: url.pathname,
      ip: getClientIP(req),
    });
  }

  return { token: null, source: null };
}

/**
 * Get client IP address from request
 */
function getClientIP(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

// ============================================================================
// Main Authentication Middleware
// ============================================================================

/**
 * Main authentication middleware factory
 *
 * @example
 * // Basic authentication
 * export const GET = withAuth(async (req, user) => {
 *   return NextResponse.json({ user });
 * });
 *
 * @example
 * // Role-based access
 * export const POST = withAuth(async (req, user) => {
 *   // Only admins can access
 * }, { roles: ['admin', 'super_admin'] });
 *
 * @example
 * // With route params (dynamic routes)
 * export const GET = withAuth(async (req, user, context) => {
 *   const { id } = await context.params;
 * }, { roles: ['super_admin'] });
 */
export function withAuth<T = unknown>(
  handler: (req: NextRequest, user: AuthUser, context?: T) => Promise<Response>,
  options: AuthOptions = {}
): (req: NextRequest, context?: T) => Promise<Response> {
  return async (req: NextRequest, context?: T): Promise<Response> => {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      const clientIP = getClientIP(req);

      // Check if IP is blocked from repeated auth failures (brute force protection)
      const blocked = await isAuthBlocked(clientIP);
      if (blocked && !options.optional) {
        return NextResponse.json(
          {
            error: 'Too many authentication failures. Please try again later.',
            code: 'AUTH_RATE_LIMITED',
            requestId,
          },
          { status: 429, headers: { 'Retry-After': '300' } }
        );
      }

      // Extract token (with source tracking for stale session detection)
      const { token, source: tokenSource } = extractToken(req);

      if (!token) {
        if (options.optional) {
          return handler(req, null as unknown as AuthUser, context);
        }

        await logAuthFailure(req, requestId, 'NO_TOKEN', 'No authentication token provided');
        await recordAuthFailure(clientIP);

        return NextResponse.json(
          {
            error: options.unauthorizedMessage || 'Authentication required',
            code: 'AUTH_REQUIRED',
            requestId,
          },
          { status: 401 }
        );
      }

      // Verify token
      const tokenResult = await verifyToken(token);

      if (!tokenResult.valid || !tokenResult.user) {
        if (options.optional) {
          return handler(req, null as unknown as AuthUser, context);
        }

        await logAuthFailure(
          req,
          requestId,
          tokenResult.errorCode || 'INVALID',
          tokenResult.error || 'Token verification failed'
        );
        await recordAuthFailure(clientIP);

        // Return specific error for expired tokens (client can refresh)
        const status = 401;
        return NextResponse.json(
          {
            error: tokenResult.error || 'Invalid or expired token',
            code: tokenResult.errorCode || 'AUTH_FAILED',
            requestId,
          },
          { status }
        );
      }

      // Auth succeeded — clear any failure records for this IP
      clearAuthFailures(clientIP).catch(() => {});

      const user = tokenResult.user;

      // Session validation (optional layer on top of JWT verification)
      //
      // Security model:
      //   1. PRIMARY: JWT signature + expiry + claims verification (done above)
      //   2. OPTIONAL: Redis session lookup for server-side revocation support
      //
      // If sessionId is missing from the JWT, we still trust the token because
      // it was cryptographically verified. We log a warning for monitoring but
      // do NOT block the request — blocking caused production outages on clinic
      // subdomains (e.g. ot.eonpro.io) where tokens without sessionId are valid
      // but the middleware rejected them.
      //
      // Note: even WITH sessionId, "Session not found" in Redis is allowed through,
      // so blocking on *missing* sessionId while allowing *missing sessions* was
      // inconsistent and provided no real security benefit.
      if (options.skipSessionValidation) {
        logger.warn('[Auth] DEPRECATED: skipSessionValidation used — will be enforced in future release', {
          userId: user.id,
          route: new URL(req.url).pathname,
          requestId,
        });
      }
      if (!options.skipSessionValidation) {
        if (!user.sessionId) {
          // Log for monitoring — helps track down tokens issued without sessionId
          logger.warn('Token missing sessionId — allowing (JWT verified)', {
            userId: user.id,
            role: user.role,
            tokenIat: user.iat,
            requestId,
          });
          // Continue to handler — JWT is verified, user is authenticated
        } else {
          const sessionResult = await validateSession(token, req);

          if (!sessionResult.valid && sessionResult.reason !== 'Session not found') {
            await auditLog(req, {
              userId: user.id.toString(),
              userEmail: user.email,
              userRole: user.role,
              eventType: AuditEventType.SESSION_TIMEOUT,
              resourceType: 'Session',
              resourceId: user.sessionId,
              action: 'SESSION_VALIDATION_FAILED',
              outcome: 'FAILURE',
              reason: sessionResult.reason,
            });

            return NextResponse.json(
              {
                error: sessionResult.reason || 'Session expired',
                code: 'SESSION_EXPIRED',
                requestId,
              },
              { status: 401 }
            );
          }
        }
      }

      // Role-based access control
      if (options.roles && options.roles.length > 0) {
        const userRole = user.role.toLowerCase() as UserRole;
        const allowedRoles = options.roles.map((r) => r.toLowerCase());

        if (!allowedRoles.includes(userRole)) {
          // Diagnostic: log token source so stale cookie issues can be identified
          logger.warn('[Auth] Role mismatch 403', {
            userId: user.id,
            userRole: user.role,
            requiredRoles: options.roles,
            tokenSource,
            route: new URL(req.url).pathname,
            requestId,
          });

          await auditLog(req, {
            userId: user.id.toString(),
            userEmail: user.email,
            userRole: user.role,
            clinicId: user.clinicId,
            eventType: AuditEventType.SYSTEM_ACCESS,
            resourceType: 'API',
            action: 'AUTHORIZATION_FAILED',
            outcome: 'FAILURE',
            reason: `Required roles: ${options.roles.join(', ')}, User role: ${user.role}`,
            metadata: { tokenSource, requestId },
          });

          return NextResponse.json(
            {
              error: 'Insufficient permissions',
              code: 'FORBIDDEN',
              requestId,
            },
            { status: 403 }
          );
        }
      }

      // Permission-based access control
      if (options.permissions && options.permissions.length > 0) {
        const userPermissions = user.permissions || [];
        const hasAllPermissions = options.permissions.every((p) => userPermissions.includes(p));

        if (!hasAllPermissions) {
          await auditLog(req, {
            userId: user.id.toString(),
            userEmail: user.email,
            userRole: user.role,
            clinicId: user.clinicId,
            eventType: AuditEventType.SYSTEM_ACCESS,
            resourceType: 'API',
            action: 'PERMISSION_CHECK_FAILED',
            outcome: 'FAILURE',
            reason: `Required permissions: ${options.permissions.join(', ')}`,
          });

          return NextResponse.json(
            {
              error: 'Missing required permissions',
              code: 'FORBIDDEN',
              requestId,
            },
            { status: 403 }
          );
        }
      }

      // Determine clinic context for multi-tenant queries
      // For non-super-admin: start with JWT clinicId
      // For super_admin: start undefined, but allow subdomain/header override below
      let effectiveClinicId =
        user.clinicId && user.role !== 'super_admin' ? user.clinicId : undefined;

      // Fallback: if JWT has no clinicId, use the x-clinic-id header set by the edge
      // clinic middleware — but ONLY after verifying the user actually has access.
      // This prevents tenant isolation bypass if the header is spoofed or stale.
      if (effectiveClinicId == null && user.role !== 'super_admin') {
        const headerClinicId = req.headers.get('x-clinic-id');
        if (headerClinicId) {
          const parsed = parseInt(headerClinicId, 10);
          if (!isNaN(parsed) && parsed > 0) {
            const accessGranted = await hasClinicAccess(user.id, parsed, user.providerId);
            if (accessGranted) {
              effectiveClinicId = parsed;
              logger.info('[Auth] Using x-clinic-id header as clinicId fallback (access verified)', {
                userId: user.id,
                clinicId: parsed,
                jwtClinicId: user.clinicId ?? null,
              });
            } else {
              logger.security('[Auth] BLOCKED: x-clinic-id header fallback denied — user lacks access', {
                userId: user.id,
                headerClinicId: parsed,
                jwtClinicId: user.clinicId ?? null,
              });
            }
          }
        }
      }

      // When on a clinic subdomain (e.g. ot.eonpro.io), use that clinic if the user has access
      // so that data shown is scoped to the subdomain's clinic.
      // Super admins also get subdomain clinic context — tenant isolation requires it
      // and they have implicit access to all clinics.
      //
      // POOL EXHAUSTION FIX: Subdomain→clinicId now resolved via Redis (5 min TTL)
      // instead of hitting basePrisma.clinic.findFirst on every request.
      // Clinic access check also uses Redis cache (5 min TTL) instead of
      // Promise.all([userClinic, providerClinic]) DB queries per request.
      const subdomain = req.headers.get('x-clinic-subdomain');
      if (
        subdomain &&
        !['www', 'app', 'api', 'admin', 'staging'].includes(subdomain.toLowerCase())
      ) {
        try {
          const subdomainClinicId = await resolveSubdomainClinicId(subdomain);
          if (subdomainClinicId != null && subdomainClinicId !== effectiveClinicId) {
            // Super admin has implicit access to all clinics
            const userHasAccess =
              user.role === 'super_admin' ||
              user.clinicId === subdomainClinicId ||
              (await hasClinicAccess(user.id, subdomainClinicId, user.providerId));
            if (userHasAccess) {
              effectiveClinicId = subdomainClinicId;
              logger.debug('[Auth] Using subdomain clinic for context', {
                userId: user.id,
                subdomain,
                clinicId: subdomainClinicId,
              });
            }
          }
        } catch (err) {
          logger.warn('[Auth] Subdomain clinic lookup failed', {
            subdomain,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Enforce requireClinic option — reject if no clinic context was resolved
      if (options.requireClinic && effectiveClinicId == null && user.role !== 'super_admin') {
        logger.warn('[Auth] requireClinic enforcement: no clinic context', {
          userId: user.id,
          role: user.role,
          route: new URL(req.url).pathname,
          requestId,
        });
        return NextResponse.json(
          {
            error: 'Clinic context required for this endpoint',
            code: 'CLINIC_REQUIRED',
            requestId,
          },
          { status: 403 }
        );
      }

      // NOTE: Legacy setClinicContext(effectiveClinicId) removed — runWithClinicContext
      // (AsyncLocalStorage) below provides proper request-scoped isolation.
      // The global was a race condition vector under concurrent requests.

      // Update session activity for online status tracking (fire-and-forget)
      updateSessionActivity(user.id, getClientIP(req)).catch(() => {
        // Silently ignore errors - this is non-critical
      });

      // Inject user info into request headers (use effectiveClinicId so routes see subdomain clinic when overridden)
      // NOTE: Do not propagate PHI (email) in headers — use user ID instead
      const headers = new Headers(req.headers);
      headers.set('x-user-id', user.id.toString());
      headers.set('x-user-role', user.role);
      headers.set('x-request-id', requestId);
      if (effectiveClinicId != null) {
        headers.set('x-clinic-id', effectiveClinicId.toString());
      }

      // Create a new NextRequest with the modified headers
      const modifiedReq = new NextRequest(req.url, {
        method: req.method,
        headers,
        body: req.body,
      });

      // Pass user with effective clinic so handlers see subdomain clinic when overridden
      const userForHandler: AuthUser =
        effectiveClinicId !== user.clinicId
          ? { ...user, clinicId: effectiveClinicId }
          : user;

      // Execute handler within clinic + request context (thread-safe using AsyncLocalStorage)
      // runWithRequestContext ensures getRequestId() works in all service functions
      const response = await runWithClinicContext(effectiveClinicId, async () => {
        const { runWithRequestContext } = await import('@/lib/observability/request-context');
        return runWithRequestContext(
          { requestId, clinicId: effectiveClinicId ?? undefined, userId: user.id, route: new URL(req.url).pathname },
          () => handler(modifiedReq, userForHandler, context)
        );
      });

      // Add security headers to response
      const finalResponse = addSecurityHeaders(response, requestId);

      // Expose token source so clients can detect stale session fallbacks
      // (e.g. root page detecting affiliate_session used instead of auth-token)
      if (tokenSource) {
        finalResponse.headers.set('x-auth-token-source', tokenSource);
      }

      // Structured request summary (SOC2 / incident response; no PHI)
      logger.requestSummary({
        requestId,
        clinicId: effectiveClinicId ?? undefined,
        userId: user.id,
        route: new URL(req.url).pathname,
        method: req.method,
        status: finalResponse.status,
        durationMs: Date.now() - startTime,
      });

      // Log successful access for high-privilege operations
      if (shouldLogAccess(user.role, req.method)) {
        logger.api(req.method, new URL(req.url).pathname, {
          userId: user.id,
          role: user.role,
          clinicId: effectiveClinicId,
          duration: Date.now() - startTime,
          requestId,
        });
      }

      return finalResponse;
    } catch (error) {
      // TEMPORARY DIAGNOSTIC: Capture exact error for debugging systemic 500s
      const errMsg = error instanceof Error ? error.message : String(error);
      const errName = error instanceof Error ? error.constructor.name : 'Unknown';
      const errStack = error instanceof Error ? error.stack?.split('\n').slice(0, 5).join(' | ') : '';
      logger.error('AUTH_MIDDLEWARE_CATCH', {
        requestId,
        errorName: errName,
        errorMessage: errMsg,
        errorStack: errStack,
        route: new URL(req.url).pathname,
        method: req.method,
      });

      // Distinguish database connection errors from authentication errors
      // This helps with debugging and allows clients to retry on transient failures
      if (isDatabaseConnectionError(error)) {
        logger.error('Database connection error in auth middleware', error as Error, {
          requestId,
          errorType: 'DATABASE_CONNECTION',
        });

        const res503 = NextResponse.json(
          {
            error: 'Service temporarily unavailable. Please try again.',
            code: 'SERVICE_UNAVAILABLE',
            requestId,
            retryAfter: 5,
          },
          {
            status: 503,
            headers: { 'Retry-After': '5' },
          }
        );
        logger.requestSummary({
          requestId,
          route: new URL(req.url).pathname,
          method: req.method,
          status: 503,
          durationMs: Date.now() - startTime,
        });
        return res503;
      }

      const diagRes = NextResponse.json(
        {
          error: 'Internal server error',
          code: errName,
          requestId,
          ...(process.env.NODE_ENV === 'development' ? { _diag: errStack } : {}),
        },
        { status: 500 }
      );
      logger.requestSummary({
        requestId,
        route: new URL(req.url).pathname,
        method: req.method,
        status: diagRes.status,
        durationMs: Date.now() - startTime,
      });
      return diagRes;
    }
  };
}

/**
 * Check if the user has access to the given clinic (for subdomain-override).
 *
 * POOL EXHAUSTION FIX: Now delegates to the shared Redis-cached helper
 * in middleware-cache.ts. Previously performed Promise.all of 2 DB queries
 * (UserClinic + ProviderClinic) on every request with subdomain override.
 *
 * @see middleware-cache.ts hasClinicAccess
 */
async function userHasAccessToClinic(user: AuthUser, clinicId: number): Promise<boolean> {
  return hasClinicAccess(user.id, clinicId, user.providerId);
}

/**
 * Check if an error is a database connection error
 * These should return 503 instead of 500 to indicate temporary unavailability
 */
function isDatabaseConnectionError(error: unknown): boolean {
  // Prisma known request errors with connection-related codes
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const connectionErrorCodes = [
      'P1001', // Can't reach database server
      'P1002', // Database server timed out
      'P1008', // Operations timed out
      'P1017', // Server has closed the connection
      'P2024', // Timed out fetching a new connection from the connection pool
    ];
    return connectionErrorCodes.includes(error.code);
  }

  // Prisma initialization errors (database not ready)
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }

  // Check for connection-related error messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const connectionPatterns = [
      'connection',
      'econnrefused',
      'econnreset',
      'timeout',
      'pool',
      'too many connections',
      'database server',
      'cannot connect',
    ];
    return connectionPatterns.some((pattern) => message.includes(pattern));
  }

  return false;
}

/**
 * Log authentication failure
 */
async function logAuthFailure(
  req: NextRequest,
  requestId: string,
  code: string,
  reason: string
): Promise<void> {
  await auditLog(req, {
    userId: 'anonymous',
    eventType: AuditEventType.LOGIN_FAILED,
    resourceType: 'API',
    action: 'AUTHENTICATION_FAILED',
    outcome: 'FAILURE',
    reason,
    metadata: { code, requestId },
  });
}

/**
 * Determine if access should be logged
 */
function shouldLogAccess(role: UserRole, method: string): boolean {
  // Log all write operations
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return true;
  }

  // Log access for high-privilege roles
  if (['super_admin', 'admin', 'provider'].includes(role)) {
    return true;
  }

  return false;
}

/**
 * Add security headers to response
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

// ============================================================================
// Convenience Middleware Factories
// ============================================================================

/**
 * Middleware for super admin only routes
 * @see withAuth — use withAuth({ roles: ['super_admin'] }) for new code
 */
export function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * Middleware for admin routes (includes super_admin)
 * @see withAuth — use withAuth(handler, { roles: ['super_admin', 'admin'] }) for new code
 */
export function withAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin', 'admin'] });
}

/**
 * Middleware for provider routes
 * @see withAuth — use withAuth(handler, { roles: ['super_admin', 'admin', 'provider'] }) for new code
 */
export function withProviderAuth(
  handler: (req: NextRequest, user: AuthUser, context?: unknown) => Promise<Response>
): (req: NextRequest, context?: unknown) => Promise<Response> {
  return withAuth<unknown>(handler, { roles: ['super_admin', 'admin', 'provider'] });
}

/**
 * Middleware for clinical routes (providers and staff)
 * @see withAuth — use withAuth(handler, { roles: ['super_admin', 'admin', 'provider', 'staff'] }) for new code
 */
export function withClinicalAuth(
  handler: (req: NextRequest, user: AuthUser, context?: unknown) => Promise<Response>
): (req: NextRequest, context?: unknown) => Promise<Response> {
  return withAuth<unknown>(handler, { roles: ['super_admin', 'admin', 'provider', 'staff'] });
}

/**
 * Middleware for support routes
 * @see withAuth — use withAuth(handler, { roles: [...] }) for new code
 */
export function withSupportAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, {
    roles: ['super_admin', 'admin', 'support', 'staff'],
  });
}

/**
 * Middleware for affiliate portal routes
 * HIPAA-COMPLIANT: Affiliates can only access their own aggregated data
 * @see withAuth — use withAuth(handler, { roles: [...] }) for new code
 */
export function withAffiliateAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin', 'admin', 'affiliate'] });
}

/**
 * Middleware for patient routes
 * @see withAuth — use withAuth(handler, { roles: [...] }) for new code
 */
export function withPatientAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, {
    roles: ['super_admin', 'admin', 'provider', 'staff', 'patient'],
  });
}

// ============================================================================
// Direct Auth Verification (for routes with dynamic params)
// ============================================================================

/**
 * Directly verify authentication from a request
 * Use this for routes with dynamic params where HOC wrappers don't work well
 *
 * @example
 * const authResult = await verifyAuth(req);
 * if (!authResult.success) {
 *   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
 * }
 * const user = authResult.user;
 */
export async function verifyAuth(req: NextRequest): Promise<{
  success: boolean;
  user?: AuthUser;
  error?: string;
  errorCode?: string;
}> {
  // Extract token
  const authHeader = req.headers.get('authorization');
  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Check cookies as fallback — reuse the centralized extractToken function
  if (!token) {
    const extracted = extractToken(req);
    token = extracted.token;
  }

  if (!token) {
    return { success: false, error: 'No authentication token', errorCode: 'NO_TOKEN' };
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      clockTolerance: 30,
    });

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
      iat: payload.iat,
      exp: payload.exp,
    };

    // Set clinic context for multi-tenant queries
    // Super admins should NOT have clinic context so they can access all data
    if (user.clinicId && user.role !== 'super_admin') {
      setClinicContext(user.clinicId);
    } else {
      setClinicContext(undefined);
    }

    return { success: true, user };
  } catch (error) {
    if (error instanceof Error) {
      const errCode = (error as Error & { code?: string }).code;
      if (errCode === 'ERR_JWT_EXPIRED' || error.message.includes('expired')) {
        return { success: false, error: 'Token expired', errorCode: 'EXPIRED' };
      }
    }
    return { success: false, error: 'Invalid token', errorCode: 'INVALID' };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract current user from request headers
 * Use after authentication middleware has run
 *
 * NOTE: Email is no longer propagated in headers (HIPAA — no PHI in headers).
 * Use user.id to look up email from the database if needed.
 */
export function getCurrentUser(req: NextRequest): AuthUser | null {
  const userId = req.headers.get('x-user-id');
  const userRole = req.headers.get('x-user-role');
  const clinicId = req.headers.get('x-clinic-id');

  if (!userId || !userRole) {
    return null;
  }

  return {
    id: parseInt(userId, 10),
    email: '', // Email not propagated in headers; use user.id to look up if needed
    role: userRole as UserRole,
    clinicId: clinicId ? parseInt(clinicId, 10) : undefined,
  };
}

/**
 * Check if user has specific role
 */
export function hasRole(user: AuthUser | null, roles: UserRole[]): boolean {
  if (!user) {
    return false;
  }
  return roles.includes(user.role);
}

/**
 * Check if user has specific permission
 */
export function hasPermission(user: AuthUser | null, permission: string): boolean {
  if (!user || !user.permissions) {
    return false;
  }
  return user.permissions.includes(permission);
}

/**
 * Check if user can access a specific clinic
 */
export function canAccessClinic(user: AuthUser | null, clinicId: number): boolean {
  if (!user) {
    return false;
  }

  // Super admins can access all clinics
  if (user.role === 'super_admin') {
    return true;
  }

  // Others can only access their own clinic
  return user.clinicId === clinicId;
}
