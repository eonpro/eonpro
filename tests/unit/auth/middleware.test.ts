/**
 * Authentication Middleware Unit Tests
 * Tests for the core authentication functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SignJWT } from 'jose';

// Import the functions we want to test
import {
  withAuth,
  withAdminAuth,
  withProviderAuth,
  getCurrentUser,
  hasRole,
  hasPermission,
  canAccessClinic,
  type AuthUser,
  type UserRole,
} from '@/lib/auth/middleware';

// Test utilities
const createMockRequest = (
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  options: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): NextRequest => {
  const headers = new Headers(options.headers);
  
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('cookie', cookieString);
  }

  return new NextRequest(url, { method, headers });
};

const createValidToken = async (payload: Partial<AuthUser> = {}): Promise<string> => {
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  
  return new SignJWT({
    id: 1,
    email: 'test@example.com',
    role: 'admin' as UserRole,
    clinicId: 1,
    tokenVersion: 1,
    ...payload,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
};

describe('Authentication Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withAuth', () => {
    it('should reject requests without authentication token', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const request = createMockRequest();
      const response = await authHandler(request);
      
      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
      
      const body = await response.json();
      expect(body.error).toBe('Authentication required');
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('should accept requests with valid Bearer token', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const token = await createValidToken();
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should accept requests with valid cookie token', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const token = await createValidToken();
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        cookies: { 'auth-token': token },
      });
      
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
    });

    it('should reject demo tokens', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: 'Bearer some-demo-token-here' },
      });
      
      const response = await authHandler(request);
      
      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should reject test tokens', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: 'Bearer mock-test-token' },
      });
      
      const response = await authHandler(request);
      
      expect(response.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const expiredToken = await new SignJWT({
        id: 1,
        email: 'test@example.com',
        role: 'admin',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200) // 2 hours ago
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
        .sign(secret);
      
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      
      const response = await authHandler(request);
      
      expect(response.status).toBe(401);
      
      const body = await response.json();
      // Expired tokens may be returned as either EXPIRED or INVALID depending on Jose version
      expect(['EXPIRED', 'INVALID']).toContain(body.code);
    });

    it('should pass through for optional auth without token', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler, { optional: true });
      
      const request = createMockRequest();
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should enforce role-based access', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler, { roles: ['super_admin'] });
      
      const token = await createValidToken({ role: 'patient' });
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
      
      const body = await response.json();
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should allow access with correct role', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler, { roles: ['admin', 'super_admin'] });
      
      const token = await createValidToken({ role: 'admin' });
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
    });

    it('should add security headers to response', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAuth(handler);
      
      const token = await createValidToken();
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(response.headers.get('X-Request-ID')).toBeTruthy();
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });
  });

  describe('withAdminAuth', () => {
    it('should allow admin access', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAdminAuth(handler);
      
      const token = await createValidToken({ role: 'admin' });
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
    });

    it('should allow super_admin access', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAdminAuth(handler);
      
      const token = await createValidToken({ role: 'super_admin' });
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(handler).toHaveBeenCalled();
    });

    it('should reject non-admin roles', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const authHandler = withAdminAuth(handler);
      
      const token = await createValidToken({ role: 'patient' });
      const request = createMockRequest('GET', 'http://localhost:3000/api/test', {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      const response = await authHandler(request);
      
      expect(response.status).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Helper Functions', () => {
    describe('hasRole', () => {
      it('should return true when user has matching role', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
        };
        
        expect(hasRole(user, ['admin', 'super_admin'])).toBe(true);
      });

      it('should return false when user does not have matching role', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'patient',
        };
        
        expect(hasRole(user, ['admin', 'super_admin'])).toBe(false);
      });

      it('should return false for null user', () => {
        expect(hasRole(null, ['admin'])).toBe(false);
      });
    });

    describe('hasPermission', () => {
      it('should return true when user has permission', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
          permissions: ['patients:read', 'patients:write'],
        };
        
        expect(hasPermission(user, 'patients:read')).toBe(true);
      });

      it('should return false when user lacks permission', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
          permissions: ['patients:read'],
        };
        
        expect(hasPermission(user, 'patients:delete')).toBe(false);
      });

      it('should return false for user without permissions array', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
        };
        
        expect(hasPermission(user, 'patients:read')).toBe(false);
      });
    });

    describe('canAccessClinic', () => {
      it('should allow super_admin to access any clinic', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'super_admin',
          clinicId: 1,
        };
        
        expect(canAccessClinic(user, 2)).toBe(true);
        expect(canAccessClinic(user, 99)).toBe(true);
      });

      it('should allow user to access their own clinic', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
          clinicId: 1,
        };
        
        expect(canAccessClinic(user, 1)).toBe(true);
      });

      it('should deny access to other clinics', () => {
        const user: AuthUser = {
          id: 1,
          email: 'test@example.com',
          role: 'admin',
          clinicId: 1,
        };
        
        expect(canAccessClinic(user, 2)).toBe(false);
      });

      it('should return false for null user', () => {
        expect(canAccessClinic(null, 1)).toBe(false);
      });
    });
  });
});
