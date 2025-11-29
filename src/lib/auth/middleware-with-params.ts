/**
 * Authentication Middleware for API Routes with Dynamic Parameters
 * Handles Next.js App Router routes that need context parameter
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from './config';
import { setClinicContext } from '@/lib/db';
import { validateSession } from './session-manager';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { AuthUser } from './middleware';

/**
 * Verify JWT token from various sources
 */
async function verifyToken(token: string): Promise<AuthUser | null> {
  // Check if this is a demo token
  if (token.includes('demo-')) {
    // Handle demo tokens (for development/demo purposes only)
    // In production, remove this block
    const demoUsers: Record<string, AuthUser> = {
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZW1haWwiOiJhZG1pbkBsaWZlZmlsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJjbGluaWNJZCI6MX0.demo-admin-token': {
        id: 1,
        email: 'admin@eonpro.com',
        role: 'admin',
        clinicId: 1
      },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwiZW1haWwiOiJwcm92aWRlckBsaWZlZmlsZS5jb20iLCJyb2xlIjoicHJvdmlkZXIiLCJjbGluaWNJZCI6MX0.demo-provider-token': {
        id: 2,
        email: 'provider@eonpro.com',
        role: 'provider',
        clinicId: 1
      },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiZW1haWwiOiJzdGFmZkBsaWZlZmlsZS5jb20iLCJyb2xlIjoic3RhZmYiLCJjbGluaWNJZCI6MX0.demo-staff-token': {
        id: 3,
        email: 'staff@eonpro.com',
        role: 'staff',
        clinicId: 1
      },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NCwiZW1haWwiOiJzdXBwb3J0QGxpZmVmaWxlLmNvbSIsInJvbGUiOiJzdXBwb3J0IiwiY2xpbmljSWQiOjF9.demo-support-token': {
        id: 4,
        email: 'support@eonpro.com',
        role: 'support',
        clinicId: 1
      },
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NSwiZW1haWwiOiJwYXRpZW50QGV4YW1wbGUuY29tIiwicm9sZSI6InBhdGllbnQiLCJjbGluaWNJZCI6MX0.demo-patient-token': {
        id: 5,
        email: 'patient@example.com',
        role: 'patient',
        clinicId: 1,
        patientId: 1 // Link to Test Patient
      }
    };
    
    return demoUsers[token] || null;
  }
  
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as AuthUser;
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from request
 */
function extractToken(req: NextRequest): string | null {
  // Check Authorization header
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookies for various token types
  const cookieTokens = [
    'auth-token',
    'influencer-token',
    'provider-token',
    'admin-token'
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
        reason: 'No token provided'
      });
      
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
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
        reason: 'Invalid or expired token'
      });
      
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Validate session (check for timeout)
    if (user.sessionId) {
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
          reason: sessionValidation.reason
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
          reason: `Required roles: ${options.roles.join(', ')}`
        });
        
        return NextResponse.json(
          { error: 'Insufficient permissions' },
          { status: 403 }
        );
      }
    }
    
    // Set clinic context for database queries
    if (user.clinicId) {
      setClinicContext(user.clinicId);
    }

    // Add user to request headers for downstream use
    const modifiedReq = req.clone();
    modifiedReq.headers.set('x-user-id', user.id.toString());
    modifiedReq.headers.set('x-user-email', user.email);
    modifiedReq.headers.set('x-user-role', user.role);
    if (user.clinicId) {
      modifiedReq.headers.set('x-clinic-id', user.clinicId.toString());
    }
    
    try {
      const response = await handler(modifiedReq as NextRequest, user, context);
      
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
