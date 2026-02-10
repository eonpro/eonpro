/**
 * Session Management Service
 * HIPAA-compliant session timeout and monitoring
 *
 * SOC 2 Compliance: Uses Redis for session storage in production
 * to support horizontal scaling and token revocation.
 * Falls back to in-memory storage for development/testing.
 *
 * @see docs/SOC2_REMEDIATION.md
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import { JWT_SECRET, JWT_REFRESH_SECRET, AUTH_CONFIG } from './config';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';
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

// Session namespace for Redis
const SESSION_NAMESPACE = 'session';

// Session TTL (8 hours in seconds - matches max session duration)
const SESSION_TTL_SECONDS = 8 * 60 * 60;

// In-memory fallback for development/testing
const localSessions = new Map<string, SessionState>();

// Track failed attempts for rate limiting (kept in-memory for simplicity)
const failedAttempts = new Map<string, number>();

/**
 * Check if Redis is available for session storage
 */
function useRedis(): boolean {
  return cache.isReady() && process.env.NODE_ENV === 'production';
}

/**
 * Get session from storage (Redis or in-memory)
 */
async function getSession(sessionId: string): Promise<SessionState | null> {
  if (useRedis()) {
    return cache.get<SessionState>(sessionId, { namespace: SESSION_NAMESPACE });
  }
  return localSessions.get(sessionId) || null;
}

/**
 * Save session to storage (Redis or in-memory)
 */
async function saveSession(sessionId: string, session: SessionState): Promise<void> {
  if (useRedis()) {
    await cache.set(sessionId, session, {
      namespace: SESSION_NAMESPACE,
      ttl: SESSION_TTL_SECONDS,
    });
  } else {
    localSessions.set(sessionId, session);
  }
}

/**
 * Delete session from storage (Redis or in-memory)
 */
async function deleteSession(sessionId: string): Promise<void> {
  if (useRedis()) {
    await cache.delete(sessionId, { namespace: SESSION_NAMESPACE });
  } else {
    localSessions.delete(sessionId);
  }
}

/**
 * Get all sessions for a user (for concurrent session checks)
 * Note: This is expensive in Redis - consider using a user->sessions index
 */
async function getUserSessionsFromStorage(userId: string): Promise<SessionState[]> {
  if (useRedis()) {
    // For Redis, we need to scan or use a secondary index
    // For now, we'll use a pattern scan (not ideal for large scale)
    // TODO: Implement user->sessions index in Redis for better performance
    const keys = await cache.keys(`${SESSION_NAMESPACE}:*`);
    const sessions: SessionState[] = [];

    for (const key of keys) {
      const sessionId = key.replace(`${SESSION_NAMESPACE}:`, '');
      const session = await getSession(sessionId);
      if (session && session.userId === userId) {
        sessions.push(session);
      }
    }

    return sessions;
  }

  // In-memory: iterate through local store
  const sessions: SessionState[] = [];
  for (const [_, session] of localSessions) {
    if (session.userId === userId) {
      sessions.push(session);
    }
  }
  return sessions;
}

/**
 * Get session count and metrics
 */
async function getSessionCount(): Promise<number> {
  if (useRedis()) {
    const keys = await cache.keys(`${SESSION_NAMESPACE}:*`);
    return keys.length;
  }
  return localSessions.size;
}

/**
 * Generate new session ID
 */
export function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create only the session record in storage (Redis or in-memory) and return sessionId.
 * Use this when the login route builds its own JWT with full claims but needs a sessionId
 * so that validateSession() can find the session in production.
 */
export async function createSessionRecord(
  userId: string,
  role: string,
  clinicId: number | undefined,
  request?: NextRequest
): Promise<{ sessionId: string }> {
  const sessionId = generateSessionId();
  const now = Date.now();
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
  await saveSession(sessionId, session);
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
  logger.info('Session record created', {
    userId,
    sessionId,
    role,
    storage: useRedis() ? 'redis' : 'memory',
  });
  return { sessionId };
}

/**
 * Create new session
 * SOC 2 Compliance: Sessions stored in Redis for horizontal scaling
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

  // Store session in Redis (or in-memory fallback)
  await saveSession(sessionId, session);

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
    storage: useRedis() ? 'redis' : 'memory',
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
 * SOC 2 Compliance: Session validation with Redis-backed storage
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
    const lastActivity = (payload.lastActivity as number) || 0;

    // Check if session exists (Redis or in-memory)
    const session = await getSession(sessionId);
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
      await deleteSession(sessionId);

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
      await deleteSession(sessionId);

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
    await saveSession(sessionId, session);

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
 * SOC 2 Compliance: Token refresh with Redis-backed session lookup
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

    // Get session from Redis (or in-memory)
    const session = await getSession(sessionId);
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
      await deleteSession(sessionId);
      return {
        success: false,
        error: 'Session expired',
      };
    }

    // Update activity
    session.lastActivity = now;
    await saveSession(sessionId, session);

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
 * SOC 2 Compliance: Session termination with Redis-backed storage
 */
