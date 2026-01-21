/**
 * Authentication Tests
 * Tests for login, token generation, and authentication flow
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    provider: {
      findFirst: vi.fn(),
    },
    influencer: {
      findUnique: vi.fn(),
    },
    userAuditLog: {
      create: vi.fn(),
    },
  },
}));

// Mock rate limit
vi.mock('@/lib/rateLimit', () => ({
  strictRateLimit: (handler: Function) => handler,
  standardRateLimit: (handler: Function) => handler,
  relaxedRateLimit: (handler: Function) => handler,
  rateLimit: () => (handler: Function) => handler,
}));

// Mock logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    security: vi.fn(),
  },
}));

import { prisma } from '@/lib/db';

describe('Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Login Validation', () => {
    it('should reject empty email', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: '',
        password: 'password123',
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should reject invalid email format', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'not-an-email',
        password: 'password123',
      });
      
      expect(result.success).toBe(false);
    });

    it('should accept valid login input', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
        role: 'admin',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
        expect(result.data.role).toBe('admin');
      }
    });

    it('should lowercase email', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'USER@EXAMPLE.COM',
        password: 'password123',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('user@example.com');
      }
    });

    it('should default role to patient', async () => {
      const { loginSchema } = await import('@/lib/validation/schemas');
      
      const result = loginSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe('patient');
      }
    });
  });

  describe('Password Validation', () => {
    it('should reject password less than 12 characters', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('Short1!');
      
      expect(result.success).toBe(false);
    });

    it('should reject password without uppercase', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('password123!@#');
      
      expect(result.success).toBe(false);
    });

    it('should reject password without lowercase', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('PASSWORD123!@#');
      
      expect(result.success).toBe(false);
    });

    it('should reject password without number', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('PasswordStrong!@#');
      
      expect(result.success).toBe(false);
    });

    it('should reject password without special character', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('Password12345');
      
      expect(result.success).toBe(false);
    });

    it('should accept strong password', async () => {
      const { passwordSchema } = await import('@/lib/validation/schemas');
      
      const result = passwordSchema.safeParse('StrongP@ssw0rd!');
      
      expect(result.success).toBe(true);
    });
  });

  describe('Password Hashing', () => {
    it('should hash password correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(password.length);
    });

    it('should verify correct password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare(password, hash);
      
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'TestPassword123!';
      const hash = await bcrypt.hash(password, 10);
      
      const isValid = await bcrypt.compare('WrongPassword123!', hash);
      
      expect(isValid).toBe(false);
    });
  });

  describe('Reset Password Validation', () => {
    it('should validate reset password request', async () => {
      const { resetPasswordRequestSchema } = await import('@/lib/validation/schemas');
      
      const result = resetPasswordRequestSchema.safeParse({
        email: 'user@example.com',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate password reset with matching passwords', async () => {
      const { resetPasswordSchema } = await import('@/lib/validation/schemas');
      
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token-123',
        newPassword: 'NewStrongP@ss1!',
        confirmPassword: 'NewStrongP@ss1!',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject password reset with non-matching passwords', async () => {
      const { resetPasswordSchema } = await import('@/lib/validation/schemas');
      
      const result = resetPasswordSchema.safeParse({
        token: 'valid-token-123',
        newPassword: 'NewStrongP@ss1!',
        confirmPassword: 'DifferentP@ss1!',
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('JWT Token Generation', () => {
  it('should generate token with correct claims', async () => {
    // This would test the actual JWT generation
    // For now, we verify the config is correct
    const { AUTH_CONFIG } = await import('@/lib/auth/config');
    
    expect(AUTH_CONFIG.tokenExpiry.access).toBeDefined();
    expect(AUTH_CONFIG.tokenExpiry.refresh).toBeDefined();
    expect(AUTH_CONFIG.security.maxLoginAttempts).toBe(3);
    expect(AUTH_CONFIG.security.passwordMinLength).toBe(12);
  });

  it('should have secure cookie settings', async () => {
    const { AUTH_CONFIG } = await import('@/lib/auth/config');
    
    expect(AUTH_CONFIG.cookie.httpOnly).toBe(true);
    // 'lax' is the correct setting - allows same-origin while preventing CSRF
    expect(AUTH_CONFIG.cookie.sameSite).toBe('lax');
    expect(AUTH_CONFIG.cookie.path).toBe('/');
  });
});
