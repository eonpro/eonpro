/**
 * Session Manager Tests
 * Tests for HIPAA-compliant session management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';

// Mock dependencies
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/lib/audit/hipaa-audit', () => ({
  auditLog: vi.fn(),
  AuditEventType: {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    SESSION_TIMEOUT: 'SESSION_TIMEOUT',
  },
}));

// Mock auth config
vi.mock('@/lib/auth/config', () => {
  const testSecret = new TextEncoder().encode('test-jwt-secret-32-chars-long!!!');
  return {
    JWT_SECRET: testSecret,
    JWT_REFRESH_SECRET: testSecret,
    AUTH_CONFIG: {
      tokenExpiry: {
        access: '1h',
        refresh: '7d',
      },
      tokenExpiryMs: {
        access: 3600000, // 1 hour
        sessionTimeout: 900000, // 15 minutes
      },
      security: {
        maxLoginAttempts: 5,
        lockoutDuration: 1800000, // 30 minutes
        concurrentSessions: 3,
      },
    },
  };
});

describe('Session Manager', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  describe('generateSessionId', () => {
    it('should generate unique session IDs', async () => {
      const { generateSessionId } = await import('@/lib/auth/session-manager');
      
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toHaveLength(64); // 32 bytes = 64 hex chars
    });

    it('should generate hex string', async () => {
      const { generateSessionId } = await import('@/lib/auth/session-manager');
      
      const id = generateSessionId();
      expect(/^[0-9a-f]+$/.test(id)).toBe(true);
    });
  });

  describe('createSession', () => {
    it('should create new session with tokens', async () => {
      const { createSession } = await import('@/lib/auth/session-manager');
      
      const result = await createSession('user123', 'ADMIN', 1);
      
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();
      expect(result.expiresIn).toBe(3600000);
    });

    it('should include user info in token payload', async () => {
      const { createSession } = await import('@/lib/auth/session-manager');
      const { JWT_SECRET } = await import('@/lib/auth/config');
      
      const result = await createSession('user456', 'PROVIDER', 2);
      
      const { payload } = await jwtVerify(result.accessToken, JWT_SECRET);
      
      expect(payload.userId).toBe('user456');
      expect(payload.role).toBe('PROVIDER');
      expect(payload.clinicId).toBe(2);
    });

    it('should audit log session creation with request', async () => {
      const { createSession } = await import('@/lib/auth/session-manager');
      const { auditLog } = await import('@/lib/audit/hipaa-audit');
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'TestAgent/1.0',
        }),
      } as unknown as NextRequest;
      
      await createSession('user789', 'STAFF', 1, mockRequest);
      
      expect(auditLog).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          userId: 'user789',
          userRole: 'STAFF',
          action: 'CREATE_SESSION',
          outcome: 'SUCCESS',
        })
      );
    });
  });

  describe('validateSession', () => {
    it('should validate valid session', async () => {
      const { createSession, validateSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      const result = await validateSession(session.accessToken);
      
      expect(result.valid).toBe(true);
      expect(result.expired).toBe(false);
      expect(result.session).toBeDefined();
    });

    it('should reject invalid token', async () => {
      const { validateSession } = await import('@/lib/auth/session-manager');
      
      const result = await validateSession('invalid-token');
      
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.reason).toBe('Invalid token');
    });

    it('should detect expired session (idle timeout)', async () => {
      const { createSession, validateSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      
      // Advance time past idle timeout (15 minutes)
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      const result = await validateSession(session.accessToken);
      
      expect(result.valid).toBe(false);
      expect(result.expired).toBe(true);
      expect(result.reason).toContain('inactivity');
    });

    it('should update last activity on valid session', async () => {
      const { createSession, validateSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      
      // Advance time but stay within timeout
      vi.advanceTimersByTime(5 * 60 * 1000);
      
      const result1 = await validateSession(session.accessToken);
      expect(result1.valid).toBe(true);
      
      // Advance time again
      vi.advanceTimersByTime(5 * 60 * 1000);
      
      const result2 = await validateSession(session.accessToken);
      expect(result2.valid).toBe(true); // Still valid because activity was updated
    });
  });

  describe('refreshSession', () => {
    it('should refresh access token', async () => {
      const { createSession, refreshSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      const result = await refreshSession(session.refreshToken);
      
      expect(result.success).toBe(true);
      expect(result.accessToken).toBeDefined();
    });

    it('should fail with invalid refresh token', async () => {
      const { refreshSession } = await import('@/lib/auth/session-manager');
      
      const result = await refreshSession('invalid-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid refresh token');
    });

    it('should fail for expired session', async () => {
      const { createSession, refreshSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      
      // Advance time past session timeout
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      const result = await refreshSession(session.refreshToken);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired');
    });
  });

  describe('terminateSession', () => {
    it('should terminate active session', async () => {
      const { createSession, terminateSession, validateSession } = await import('@/lib/auth/session-manager');
      
      const session = await createSession('user123', 'ADMIN');
      
      // Verify session is valid
      let result = await validateSession(session.accessToken);
      expect(result.valid).toBe(true);
      
      // Terminate
      await terminateSession(session.sessionId, 'User logout');
      
      // Verify session is no longer valid
      result = await validateSession(session.accessToken);
      expect(result.valid).toBe(false);
    });

    it('should audit log session termination', async () => {
      const { createSession, terminateSession } = await import('@/lib/auth/session-manager');
      const { auditLog } = await import('@/lib/audit/hipaa-audit');
      
      const mockRequest = {
        headers: new Headers(),
      } as unknown as NextRequest;
      
      const session = await createSession('user123', 'ADMIN');
      await terminateSession(session.sessionId, 'User logout', mockRequest);
      
      expect(auditLog).toHaveBeenCalledWith(
        mockRequest,
        expect.objectContaining({
          action: 'TERMINATE_SESSION',
          outcome: 'SUCCESS',
          reason: 'User logout',
        })
      );
    });
  });

  describe('getUserSessions', () => {
    it('should return all sessions for user', async () => {
      const { createSession, getUserSessions } = await import('@/lib/auth/session-manager');
      
      // Create multiple sessions for same user
      await createSession('user123', 'ADMIN');
      await createSession('user123', 'ADMIN');
      
      const sessions = await getUserSessions('user123');
      
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for user with no sessions', async () => {
      const { getUserSessions } = await import('@/lib/auth/session-manager');
      
      const sessions = await getUserSessions('nonexistent-user');
      
      expect(sessions).toEqual([]);
    });
  });

  describe('terminateAllUserSessions', () => {
    it('should terminate all user sessions', async () => {
      const { createSession, terminateAllUserSessions, getUserSessions } = await import('@/lib/auth/session-manager');
      
      // Create multiple sessions
      await createSession('user123', 'ADMIN');
      await createSession('user123', 'ADMIN');
      
      const count = await terminateAllUserSessions('user123', 'Security event');
      
      expect(count).toBeGreaterThanOrEqual(2);
      const sessionsAfter = await getUserSessions('user123');
      expect(sessionsAfter.length).toBe(0);
    });
  });

  describe('checkConcurrentSessions', () => {
    it('should allow sessions under limit', async () => {
      const { createSession, checkConcurrentSessions } = await import('@/lib/auth/session-manager');
      
      await createSession('user123', 'ADMIN');
      
      const result = await checkConcurrentSessions('user123');
      
      expect(result.allowed).toBe(true);
      expect(result.current).toBeGreaterThanOrEqual(1);
      expect(result.max).toBe(3);
    });

    it('should block sessions at limit', async () => {
      const { createSession, checkConcurrentSessions, terminateAllUserSessions } = await import('@/lib/auth/session-manager');
      
      // Clean up first
      await terminateAllUserSessions('limit-user', 'test cleanup');
      
      // Create max allowed sessions
      await createSession('limit-user', 'ADMIN');
      await createSession('limit-user', 'ADMIN');
      await createSession('limit-user', 'ADMIN');
      
      const result = await checkConcurrentSessions('limit-user');
      
      expect(result.allowed).toBe(false);
      expect(result.sessions).toBeDefined();
    });
  });

  describe('trackFailedAttempt', () => {
    it('should track failed login attempts', async () => {
      const { trackFailedAttempt } = await import('@/lib/auth/session-manager');
      
      const result1 = trackFailedAttempt('user@email.com');
      expect(result1.locked).toBe(false);
      expect(result1.attempts).toBe(1);
      
      const result2 = trackFailedAttempt('user@email.com');
      expect(result2.attempts).toBe(2);
    });

    it('should lock after max attempts', async () => {
      const { trackFailedAttempt } = await import('@/lib/auth/session-manager');
      
      // Use unique identifier to avoid conflicts with other tests
      const testEmail = `locktest-${Date.now()}@email.com`;
      
      for (let i = 0; i < 5; i++) {
        trackFailedAttempt(testEmail);
      }
      
      const result = trackFailedAttempt(testEmail);
      
      expect(result.locked).toBe(true);
      expect(result.timeRemaining).toBeDefined();
    });
  });

  describe('getSessionMetrics', () => {
    it('should return session metrics', async () => {
      const { createSession, getSessionMetrics } = await import('@/lib/auth/session-manager');
      
      await createSession('user1', 'ADMIN', 1);
      await createSession('user2', 'PROVIDER', 2);
      
      const metrics = await getSessionMetrics();
      
      expect(metrics.total).toBeGreaterThanOrEqual(2);
      expect(metrics.byRole).toBeDefined();
      expect(metrics.byClinic).toBeDefined();
      expect(metrics.averageAge).toBeGreaterThanOrEqual(0);
    });

    it('should track by role', async () => {
      const { createSession, getSessionMetrics, terminateAllUserSessions } = await import('@/lib/auth/session-manager');
      
      await terminateAllUserSessions('metrics-admin', 'test cleanup');
      await terminateAllUserSessions('metrics-provider', 'test cleanup');
      
      await createSession('metrics-admin', 'ADMIN', 1);
      await createSession('metrics-provider', 'PROVIDER', 1);
      
      const metrics = await getSessionMetrics();
      
      expect(metrics.byRole['ADMIN']).toBeGreaterThanOrEqual(1);
      expect(metrics.byRole['PROVIDER']).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('Session Security', () => {
  describe('Token Security', () => {
    it('should use HS256 algorithm', async () => {
      const { createSession } = await import('@/lib/auth/session-manager');
      const { JWT_SECRET } = await import('@/lib/auth/config');
      
      const session = await createSession('user123', 'ADMIN');
      const { protectedHeader } = await jwtVerify(session.accessToken, JWT_SECRET);
      
      expect(protectedHeader.alg).toBe('HS256');
    });

    it('should include JTI for token uniqueness', async () => {
      const { createSession } = await import('@/lib/auth/session-manager');
      const { JWT_SECRET } = await import('@/lib/auth/config');
      
      const session1 = await createSession('user123', 'ADMIN');
      const session2 = await createSession('user123', 'ADMIN');
      
      const { payload: p1 } = await jwtVerify(session1.accessToken, JWT_SECRET);
      const { payload: p2 } = await jwtVerify(session2.accessToken, JWT_SECRET);
      
      expect(p1.jti).toBeDefined();
      expect(p2.jti).toBeDefined();
      expect(p1.jti).not.toBe(p2.jti);
    });
  });

  describe('HIPAA Compliance', () => {
    it('should enforce idle timeout', async () => {
      const { createSession, validateSession } = await import('@/lib/auth/session-manager');
      vi.useFakeTimers();
      
      const session = await createSession('user123', 'ADMIN');
      
      // Advance past 15-minute timeout
      vi.advanceTimersByTime(16 * 60 * 1000);
      
      const result = await validateSession(session.accessToken);
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('inactivity');
      
      vi.useRealTimers();
    });

    it('should track session metadata for audit', async () => {
      const { createSession, getUserSessions } = await import('@/lib/auth/session-manager');
      
      const mockRequest = {
        headers: new Headers({
          'x-forwarded-for': '10.0.0.1',
          'user-agent': 'HIPAA-Test/1.0',
        }),
      } as unknown as NextRequest;
      
      await createSession('audit-user', 'ADMIN', 1, mockRequest);
      
      const sessions = await getUserSessions('audit-user');
      const latestSession = sessions[sessions.length - 1];
      
      expect(latestSession.ipAddress).toBe('10.0.0.1');
      expect(latestSession.userAgent).toBe('HIPAA-Test/1.0');
    });
  });
});

describe('Edge Cases', () => {
  it('should handle session without clinic', async () => {
    const { createSession, validateSession } = await import('@/lib/auth/session-manager');
    
    const session = await createSession('user123', 'SUPER_ADMIN');
    const result = await validateSession(session.accessToken);
    
    expect(result.valid).toBe(true);
    expect(result.session?.clinicId).toBeUndefined();
  });

  it('should handle request without headers', async () => {
    const { createSession } = await import('@/lib/auth/session-manager');
    
    const mockRequest = {
      headers: new Headers(),
    } as unknown as NextRequest;
    
    const session = await createSession('user123', 'ADMIN', 1, mockRequest);
    
    expect(session).toBeDefined();
  });

  it('should handle missing forwarded-for header', async () => {
    const { createSession, getUserSessions } = await import('@/lib/auth/session-manager');
    
    const mockRequest = {
      headers: new Headers({
        'user-agent': 'Test',
      }),
    } as unknown as NextRequest;
    
    await createSession('no-ip-user', 'ADMIN', 1, mockRequest);
    
    const sessions = await getUserSessions('no-ip-user');
    const latestSession = sessions[sessions.length - 1];
    
    expect(latestSession.ipAddress).toBe('unknown');
  });
});
