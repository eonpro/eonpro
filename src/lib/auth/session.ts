/**
 * Session Management Service
 * Handles user context and session state using AsyncLocalStorage
 * Uses Redis for distributed session storage in production
 */

import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';
import { cookies, headers } from 'next/headers';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from './config';
import { logger } from '@/lib/logger';
import cache from '@/lib/cache/redis';
import { basePrisma } from '@/lib/db';
import { resolveSubdomainClinicId, hasClinicAccess } from './middleware-cache';

// User session type
export interface UserSession {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'provider' | 'patient' | 'affiliate' | 'super_admin' | 'staff' | 'support' | 'sales_rep' | 'pharmacy_rep';
  providerId?: number;
  patientId?: number;
  clinicId?: number;
  permissions?: string[];
  sessionId: string;
  expiresAt: Date;
}

// Session storage namespace
const SESSION_NAMESPACE = 'sessions';
const SESSION_TTL = 60 * 60 * 24; // 24 hours in seconds
const SESSION_INDEX_SET_PREFIX = 'user_sessions_set';

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
const AUTH_OP_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), AUTH_OP_TIMEOUT_MS)),
  ]);
}

export async function getUserFromCookies(): Promise<UserSession | null> {
  try {
    const cookieStore = await cookies();
    const selectedClinicCookie = cookieStore.get('selected-clinic')?.value;
    const selectedClinicId = selectedClinicCookie ? parseInt(selectedClinicCookie, 10) : NaN;

    // Resolve subdomain → clinicId directly from the host header.
    // The edge clinic middleware may be disabled (NEXT_PUBLIC_ENABLE_MULTI_CLINIC !== 'true')
    // so we cannot rely on the x-clinic-id header. The API auth middleware has its own
    // subdomain resolution, but server components only call this function — so it must
    // resolve the subdomain itself.
    let subdomainClinicId: number | null = null;
    let edgeClinicId = NaN;
    try {
      const headerStore = await headers();

      // Try x-clinic-id first (set by edge clinic middleware when enabled)
      const edgeHeader = headerStore.get('x-clinic-id');
      if (edgeHeader) edgeClinicId = parseInt(edgeHeader, 10);

      // Parse subdomain from host header (always available, regardless of middleware)
      if (!Number.isFinite(edgeClinicId) || edgeClinicId <= 0) {
        const host =
          headerStore.get('x-forwarded-host')?.split(',')[0]?.trim() ??
          headerStore.get('host') ??
          '';
        const hostname = host ? host.split(':')[0] ?? '' : '';
        if (hostname.includes('.')) {
          const parts = hostname.split('.');
          const isLocalhostWithSub = hostname.includes('localhost') && parts.length >= 2;
          const sub = parts.length >= 3 || isLocalhostWithSub ? parts[0] ?? null : null;
          const reserved = ['www', 'app', 'api', 'admin', 'staging'];
          if (sub && !reserved.includes(sub.toLowerCase())) {
            subdomainClinicId = await withTimeout(resolveSubdomainClinicId(sub), null);
          }
        }
      }
    } catch {
      // headers() may throw outside of request context (e.g. during build)
    }

    // Check various token cookies
    const tokenNames = [
      'auth-token',
      'super_admin-token',
      'admin-token',
      'provider-token',
      'affiliate-token',
      'patient-token',
      'staff-token',
      'support-token',
      'pharmacy_rep-token',
      'sales_rep-token',
    ];

    for (const tokenName of tokenNames) {
      const token = cookieStore.get(tokenName);
      if (token) {
        const user = await verifyToken(token.value);
        if (user) {
          if (user.role !== 'super_admin') {
            // Determine the target clinic ID.
            // Priority: subdomain (authoritative) > edge header > selected-clinic cookie
            const targetClinicId =
              subdomainClinicId != null && subdomainClinicId > 0
                ? subdomainClinicId
                : Number.isFinite(edgeClinicId) && edgeClinicId > 0
                  ? edgeClinicId
                  : Number.isFinite(selectedClinicId) && selectedClinicId > 0
                    ? selectedClinicId
                    : NaN;

            if (Number.isFinite(targetClinicId) && targetClinicId > 0 && user.clinicId !== targetClinicId) {
              const userHasAccess =
                user.clinicId === targetClinicId ||
                (await withTimeout(hasClinicAccess(user.id, targetClinicId, user.providerId), false));

              if (userHasAccess) {
                user.clinicId = targetClinicId;
              }
            }
          }
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
 * Generate a cryptographically secure session ID
 */
function generateSessionId(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Distributed session store using Redis
 * Falls back to in-memory only in development when Redis is unavailable
 */
class SessionStore {
  // In-memory fallback for development only
  private localSessions: Map<string, UserSession> = new Map();
  private localUserSessions: Map<number, Set<string>> = new Map();

  private namespacedKey(key: string): string {
    return `${SESSION_NAMESPACE}:${key}`;
  }

  private getLegacyUserSessionsKey(userId: number): string {
    return `user_sessions:${userId}`;
  }

  private getSetUserSessionsKey(userId: number): string {
    return `${SESSION_INDEX_SET_PREFIX}:${userId}`;
  }

  private parseSessionIdArray(raw: unknown): string[] {
    if (Array.isArray(raw)) {
      return raw.filter((v): v is string => typeof v === 'string');
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((v): v is string => typeof v === 'string');
        }
      } catch {
        return [];
      }
    }
    return [];
  }

  private async getUserSessionIdsFromRedis(userId: number): Promise<string[]> {
    const legacyKey = this.namespacedKey(this.getLegacyUserSessionsKey(userId));
    const setKey = this.namespacedKey(this.getSetUserSessionsKey(userId));

    return cache.withClient<string[]>(
      'sessionStore:getUserSessionIdsFromRedis',
      [],
      async (redis) => {
        const [legacyRaw, setMembersRaw] = await Promise.all([
          redis.get<unknown>(legacyKey),
          redis.smembers<unknown[]>(setKey),
        ]);

        const combined = new Set<string>();
        for (const id of this.parseSessionIdArray(legacyRaw)) combined.add(id);

        if (Array.isArray(setMembersRaw)) {
          for (const id of setMembersRaw) {
            if (typeof id === 'string') combined.add(id);
          }
        }

        return Array.from(combined);
      },
    );
  }

  /**
   * Add a session (uses Redis in production)
   */
  async add(session: UserSession): Promise<void> {
    const sessionKey = `session:${session.sessionId}`;
    const userSessionsKey = this.getLegacyUserSessionsKey(session.id);
    const userSessionsSetKey = this.getSetUserSessionsKey(session.id);

    // Try Redis first
    const redisAvailable = cache.isReady();

    if (redisAvailable) {
      // Store session in Redis
      await cache.set(sessionKey, session, {
        ttl: SESSION_TTL,
        namespace: SESSION_NAMESPACE,
      });

      // Track session ID in both new set index and legacy array index.
      // The dual-write keeps rollback compatibility while eliminating array race conditions.
      const indexed = await cache.withClient<boolean>(
        'sessionStore:addSessionIndex',
        false,
        async (redis) => {
          const legacyNsKey = this.namespacedKey(userSessionsKey);
          const setNsKey = this.namespacedKey(userSessionsSetKey);
          await redis.sadd(setNsKey, session.sessionId);
          await redis.expire(setNsKey, SESSION_TTL);

          const legacyRaw = await redis.get<unknown>(legacyNsKey);
          const existingSessions = this.parseSessionIdArray(legacyRaw);
          if (!existingSessions.includes(session.sessionId)) {
            existingSessions.push(session.sessionId);
          }
          await redis.set(legacyNsKey, JSON.stringify(existingSessions), { ex: SESSION_TTL });
          return true;
        },
      );
      if (!indexed) {
        logger.warn('[SessionStore] Failed to update Redis session indexes', {
          userId: session.id,
          sessionId: session.sessionId,
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

        // Remove from both set index and legacy array index.
        const userSessionsKey = this.getLegacyUserSessionsKey(session.id);
        const userSessionsSetKey = this.getSetUserSessionsKey(session.id);
        await cache.withClient<void>(
          'sessionStore:removeSessionIndex',
          undefined,
          async (redis) => {
            const legacyNsKey = this.namespacedKey(userSessionsKey);
            const setNsKey = this.namespacedKey(userSessionsSetKey);

            await redis.srem(setNsKey, sessionId);
            const setSize = await redis.scard(setNsKey);
            if (setSize > 0) {
              await redis.expire(setNsKey, SESSION_TTL);
            } else {
              await redis.del(setNsKey);
            }

            const legacyRaw = await redis.get<unknown>(legacyNsKey);
            const existingSessions = this.parseSessionIdArray(legacyRaw);
            const filtered = existingSessions.filter((id) => id !== sessionId);
            if (filtered.length > 0) {
              await redis.set(legacyNsKey, JSON.stringify(filtered), { ex: SESSION_TTL });
            } else {
              await redis.del(legacyNsKey);
            }
          },
        );
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
    const userSessionsKey = this.getLegacyUserSessionsKey(userId);
    const userSessionsSetKey = this.getSetUserSessionsKey(userId);

    if (cache.isReady()) {
      const sessionIds = await this.getUserSessionIdsFromRedis(userId);
      for (const sessionId of sessionIds) {
        await cache.delete(`session:${sessionId}`, { namespace: SESSION_NAMESPACE });
      }
      await cache.delete(userSessionsKey, { namespace: SESSION_NAMESPACE });
      await cache.withClient<void>(
        'sessionStore:removeAllSessionIndexes',
        undefined,
        async (redis) => {
          await redis.del(this.namespacedKey(userSessionsSetKey));
        },
      );
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
    const userSessionsKey = this.getLegacyUserSessionsKey(userId);

    if (cache.isReady()) {
      const sessionIds = await this.getUserSessionIdsFromRedis(userId);
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
  // Super admins and admins have all permissions
  if ((user.role as string) === 'super_admin' || (user.role as string) === 'admin') return true;

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
