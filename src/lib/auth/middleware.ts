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

// Track last activity update to avoid too frequent DB writes
const lastActivityUpdates = new Map<number, number>();
const ACTIVITY_UPDATE_INTERVAL_MS = 60000; // Update at most once per minute per user

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
  /** Skip session validation (use only for specific endpoints like logout) */
  skipSessionValidation?: boolean;
  /** Required permissions for this endpoint */
  permissions?: string[];
  /** Custom error message for unauthorized access */
  unauthorizedMessage?: string;
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
 * Update user session activity in the database (for online status tracking)
 * This is fire-and-forget to not block the request
 */
async function updateSessionActivity(userId: number, ipAddress: string): Promise<void> {
  // Check if we've recently updated this user (throttle to avoid DB spam)
  const lastUpdate = lastActivityUpdates.get(userId);
  const now = Date.now();

  if (lastUpdate && now - lastUpdate < ACTIVITY_UPDATE_INTERVAL_MS) {
    return; // Skip update, too recent
  }

  // Update the timestamp in memory immediately
  lastActivityUpdates.set(userId, now);

  // Cleanup old entries periodically (prevent memory leak)
  if (lastActivityUpdates.size > 1000) {
    const cutoff = now - ACTIVITY_UPDATE_INTERVAL_MS * 2;
    for (const [uid, timestamp] of lastActivityUpdates) {
      if (timestamp < cutoff) {
        lastActivityUpdates.delete(uid);
      }
    }
  }

  // Update the database asynchronously
  try {
    // Update the most recent active session for this user
    await prisma.userSession.updateMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
      },
      data: {
        lastActivity: new Date(),
        ipAddress: ipAddress || undefined,
      },
    });
  } catch (error) {
    // Log but don't throw - this is non-critical
    logger.debug('Failed to update session activity', { userId, error });
  }
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

/**
 * Validate required JWT claims
 */
