/**
 * Session Management Service
 * Handles user context and session state using AsyncLocalStorage
 * Uses Redis for distributed session storage in production
 */

import { AsyncLocalStorage } from 'async_hooks';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from './config';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';

// User session type
export interface UserSession {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'provider' | 'patient' | 'influencer' | 'super_admin' | 'staff' | 'support';
  providerId?: number;
  patientId?: number;
  influencerId?: number;
  clinicId?: number;
  permissions?: string[];
  sessionId: string;
  expiresAt: Date;
}

// Session storage namespace
const SESSION_NAMESPACE = 'sessions';
const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds

// Create AsyncLocalStorage for user context
const sessionStorage = new AsyncLocalStorage<UserSession>();

/**
 * Get current user from async context
 */
export function getCurrentUser(): UserSession | null {
  const store = sessionStorage.getStore();
  return store || null;
}

/**
 * Run code with user context
 */
export function runWithUser<T>(user: UserSession, fn: () => T): T {
  return sessionStorage.run(user, fn);
}

/**
 * Verify and decode JWT token
 */
export async function verifyToken(token: string): Promise<UserSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    return {
      id: payload.id as number,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as UserSession['role'],
      providerId: payload.providerId as number | undefined,
      patientId: payload.patientId as number | undefined,
      influencerId: payload.influencerId as number | undefined,
      clinicId: payload.clinicId as number | undefined,
      permissions: payload.permissions as string[] | undefined,
      sessionId: (payload.sessionId as string) || generateSessionId(),
      expiresAt: new Date((payload.exp as number) * 1000),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Token verification failed:',
      error instanceof Error ? error : new Error(errorMessage)
    );
    return null;
  }
}

/**
 * Get user session from request cookies
 */
export async function getUserFromCookies(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();

    // Check various token cookies
    const tokenNames = [
      'auth-token',
      'super_admin-token',
      'admin-token',
      'provider-token',
      'influencer-token',
      'patient-token',
      'staff-token',
      'support-token',
    ];

    for (const tokenName of tokenNames) {
      const token = cookieStore.get(tokenName);
      if (token) {
        const user = await verifyToken(token.value);
        if (user) {
          return user;
        }
      }
    }

    return null;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(
      'Failed to get user from cookies:',
      error instanceof Error ? error : new Error(errorMessage)
    );
    return null;
  }
}

/**
 * Get user session from authorization header
 */
export async function getUserFromHeader(authHeader: string | null): Promise<UserSession | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  return await verifyToken(token);
}

/**
 * Create a new session for a user
 */
export function createSession(user: Omit<UserSession, 'sessionId' | 'expiresAt'>): UserSession {
  return {
    ...user,
    sessionId: generateSessionId(),
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
  };
}

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Distributed session store using Redis
 * Falls back to in-memory only in development when Redis is unavailable
 */
class SessionStore {
  // In-memory fallback for development only
  private localSessions: Map<string, UserSession> = new Map();
  private localUserSessions: Map<number, Set<string>> = new Map();