export async function terminateSession(
  sessionId: string,
  reason: string,
  request?: NextRequest
): Promise<void> {
  const session = await getSession(sessionId);

  if (session) {
    // Remove session from storage
    await deleteSession(sessionId);

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
      storage: useRedis() ? 'redis' : 'memory',
    });
  }
}

/**
 * Get all active sessions for a user
 * Note: Now async due to Redis storage
 */
export async function getUserSessions(userId: string): Promise<SessionState[]> {
  return getUserSessionsFromStorage(userId);
}

/**
 * Terminate all sessions for a user
 * SOC 2 Compliance: Bulk session termination with audit logging
 */
export async function terminateAllUserSessions(
  userId: string,
  reason: string,
  request?: NextRequest
): Promise<number> {
  const sessions = await getUserSessions(userId);
  let terminated = 0;

  for (const session of sessions) {
    await terminateSession(session.sessionId, reason, request);
    terminated++;
  }

  logger.info('All user sessions terminated', {
    userId,
    count: terminated,
    reason,
    storage: useRedis() ? 'redis' : 'memory',
  });

  return terminated;
}

/**
 * Check for concurrent sessions (HIPAA requirement)
 * Note: Now async due to Redis storage
 */
export async function checkConcurrentSessions(userId: string): Promise<{
  allowed: boolean;
  current: number;
  max: number;
  sessions?: SessionState[];
}> {
  const sessions = await getUserSessions(userId);
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
 * Note: Now async due to Redis storage
 */
export async function getSessionMetrics(): Promise<{
  total: number;
  byRole: Record<string, number>;
  byClinic: Record<string, number>;
  averageAge: number;
  oldest: number;
  storage: string;
}> {
  const now = Date.now();
  const metrics = {
    total: 0,
    byRole: {} as Record<string, number>,
    byClinic: {} as Record<string, number>,
    totalAge: 0,
    oldest: 0,
  };

  if (useRedis()) {
    // Get all session keys from Redis
    const keys = await cache.keys(`${SESSION_NAMESPACE}:*`);
    metrics.total = keys.length;

    // Get session data for metrics (sample if too many)
    const sampleSize = Math.min(keys.length, 100);
    for (let i = 0; i < sampleSize; i++) {
      const sessionId = keys[i].replace(`${SESSION_NAMESPACE}:`, '');
      const session = await getSession(sessionId);
      if (session) {
        metrics.byRole[session.role] = (metrics.byRole[session.role] || 0) + 1;
        if (session.clinicId) {
          const clinicKey = String(session.clinicId);
          metrics.byClinic[clinicKey] = (metrics.byClinic[clinicKey] || 0) + 1;
        }
        const age = now - session.createdAt;
        metrics.totalAge += age;
        metrics.oldest = Math.max(metrics.oldest, age);
      }
    }
  } else {
    // In-memory metrics
    metrics.total = localSessions.size;

    for (const [_, session] of localSessions) {
      metrics.byRole[session.role] = (metrics.byRole[session.role] || 0) + 1;
      if (session.clinicId) {
        const clinicKey = String(session.clinicId);
        metrics.byClinic[clinicKey] = (metrics.byClinic[clinicKey] || 0) + 1;
      }
      const age = now - session.createdAt;
      metrics.totalAge += age;
      metrics.oldest = Math.max(metrics.oldest, age);
    }
  }

  return {
    total: metrics.total,
    byRole: metrics.byRole,
    byClinic: metrics.byClinic,
    averageAge: metrics.total > 0 ? metrics.totalAge / metrics.total : 0,
    oldest: metrics.oldest,
    storage: useRedis() ? 'redis' : 'memory',
  };
}

/**
 * Clean up expired sessions periodically
 * Note: Redis sessions auto-expire via TTL; this is mainly for in-memory cleanup
 */
export function startSessionCleanup(): void {
  setInterval(async () => {
    // Skip cleanup if using Redis (TTL handles expiration)
    if (useRedis()) {
      return;
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of localSessions) {
      const idleTime = now - session.lastActivity;
      const absoluteTime = now - session.createdAt;

      if (
        idleTime > AUTH_CONFIG.tokenExpiryMs.sessionTimeout ||
        absoluteTime > AUTH_CONFIG.tokenExpiryMs.access * 8
      ) {
        localSessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Session cleanup completed', { cleaned, storage: 'memory' });
    }
  }, 60000); // Run every minute
}

// Start cleanup on module load (server-side only)
if (typeof window === 'undefined') {
  startSessionCleanup();
}

/**
 * Export storage status for health checks
 */
export function getSessionStorageStatus(): { type: 'redis' | 'memory'; ready: boolean } {
  return {
    type: useRedis() ? 'redis' : 'memory',
    ready: useRedis() ? cache.isReady() : true,
  };
}
