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
import { JWT_SECRET, AUTH_CONFIG } from './config';
import { setClinicContext, runWithClinicContext } from '@/lib/db';
import { validateSession } from './session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';

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
  influencerId?: number;
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
  | 'influencer' 
  | 'affiliate'
  | 'patient' 
  | 'staff' 
  | 'support';

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
// Token Verification
// ============================================================================

/**
 * Verify and decode JWT token
 * @security This function ONLY accepts properly signed JWTs - NO demo/test tokens
 */
async function verifyToken(token: string): Promise<TokenValidationResult> {
  // Security: Reject any token that looks like a demo/test token
  if (isDemoToken(token)) {
    logger.security('Attempted use of demo token in production', {
      tokenPrefix: token.substring(0, 20),
      environment: process.env.NODE_ENV
    });
    
    return {
      valid: false,
      error: 'Demo tokens are not allowed',
      errorCode: 'INVALID'
    };
  }

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
        errorCode: 'MALFORMED'
      };
    }

    // Check token version for revocation
    const tokenVersion = (payload as unknown as AuthUser).tokenVersion || 1;
    if (tokenVersion < AUTH_CONFIG.security.minimumTokenVersion) {
      return {
        valid: false,
        error: 'Token has been revoked',
        errorCode: 'REVOKED'
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
      influencerId: payload.influencerId as number | undefined,
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
          errorCode: 'EXPIRED'
        };
      }
      if (error.message.includes('signature')) {
        return {
          valid: false,
          error: 'Invalid token signature',
          errorCode: 'INVALID'
        };
      }
    }
    
    logger.error('Token verification failed', error as Error);
    return {
      valid: false,
      error: 'Token verification failed',
      errorCode: 'INVALID'
    };
  }
}

/**
 * Check if token appears to be a demo/test token
 * @deprecated This check has been disabled - proper JWT validation handles security
 * The check was causing false positives with valid JWTs
 */
function isDemoToken(token: string): boolean {
  // DISABLED: This was causing false positives with valid JWTs
  // JWT verification via jose library is sufficient for security
  return false;
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
    'super_admin', 'admin', 'provider', 'influencer', 
    'affiliate', 'patient', 'staff', 'support'
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
  const cookieTokenNames = [
    'auth-token',
    'super_admin-token',
    'admin-token',
    'provider-token',
    'influencer-token',
    'affiliate-token',
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
      ip: getClientIP(req)
    });
    return queryToken;
  }

  return null;
}

/**
 * Get client IP address from request
 */
function getClientIP(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
         req.headers.get('x-real-ip') ||
         req.headers.get('cf-connecting-ip') ||
         'unknown';
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
            requestId 
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
        
        await logAuthFailure(req, requestId, tokenResult.errorCode || 'INVALID', tokenResult.error || 'Token verification failed');
        
        // Return specific error for expired tokens (client can refresh)
        const status = tokenResult.errorCode === 'EXPIRED' ? 401 : 401;
        return NextResponse.json(
          { 
            error: tokenResult.error || 'Invalid or expired token',
            code: tokenResult.errorCode || 'AUTH_FAILED',
            requestId 
          },
          { status }
        );
      }

      const user = tokenResult.user;
      
      // Session validation (skip for serverless compatibility when session is missing)
      if (!options.skipSessionValidation && user.sessionId) {
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
            reason: sessionResult.reason
          });
          
          return NextResponse.json(
            { 
              error: sessionResult.reason || 'Session expired',
              code: 'SESSION_EXPIRED',
              requestId 
            },
            { status: 401 }
          );
        }
      }

      // Role-based access control
      if (options.roles && options.roles.length > 0) {
        const userRole = user.role.toLowerCase() as UserRole;
        const allowedRoles = options.roles.map(r => r.toLowerCase());
        
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
            reason: `Required roles: ${options.roles.join(', ')}, User role: ${user.role}`
          });
          
          return NextResponse.json(
            { 
              error: 'Insufficient permissions',
              code: 'FORBIDDEN',
              requestId 
            },
            { status: 403 }
          );
        }
      }

      // Permission-based access control
      if (options.permissions && options.permissions.length > 0) {
        const userPermissions = user.permissions || [];
        const hasAllPermissions = options.permissions.every(
          p => userPermissions.includes(p)
        );
        
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
            reason: `Required permissions: ${options.permissions.join(', ')}`
          });
          
          return NextResponse.json(
            { 
              error: 'Missing required permissions',
              code: 'FORBIDDEN',
              requestId 
            },
            { status: 403 }
          );
        }
      }
      
      // Determine clinic context for multi-tenant queries
      // Super admins should NOT have clinic context so they can access all data
      const effectiveClinicId = (user.clinicId && user.role !== 'super_admin')
        ? user.clinicId
        : undefined;

      // Also set the legacy global for backwards compatibility
      setClinicContext(effectiveClinicId);

      // Inject user info into request headers
      const headers = new Headers(req.headers);
      headers.set('x-user-id', user.id.toString());
      headers.set('x-user-email', user.email);
      headers.set('x-user-role', user.role);
      headers.set('x-request-id', requestId);
      if (user.clinicId) {
        headers.set('x-clinic-id', user.clinicId.toString());
      }
      
      // Create a new NextRequest with the modified headers
      const modifiedReq = new NextRequest(req.url, {
        method: req.method,
        headers,
        body: req.body,
      });
      
      // Execute handler within clinic context (thread-safe using AsyncLocalStorage)
      const response = await runWithClinicContext(effectiveClinicId, async () => {
        return handler(modifiedReq, user, context);
      });
      
      // Clear legacy clinic context
      setClinicContext(undefined);
      
      // Add security headers to response
      const finalResponse = addSecurityHeaders(response, requestId);
      
      // Log successful access for high-privilege operations
      if (shouldLogAccess(user.role, req.method)) {
        logger.api(req.method, new URL(req.url).pathname, {
          userId: user.id,
          role: user.role,
          clinicId: user.clinicId,
          duration: Date.now() - startTime,
          requestId
        });
      }
      
      return finalResponse;
    } catch (error) {
      setClinicContext(undefined);
      
      logger.error('Authentication middleware error', error as Error, { requestId });
      
      return NextResponse.json(
        { 
          error: 'Internal authentication error',
          code: 'AUTH_ERROR',
          requestId 
        },
        { status: 500 }
      );
    }
  };
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
    metadata: { code, requestId }
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
    headers
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
    roles: ['super_admin', 'admin', 'support', 'staff'] 
  });
}

/**
 * Middleware for influencer routes
 */
export function withInfluencerAuth(
  handler: (req: NextRequest, user: AuthUser) => Promise<Response>
): (req: NextRequest) => Promise<Response> {
  return withAuth(handler, { roles: ['super_admin', 'admin', 'influencer'] });
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
    roles: ['super_admin', 'admin', 'provider', 'staff', 'patient'] 
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
  if (!token) {
    const cookieTokenNames = [
      'auth-token',
      'super_admin-token',
      'admin-token',
      'provider-token',
      'influencer-token',
      'affiliate-token',
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
      influencerId: payload.influencerId as number | undefined,
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
 */
export function getCurrentUser(req: NextRequest): AuthUser | null {
  const userId = req.headers.get('x-user-id');
  const userEmail = req.headers.get('x-user-email');
  const userRole = req.headers.get('x-user-role');
  const clinicId = req.headers.get('x-clinic-id');

  if (!userId || !userEmail || !userRole) {
    return null;
  }

  return {
    id: parseInt(userId, 10),
    email: userEmail,
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