function validateTokenClaims(payload: JWTPayload): string | null {
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
 * Extract authentication token from request
 * Checks multiple sources in priority order
 */
function extractToken(req: NextRequest): string | null {
  // Priority 1: Authorization header (most secure)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Priority 2: HTTP-only cookies (secure for browser clients)
  // Note: Order matters! More specific cookies should be checked first
  const cookieTokenNames = [
    'affiliate_session', // Affiliate portal - check first for affiliate routes
    'affiliate-token',
    'auth-token',
    'super_admin-token',
    'admin-token',
    'provider-token',
    'patient-token',
    'staff-token',
    'support-token',
  ];

  for (const cookieName of cookieTokenNames) {
    const token = req.cookies.get(cookieName)?.value;
    if (token) {
      return token;
    }
  }

  // Priority 3: Query parameter (only for specific use cases like email links)
  // Security: This should be avoided when possible
  const url = new URL(req.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    logger.warn('Token passed via query parameter', {
      path: url.pathname,
      ip: getClientIP(req),
    });
    return queryToken;
  }

  return null;
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
      // Extract token
      const token = extractToken(req);

      if (!token) {
        if (options.optional) {
          return handler(req, null as unknown as AuthUser, context);
        }

        await logAuthFailure(req, requestId, 'NO_TOKEN', 'No authentication token provided');

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

      const user = tokenResult.user;

      // Session validation
      // Security: All authenticated requests should have sessionId unless explicitly skipped (enterprise audit P0)
      if (!options.skipSessionValidation) {
        if (!user.sessionId) {
          // Enhanced diagnostic: log what the token actually contains
          const tokenForDiag = extractToken(req);
          let diagClaimKeys: string[] = [];
          try {
            if (tokenForDiag) {
              const parts = tokenForDiag.split('.');
              if (parts.length === 3) {
                const raw = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
                diagClaimKeys = Object.keys(raw).sort();
              }
            }
          } catch { /* ignore decode errors */ }

          logger.warn('Token missing sessionId - possible old token or manipulation', {
            userId: user.id,
            role: user.role,
            tokenIat: user.iat,
            requestId,
            claimKeys: diagClaimKeys,
            tokenExp: user.exp,
          });
          // Production: reject to prevent session timeout bypass; dev: allow for compatibility
          if (process.env.NODE_ENV === 'production') {
            return NextResponse.json(
              {
                error: 'Invalid session',
                code: 'SESSION_INVALID',
                requestId,
                // Diagnostic: include claim names (no values) to help identify token source
                _diagClaimKeys: diagClaimKeys,
                _diagTokenIat: user.iat,
                _diagTokenExp: user.exp,
              },
              { status: 401 }
            );
          }
        } else {
          const sessionResult = await validateSession(token, req);

          if (!sessionResult.valid && sessionResult.reason !== 'Session not found') {
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
      // Super admins should NOT have clinic context so they can access all data
      let effectiveClinicId =
        user.clinicId && user.role !== 'super_admin' ? user.clinicId : undefined;

      // When on a clinic subdomain (e.g. ot.eonpro.io), use that clinic if the user has access
      // so that "changes" and data shown are for the subdomain's clinic, not the JWT's original clinic
      const subdomain = req.headers.get('x-clinic-subdomain');
      if (
        subdomain &&
        effectiveClinicId != null &&
        user.role !== 'super_admin' &&
        !['www', 'app', 'api', 'admin', 'staging'].includes(subdomain.toLowerCase())
      ) {
        try {
          let subdomainClinicId = getClinicBySubdomainCache(subdomain);
          if (subdomainClinicId == null) {
            const subdomainClinic = await basePrisma.clinic.findFirst({
              where: {
                subdomain: { equals: subdomain, mode: 'insensitive' },
                status: 'ACTIVE',
              },
              select: { id: true },
            });
            if (subdomainClinic) {
              subdomainClinicId = subdomainClinic.id;
              setClinicBySubdomainCache(subdomain, subdomainClinic.id);
            }
          }
          if (subdomainClinicId != null && subdomainClinicId !== effectiveClinicId) {
            const hasAccess =
              user.clinicId === subdomainClinicId ||
              (await userHasAccessToClinic(user, subdomainClinicId));
            if (hasAccess) {
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

      // Also set the legacy global for backwards compatibility
      setClinicContext(effectiveClinicId);

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

      // Clear legacy clinic context
      setClinicContext(undefined);

      // Add security headers to response
      const finalResponse = addSecurityHeaders(response, requestId);

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
      setClinicContext(undefined);

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
 * Uses UserClinic and ProviderClinic; user.clinicId already checked by caller.
 */
async function userHasAccessToClinic(user: AuthUser, clinicId: number): Promise<boolean> {
  try {
    const [userClinic, providerClinic] = await Promise.all([
      basePrisma.userClinic.findFirst({
        where: {
          userId: user.id,
          clinicId,
          isActive: true,
        },
        select: { id: true },
      }),
      user.providerId
        ? basePrisma.providerClinic.findFirst({
            where: {
              providerId: user.providerId,
              clinicId,
              isActive: true,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    return !!userClinic || !!providerClinic;
  } catch {
    return false;
  }
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
 */
export function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin'] });
}

/**
 * Middleware for admin routes (includes super_admin)
 */
export function withAdminAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin', 'admin'] });
}

/**
 * Middleware for provider routes
 */
export function withProviderAuth(
  handler: (req: NextRequest, user: AuthUser, context?: unknown) => Promise<Response>
): (req: NextRequest, context?: unknown) => Promise<Response> {
  return async (req: NextRequest, context?: unknown): Promise<Response> => {
    const authHandler = withAuth(
      (authedReq: NextRequest, user: AuthUser) => handler(authedReq, user, context),
      { roles: ['super_admin', 'admin', 'provider'] }
    );
    return authHandler(req);
  };
}

/**
 * Middleware for clinical routes (providers and staff)
 */
export function withClinicalAuth(
  handler: (req: NextRequest, user: AuthUser, context?: unknown) => Promise<Response>
): (req: NextRequest, context?: unknown) => Promise<Response> {
  return async (req: NextRequest, context?: unknown): Promise<Response> => {
    const authHandler = withAuth(
      (authedReq: NextRequest, user: AuthUser) => handler(authedReq, user, context),
      { roles: ['super_admin', 'admin', 'provider', 'staff'] }
    );
    return authHandler(req);
  };
}

/**
 * Middleware for support routes
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
 */
export function withAffiliateAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin', 'admin', 'affiliate'] });
}

/**
 * Middleware for patient routes
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

  // Check cookies as fallback
  // Note: Order matters! More specific cookies should be checked first
  if (!token) {
    const cookieTokenNames = [
      'affiliate_session', // Affiliate portal - check first for affiliate routes
      'affiliate-token',
      'auth-token',
      'super_admin-token',
      'admin-token',
      'provider-token',
      'patient-token',
      'staff-token',
      'support-token',
    ];

    for (const cookieName of cookieTokenNames) {
      const cookieToken = req.cookies.get(cookieName)?.value;
      if (cookieToken) {
        token = cookieToken;
        break;
      }
    }
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
      if (error.message.includes('expired')) {
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
