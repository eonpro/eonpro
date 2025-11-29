/**
 * Session Management Service
 * HIPAA-compliant session timeout and monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { JWT_SECRET, JWT_REFRESH_SECRET, AUTH_CONFIG } from './config';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Session state tracking
interface SessionState {
  userId: string;
  sessionId: string;
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
  role: string;
  clinicId?: number;
  mfaVerified?: boolean;
  tokenVersion: number;
}

// In-memory session store (use Redis in production)
const activeSessions = new Map<string, SessionState>();

// Track failed attempts for rate limiting
const failedAttempts = new Map<string, number>();

/**
 * Generate new session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create new session
 */
export async function createSession(
  userId: string,
  role: string,
  clinicId?: number,
  request?: NextRequest
): Promise<{
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
}> {
  const sessionId = generateSessionId();
  const now = Date.now();
  
  // Create session state
  const session: SessionState = {
    userId,
    sessionId,
    createdAt: now,
    lastActivity: now,
    ipAddress: request?.headers.get('x-forwarded-for') || 'unknown',
    userAgent: request?.headers.get('user-agent') || 'unknown',
    role,
    clinicId,
    mfaVerified: false,
    tokenVersion: 1,
  };
  
  // Store session
  activeSessions.set(sessionId, session);
  
  // Generate tokens
  const accessToken = await new SignJWT({
    userId,
    sessionId,
    role,
    clinicId,
    iat: Math.floor(now / 1000),
    lastActivity: now,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
    .setJti(crypto.randomUUID())
    .sign(JWT_SECRET);
  
  const refreshToken = await new SignJWT({
    userId,
    sessionId,
    tokenVersion: session.tokenVersion,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
    .sign(JWT_REFRESH_SECRET);
  
  // Log session creation
  if (request) {
    await auditLog(request, {
      userId,
      userRole: role,
      clinicId,
      eventType: AuditEventType.LOGIN,
      resourceType: 'Session',
      resourceId: sessionId,
      action: 'CREATE_SESSION',
      outcome: 'SUCCESS',
    });
  }
  
  logger.info('Session created', {
    userId,
    sessionId,
    role,
    expiresIn: AUTH_CONFIG.tokenExpiryMs.access,
  });
  
  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: AUTH_CONFIG.tokenExpiryMs.access,
  };
}

/**
 * Validate session and check for timeout
 */
export async function validateSession(
  token: string,
  request?: NextRequest
): Promise<{
  valid: boolean;
  expired: boolean;
  session?: SessionState;
  reason?: string;
}> {
  try {
    // Verify token signature
    const { payload } = await jwtVerify(token, JWT_SECRET);
    
    const sessionId = payload.sessionId as string;
    const userId = payload.userId as string;
    const lastActivity = payload.lastActivity as number || 0;
    
    // Check if session exists
    const session = activeSessions.get(sessionId);
    if (!session) {
      return {
        valid: false,
        expired: true,
        reason: 'Session not found',
      };
    }
    
    // Check session timeout
    const now = Date.now();
    const idleTime = now - session.lastActivity;
    const absoluteTime = now - session.createdAt;
    
    // Check idle timeout (15 minutes)
    if (idleTime > AUTH_CONFIG.tokenExpiryMs.sessionTimeout) {
      // Remove expired session
      activeSessions.delete(sessionId);
      
      // Log timeout
      if (request) {
        await auditLog(request, {
          userId,
          eventType: AuditEventType.SESSION_TIMEOUT,
          resourceType: 'Session',
          resourceId: sessionId,
          action: 'IDLE_TIMEOUT',
          outcome: 'SUCCESS',
          metadata: {
            idleTime,
            lastActivity: session.lastActivity,
          },
        });
      }
      
      return {
        valid: false,
        expired: true,
        reason: 'Session timeout due to inactivity',
      };
    }
    
    // Check absolute timeout (8 hours)
    if (absoluteTime > AUTH_CONFIG.tokenExpiryMs.access * 8) {
      // Remove expired session
      activeSessions.delete(sessionId);
      
      // Log absolute timeout
      if (request) {
        await auditLog(request, {
          userId,
          eventType: AuditEventType.SESSION_TIMEOUT,
          resourceType: 'Session',
          resourceId: sessionId,
          action: 'ABSOLUTE_TIMEOUT',
          outcome: 'SUCCESS',
          metadata: {
            absoluteTime,
            createdAt: session.createdAt,
          },
        });
      }
      
      return {
        valid: false,
        expired: true,
        reason: 'Session expired - maximum duration exceeded',
      };
    }
    
    // Update last activity
    session.lastActivity = now;
    activeSessions.set(sessionId, session);
    
    return {
      valid: true,
      expired: false,
      session,
    };
  } catch (error) {
    logger.error('Session validation error', error);
    return {
      valid: false,
      expired: true,
      reason: 'Invalid token',
    };
  }
}

/**
 * Refresh access token
 */
export async function refreshSession(
  refreshToken: string,
  request?: NextRequest
): Promise<{
  success: boolean;
  accessToken?: string;
  error?: string;
}> {
  try {
    // Verify refresh token
    const { payload } = await jwtVerify(refreshToken, JWT_REFRESH_SECRET);
    
    const sessionId = payload.sessionId as string;
    const userId = payload.userId as string;
    const tokenVersion = payload.tokenVersion as number;
    
    // Get session
    const session = activeSessions.get(sessionId);
    if (!session) {
      return {
        success: false,
        error: 'Session not found',
      };
    }
    
    // Check token version (for revocation)
    if (session.tokenVersion !== tokenVersion) {
      return {
        success: false,
        error: 'Token has been revoked',
      };
    }
    
    // Check if session is still valid
    const now = Date.now();
    const idleTime = now - session.lastActivity;
    
    if (idleTime > AUTH_CONFIG.tokenExpiryMs.sessionTimeout) {
      activeSessions.delete(sessionId);
      return {
        success: false,
        error: 'Session expired',
      };
    }
    
    // Update activity
    session.lastActivity = now;
    activeSessions.set(sessionId, session);
    
    // Generate new access token
    const accessToken = await new SignJWT({
      userId,
      sessionId,
      role: session.role,
      clinicId: session.clinicId,
      iat: Math.floor(now / 1000),
      lastActivity: now,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
      .setJti(crypto.randomUUID())
      .sign(JWT_SECRET);
    
    logger.info('Session refreshed', { userId, sessionId });
    
    return {
      success: true,
      accessToken,
    };
  } catch (error) {
    logger.error('Session refresh error', error);
    return {
      success: false,
      error: 'Invalid refresh token',
    };
  }
}

/**
 * Terminate session
 */
export async function terminateSession(
  sessionId: string,
  reason: string,
  request?: NextRequest
): Promise<void> {
  const session = activeSessions.get(sessionId);
  
  if (session) {
    // Remove session
    activeSessions.delete(sessionId);
    
    // Increment token version to invalidate all tokens
    session.tokenVersion++;
    
    // Log logout
    if (request) {
      await auditLog(request, {
        userId: session.userId,
        userRole: session.role,
        clinicId: session.clinicId,
        eventType: AuditEventType.LOGOUT,
        resourceType: 'Session',
        resourceId: sessionId,
        action: 'TERMINATE_SESSION',
        outcome: 'SUCCESS',
        reason,
      });
    }
    
    logger.info('Session terminated', {
      userId: session.userId,
      sessionId,
      reason,
    });
  }
}

/**
 * Get all active sessions for a user
 */
export function getUserSessions(userId: string): SessionState[] {
  const sessions: SessionState[] = [];
  
  for (const [_, session] of activeSessions) {
    if (session.userId === userId) {
      sessions.push(session);
    }
  }
  
  return sessions;
}

/**
 * Terminate all sessions for a user
 */
export async function terminateAllUserSessions(
  userId: string,
  reason: string,
  request?: NextRequest
): Promise<number> {
  const sessions = getUserSessions(userId);
  let terminated = 0;
  
  for (const session of sessions) {
    await terminateSession(session.sessionId, reason, request);
    terminated++;
  }
  
  logger.info('All user sessions terminated', {
    userId,
    count: terminated,
    reason,
  });
  
  return terminated;
}

/**
 * Check for concurrent sessions (HIPAA requirement)
 */
export function checkConcurrentSessions(
  userId: string
): {
  allowed: boolean;
  current: number;
  max: number;
  sessions?: SessionState[];
} {
  const sessions = getUserSessions(userId);
  const maxAllowed = AUTH_CONFIG.security.concurrentSessions;
  
  return {
    allowed: sessions.length < maxAllowed,
    current: sessions.length,
    max: maxAllowed,
    sessions: sessions.length >= maxAllowed ? sessions : undefined,
  };
}

/**
 * Track failed login attempt
 */
export function trackFailedAttempt(
  identifier: string,
  request?: NextRequest
): {
  locked: boolean;
  attempts: number;
  timeRemaining?: number;
} {
  const key = `${identifier}_${request?.headers.get('x-forwarded-for') || 'unknown'}`;
  const attempts = (failedAttempts.get(key) || 0) + 1;
  
  failedAttempts.set(key, attempts);
  
  // Set expiry
  setTimeout(() => {
    failedAttempts.delete(key);
  }, AUTH_CONFIG.security.lockoutDuration);
  
  const locked = attempts >= AUTH_CONFIG.security.maxLoginAttempts;
  
  return {
    locked,
    attempts,
    timeRemaining: locked ? AUTH_CONFIG.security.lockoutDuration : undefined,
  };
}

/**
 * Session monitoring for compliance
 */
export function getSessionMetrics(): {
  total: number;
  byRole: Record<string, number>;
  byClinic: Record<string, number>;
  averageAge: number;
  oldest: number;
} {
  const now = Date.now();
  const metrics = {
    total: activeSessions.size,
    byRole: {} as Record<string, number>,
    byClinic: {} as Record<string, number>,
    totalAge: 0,
    oldest: 0,
  };
  
  for (const [_, session] of activeSessions) {
    // Count by role
    metrics.byRole[session.role] = (metrics.byRole[session.role] || 0) + 1;
    
    // Count by clinic
    if (session.clinicId) {
      const clinicKey = String(session.clinicId);
      metrics.byClinic[clinicKey] = (metrics.byClinic[clinicKey] || 0) + 1;
    }
    
    // Calculate age
    const age = now - session.createdAt;
    metrics.totalAge += age;
    metrics.oldest = Math.max(metrics.oldest, age);
  }
  
  return {
    total: metrics.total,
    byRole: metrics.byRole,
    byClinic: metrics.byClinic,
    averageAge: metrics.total > 0 ? metrics.totalAge / metrics.total : 0,
    oldest: metrics.oldest,
  };
}

/**
 * Clean up expired sessions periodically
 */
export function startSessionCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [sessionId, session] of activeSessions) {
      const idleTime = now - session.lastActivity;
      const absoluteTime = now - session.createdAt;
      
      if (idleTime > AUTH_CONFIG.tokenExpiryMs.sessionTimeout ||
          absoluteTime > AUTH_CONFIG.tokenExpiryMs.access * 8) {
        activeSessions.delete(sessionId);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.info('Session cleanup completed', { cleaned });
    }
  }, 60000); // Run every minute
}

// Start cleanup on module load
if (typeof window === 'undefined') {
  startSessionCleanup();
}