  /**
   * Add a session (uses Redis in production)
   */
  async add(session: UserSession): Promise<void> {
    const sessionKey = `session:${session.sessionId}`;
    const userSessionsKey = `user_sessions:${session.id}`;

    // Try Redis first
    const redisAvailable = cache.isReady();

    if (redisAvailable) {
      // Store session in Redis
      await cache.set(sessionKey, session, {
        ttl: SESSION_TTL,
        namespace: SESSION_NAMESPACE,
      });

      // Track session ID in user's session list
      const existingSessions =
        (await cache.get<string[]>(userSessionsKey, { namespace: SESSION_NAMESPACE })) || [];
      if (!existingSessions.includes(session.sessionId)) {
        existingSessions.push(session.sessionId);
        await cache.set(userSessionsKey, existingSessions, {
          ttl: SESSION_TTL,
          namespace: SESSION_NAMESPACE,
        });
      }
    } else {
      // Fallback to in-memory (development only)
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Redis unavailable in production - sessions will not persist across restarts');
      }

      this.localSessions.set(session.sessionId, session);

      if (!this.localUserSessions.has(session.id)) {
        this.localUserSessions.set(session.id, new Set());
      }
      this.localUserSessions.get(session.id)!.add(session.sessionId);

      // Set expiry timeout for in-memory
      const ttlMs = session.expiresAt.getTime() - Date.now();
      if (ttlMs > 0) {
        setTimeout(() => this.remove(session.sessionId), ttlMs);
      }
    }
  }

  /**
   * Get a session (checks Redis first)
   */
  async get(sessionId: string): Promise<UserSession | undefined> {
    const sessionKey = `session:${sessionId}`;

    // Try Redis first
    if (cache.isReady()) {
      const session = await cache.get<UserSession>(sessionKey, { namespace: SESSION_NAMESPACE });
      if (session && new Date(session.expiresAt) > new Date()) {
        return session;
      }
      if (session) {
        await this.remove(sessionId);
      }
      return undefined;
    }

    // Fallback to in-memory
    const session = this.localSessions.get(sessionId);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    if (session) {
      await this.remove(sessionId);
    }
    return undefined;
  }

  /**
   * Remove a session
   */
  async remove(sessionId: string): Promise<void> {
    const sessionKey = `session:${sessionId}`;

    if (cache.isReady()) {
      const session = await cache.get<UserSession>(sessionKey, { namespace: SESSION_NAMESPACE });
      if (session) {
        await cache.delete(sessionKey, { namespace: SESSION_NAMESPACE });

        // Remove from user's session list
        const userSessionsKey = `user_sessions:${session.id}`;
        const existingSessions =
          (await cache.get<string[]>(userSessionsKey, { namespace: SESSION_NAMESPACE })) || [];
        const filtered = existingSessions.filter((id) => id !== sessionId);
        if (filtered.length > 0) {
          await cache.set(userSessionsKey, filtered, {
            ttl: SESSION_TTL,
            namespace: SESSION_NAMESPACE,
          });
        } else {
          await cache.delete(userSessionsKey, { namespace: SESSION_NAMESPACE });
        }
      }
    } else {
      // Fallback to in-memory
      const session = this.localSessions.get(sessionId);
      if (session) {
        this.localSessions.delete(sessionId);
        const userSessions = this.localUserSessions.get(session.id);
        if (userSessions) {
          userSessions.delete(sessionId);
          if (userSessions.size === 0) {
            this.localUserSessions.delete(session.id);
          }
        }
      }
    }
  }

  /**
   * Remove all sessions for a user
   */
  async removeUserSessions(userId: number): Promise<void> {
    const userSessionsKey = `user_sessions:${userId}`;

    if (cache.isReady()) {
      const sessionIds =
        (await cache.get<string[]>(userSessionsKey, { namespace: SESSION_NAMESPACE })) || [];
      for (const sessionId of sessionIds) {
        await cache.delete(`session:${sessionId}`, { namespace: SESSION_NAMESPACE });
      }
      await cache.delete(userSessionsKey, { namespace: SESSION_NAMESPACE });
    } else {
      // Fallback to in-memory
      const sessionIds = this.localUserSessions.get(userId);
      if (sessionIds) {
        sessionIds.forEach((sessionId: string) => this.localSessions.delete(sessionId));
        this.localUserSessions.delete(userId);
      }
    }
  }

  /**
   * Get all sessions for a user
   */
  async getUserSessions(userId: number): Promise<UserSession[]> {
    const userSessionsKey = `user_sessions:${userId}`;

    if (cache.isReady()) {
      const sessionIds =
        (await cache.get<string[]>(userSessionsKey, { namespace: SESSION_NAMESPACE })) || [];
      const sessions: UserSession[] = [];

      for (const sessionId of sessionIds) {
        const session = await this.get(sessionId);
        if (session) {
          sessions.push(session);
        }
      }

      return sessions;
    }

    // Fallback to in-memory
    const sessionIds = this.localUserSessions.get(userId);
    if (!sessionIds) return [];

    const sessions: UserSession[] = [];
    for (const id of sessionIds) {
      const session = await this.get(id);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  /**
   * Count active sessions (approximate in distributed mode)
   */
  count(): number {
    // In-memory count only - Redis count would require SCAN
    return this.localSessions.size;
  }

  /**
   * Count active users (approximate in distributed mode)
   */
  countUsers(): number {
    return this.localUserSessions.size;
  }
}

// Global session store
export const sessionStore = new SessionStore();

/**
 * Middleware to inject user context
 */
export function withUserContext<T>(handler: (req: any, user: UserSession) => Promise<T>) {
  return async (req: any): Promise<T> => {
    // Try to get user from various sources
    let user: UserSession | null = null;

    // Check authorization header
    const authHeader = req.headers.get('authorization');
    if (authHeader) {
      user = await getUserFromHeader(authHeader);
    }

    // Check cookies if no auth header
    if (!user) {
      user = await getUserFromCookies();
    }

    if (!user) {
      throw new Error('Authentication required');
    }

    // Run handler with user context
    return runWithUser(user, () => handler(req, user));
  };
}

/**
 * Check if user has permission
 */
export function hasPermission(user: UserSession, permission: string): boolean {
  // Admins have all permissions
  if ((user.role as string) === 'admin') return true;

  // Check specific permissions
  return user.permissions?.includes(permission) || false;
}

/**
 * Check if user has any of the required roles
 */
export function hasRole(user: UserSession, roles: string[]): boolean {
  return roles.includes(user.role);
}

/**
 * Session cleanup - run periodically
 * Note: Redis handles TTL automatically, this is for in-memory fallback
 */
export async function cleanupExpiredSessions(): Promise<void> {
  // Only cleanup local sessions - Redis uses TTL
  const now = Date.now();
  let removed = 0;

  // Access the private local sessions for cleanup
  const localSessions = (sessionStore as unknown as { localSessions: Map<string, UserSession> })
    .localSessions;

  for (const [sessionId, session] of localSessions) {
    if (session.expiresAt.getTime() < now) {
      await sessionStore.remove(sessionId);
      removed++;
    }
  }

  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired local sessions`);
  }
}

// Run cleanup every 5 minutes (for in-memory fallback)
if (typeof setInterval !== 'undefined') {
  setInterval(
    () => {
      cleanupExpiredSessions().catch((err) => {
        logger.error('Session cleanup error:', err instanceof Error ? err : new Error(String(err)));
      });
    },
    5 * 60 * 1000
  );
}
