/**
 * Session Management Service
 * Handles user context and session state using AsyncLocalStorage
 */

import { AsyncLocalStorage } from 'async_hooks';
import { cookies } from 'next/headers';
import { jwtVerify } from 'jose';
import { JWT_SECRET } from './config';
import { logger } from '@/lib/logger';

// User session type
export interface UserSession {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'provider' | 'patient' | 'influencer';
  providerId?: number;
  patientId?: number;
  influencerId?: number;
  permissions?: string[];
  sessionId: string;
  expiresAt: Date;
}

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
      providerId: (payload.providerId as number  as number | undefined),
      patientId: payload.patientId as number | undefined,
      influencerId: payload.influencerId as number | undefined,
      permissions: payload.permissions as string[] | undefined,
      sessionId: payload.sessionId as string || generateSessionId(),
      expiresAt: new Date(payload.exp as number * 1000),
    };
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Token verification failed:', error);
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
    const tokenNames = ['auth-token', 'admin-token', 'provider-token', 'influencer-token', 'patient-token'];
    
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
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to get user from cookies:', error);
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
 * Session store for managing active sessions
 */
class SessionStore {
  private sessions: Map<string, UserSession> = new Map();
  private userSessions: Map<number, Set<string>> = new Map();

  /**
   * Add a session
   */
  add(session: UserSession): void {
    this.sessions.set(session.sessionId, session);
    
    // Track sessions by user
    if (!this.userSessions.has(session.id)) {
      this.userSessions.set(session.id, new Set());
    }
    this.userSessions.get(session.id)!.add(session.sessionId);
    
    // Set expiry timeout
    setTimeout(() => this.remove(session.sessionId), 
      session.expiresAt.getTime() - Date.now());
  }

  /**
   * Get a session
   */
  get(sessionId: string): UserSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    this.remove(sessionId);
    return undefined;
  }

  /**
   * Remove a session
   */
  remove(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.sessions.delete(sessionId);
      const userSessions = this.userSessions.get(session.id);
      if (userSessions) {
        userSessions.delete(sessionId);
        if (userSessions.size === 0) {
          this.userSessions.delete(session.id);
        }
      }
    }
  }

  /**
   * Remove all sessions for a user
   */
  removeUserSessions(userId: number): void {
    const sessionIds = this.userSessions.get(userId);
    if (sessionIds) {
      sessionIds.forEach((sessionId: any) => this.sessions.delete(sessionId));
      this.userSessions.delete(userId);
    }
  }

  /**
   * Get all sessions for a user
   */
  getUserSessions(userId: number): UserSession[] {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];
    
    return Array.from(sessionIds)
      .map((id: any) => this.get(id))
      .filter((session): session is UserSession => session !== undefined);
  }

  /**
   * Count active sessions
   */
  count(): number {
    return this.sessions.size;
  }

  /**
   * Count active users
   */
  countUsers(): number {
    return this.userSessions.size;
  }
}

// Global session store
export const sessionStore = new SessionStore();

/**
 * Middleware to inject user context
 */
export function withUserContext<T>(
  handler: (req: any, user: UserSession) => Promise<T>
) {
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
  if ((user.role as string) === "admin") return true;
  
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
 */
export function cleanupExpiredSessions(): void {
  const now = Date.now();
  let removed = 0;
  
  sessionStore['sessions'].forEach((session, sessionId) => {
    if (session.expiresAt.getTime() < now) {
      sessionStore.remove(sessionId);
      removed++;
    }
  });
  
  if (removed > 0) {
    logger.info(`Cleaned up ${removed} expired sessions`);
  }
}

// Run cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupExpiredSessions, 5 * 60 * 1000);
}
