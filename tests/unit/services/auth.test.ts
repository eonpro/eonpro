import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    patient: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    oTP: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Authentication Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Password Validation', () => {
    const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];
      
      if (password.length < 8) {
        errors.push('Password must be at least 8 characters');
      }
      if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
      }
      if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
      }
      if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
      }
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        errors.push('Password must contain at least one special character');
      }
      
      return { valid: errors.length === 0, errors };
    };

    it('accepts strong passwords', () => {
      const result = validatePassword('SecurePass123!');
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects short passwords', () => {
      const result = validatePassword('Ab1!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 8 characters');
    });

    it('requires uppercase letters', () => {
      const result = validatePassword('password123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('requires lowercase letters', () => {
      const result = validatePassword('PASSWORD123!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('requires numbers', () => {
      const result = validatePassword('SecurePass!');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('requires special characters', () => {
      const result = validatePassword('SecurePass123');
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('OTP Generation', () => {
    const generateOTP = (length: number = 6): string => {
      return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
    };

    it('generates OTP of correct length', () => {
      const otp = generateOTP(6);
      expect(otp).toHaveLength(6);
      expect(/^\d+$/.test(otp)).toBe(true);
    });

    it('generates numeric only OTP', () => {
      for (let i = 0; i < 100; i++) {
        const otp = generateOTP(6);
        expect(/^\d{6}$/.test(otp)).toBe(true);
      }
    });

    it('supports custom lengths', () => {
      expect(generateOTP(4)).toHaveLength(4);
      expect(generateOTP(8)).toHaveLength(8);
    });
  });

  describe('OTP Expiration', () => {
    const isOTPExpired = (createdAt: Date, expiryMinutes: number = 5): boolean => {
      const now = new Date();
      const expiryTime = new Date(createdAt.getTime() + expiryMinutes * 60 * 1000);
      return now > expiryTime;
    };

    it('returns false for fresh OTP', () => {
      const createdAt = new Date();
      expect(isOTPExpired(createdAt, 5)).toBe(false);
    });

    it('returns true for expired OTP', () => {
      const createdAt = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      expect(isOTPExpired(createdAt, 5)).toBe(true);
    });

    it('respects custom expiry times', () => {
      const createdAt = new Date(Date.now() - 3 * 60 * 1000); // 3 minutes ago
      expect(isOTPExpired(createdAt, 5)).toBe(false);
      expect(isOTPExpired(createdAt, 2)).toBe(true);
    });
  });

  describe('Phone Number Validation', () => {
    const validatePhoneNumber = (phone: string): boolean => {
      // Remove all non-numeric characters
      const cleaned = phone.replace(/\D/g, '');
      // US phone numbers: 10 digits, or 11 digits starting with 1
      return cleaned.length === 10 || (cleaned.length === 11 && cleaned.startsWith('1'));
    };

    const formatPhoneNumber = (phone: string): string => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      }
      if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      }
      return phone;
    };

    it('validates 10-digit phone numbers', () => {
      expect(validatePhoneNumber('1234567890')).toBe(true);
      expect(validatePhoneNumber('(123) 456-7890')).toBe(true);
      expect(validatePhoneNumber('123-456-7890')).toBe(true);
    });

    it('validates 11-digit phone numbers starting with 1', () => {
      expect(validatePhoneNumber('11234567890')).toBe(true);
      expect(validatePhoneNumber('+1 (123) 456-7890')).toBe(true);
    });

    it('rejects invalid phone numbers', () => {
      expect(validatePhoneNumber('123456')).toBe(false);
      expect(validatePhoneNumber('12345678901234')).toBe(false);
      expect(validatePhoneNumber('')).toBe(false);
    });

    it('formats phone numbers to E.164', () => {
      expect(formatPhoneNumber('1234567890')).toBe('+11234567890');
      expect(formatPhoneNumber('(123) 456-7890')).toBe('+11234567890');
      expect(formatPhoneNumber('11234567890')).toBe('+11234567890');
    });
  });

  describe('Email Validation', () => {
    const validateEmail = (email: string): boolean => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    };

    it('validates correct email formats', () => {
      expect(validateEmail('user@example.com')).toBe(true);
      expect(validateEmail('user.name@example.com')).toBe(true);
      expect(validateEmail('user+tag@example.com')).toBe(true);
      expect(validateEmail('user@subdomain.example.com')).toBe(true);
    });

    it('rejects invalid email formats', () => {
      expect(validateEmail('user')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('Token Generation', () => {
    const generateSecureToken = (length: number = 32): string => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      return Array.from(
        { length },
        () => chars.charAt(Math.floor(Math.random() * chars.length))
      ).join('');
    };

    it('generates tokens of specified length', () => {
      expect(generateSecureToken(32)).toHaveLength(32);
      expect(generateSecureToken(64)).toHaveLength(64);
    });

    it('generates unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken(32));
      }
      expect(tokens.size).toBe(100);
    });
  });

  describe('Session Management', () => {
    interface Session {
      id: string;
      userId: number;
      createdAt: Date;
      expiresAt: Date;
      ipAddress: string;
      userAgent: string;
    }

    const createSession = (
      userId: number,
      ipAddress: string,
      userAgent: string,
      expiryHours: number = 24
    ): Session => {
      const now = new Date();
      return {
        id: Math.random().toString(36).substring(2),
        userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + expiryHours * 60 * 60 * 1000),
        ipAddress,
        userAgent,
      };
    };

    const isSessionValid = (session: Session): boolean => {
      return new Date() < session.expiresAt;
    };

    it('creates session with correct expiry', () => {
      const session = createSession(1, '127.0.0.1', 'Mozilla/5.0', 24);
      
      expect(session.userId).toBe(1);
      expect(session.ipAddress).toBe('127.0.0.1');
      expect(isSessionValid(session)).toBe(true);
      
      // Check expiry is approximately 24 hours from now
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      expect(session.expiresAt.getTime()).toBeCloseTo(expectedExpiry, -3);
    });

    it('detects expired sessions', () => {
      const session = createSession(1, '127.0.0.1', 'Mozilla/5.0', 24);
      session.expiresAt = new Date(Date.now() - 1000); // 1 second ago
      
      expect(isSessionValid(session)).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    class RateLimiter {
      private attempts: Map<string, number[]> = new Map();
      
      constructor(
        private maxAttempts: number,
        private windowMs: number
      ) {}
      
      isAllowed(key: string): boolean {
        const now = Date.now();
        const attempts = this.attempts.get(key) || [];
        
        // Remove old attempts outside the window
        const recentAttempts = attempts.filter(t => now - t < this.windowMs);
        
        if (recentAttempts.length >= this.maxAttempts) {
          return false;
        }
        
        recentAttempts.push(now);
        this.attempts.set(key, recentAttempts);
        return true;
      }
      
      getRemainingAttempts(key: string): number {
        const now = Date.now();
        const attempts = this.attempts.get(key) || [];
        const recentAttempts = attempts.filter(t => now - t < this.windowMs);
        return Math.max(0, this.maxAttempts - recentAttempts.length);
      }
      
      reset(key: string): void {
        this.attempts.delete(key);
      }
    }

    it('allows requests within limit', () => {
      const limiter = new RateLimiter(5, 60000); // 5 attempts per minute
      const key = 'test@example.com';
      
      for (let i = 0; i < 5; i++) {
        expect(limiter.isAllowed(key)).toBe(true);
      }
    });

    it('blocks requests exceeding limit', () => {
      const limiter = new RateLimiter(3, 60000);
      const key = 'test@example.com';
      
      expect(limiter.isAllowed(key)).toBe(true);
      expect(limiter.isAllowed(key)).toBe(true);
      expect(limiter.isAllowed(key)).toBe(true);
      expect(limiter.isAllowed(key)).toBe(false);
    });

    it('tracks remaining attempts', () => {
      const limiter = new RateLimiter(5, 60000);
      const key = 'test@example.com';
      
      expect(limiter.getRemainingAttempts(key)).toBe(5);
      limiter.isAllowed(key);
      expect(limiter.getRemainingAttempts(key)).toBe(4);
    });

    it('resets attempts', () => {
      const limiter = new RateLimiter(3, 60000);
      const key = 'test@example.com';
      
      limiter.isAllowed(key);
      limiter.isAllowed(key);
      limiter.reset(key);
      
      expect(limiter.getRemainingAttempts(key)).toBe(3);
    });
  });

  describe('Login Attempts Tracking', () => {
    interface LoginAttempt {
      email: string;
      successful: boolean;
      ipAddress: string;
      timestamp: Date;
    }

    const shouldLockAccount = (attempts: LoginAttempt[], maxFailures: number = 5): boolean => {
      const recentFailures = attempts
        .filter(a => !a.successful)
        .filter(a => Date.now() - a.timestamp.getTime() < 15 * 60 * 1000); // 15 minutes
      
      return recentFailures.length >= maxFailures;
    };

    it('locks account after max failures', () => {
      const attempts: LoginAttempt[] = Array(5).fill(null).map(() => ({
        email: 'test@example.com',
        successful: false,
        ipAddress: '127.0.0.1',
        timestamp: new Date(),
      }));
      
      expect(shouldLockAccount(attempts, 5)).toBe(true);
    });

    it('does not lock with successful logins', () => {
      const attempts: LoginAttempt[] = [
        { email: 'test@example.com', successful: false, ipAddress: '127.0.0.1', timestamp: new Date() },
        { email: 'test@example.com', successful: true, ipAddress: '127.0.0.1', timestamp: new Date() },
      ];
      
      expect(shouldLockAccount(attempts, 5)).toBe(false);
    });

    it('ignores old failed attempts', () => {
      const oldTime = new Date(Date.now() - 20 * 60 * 1000); // 20 minutes ago
      const attempts: LoginAttempt[] = Array(5).fill(null).map(() => ({
        email: 'test@example.com',
        successful: false,
        ipAddress: '127.0.0.1',
        timestamp: oldTime,
      }));
      
      expect(shouldLockAccount(attempts, 5)).toBe(false);
    });
  });
});

describe('JWT Token Handling', () => {
  describe('Token Payload Validation', () => {
    interface TokenPayload {
      sub: number;
      email: string;
      role: string;
      clinicId?: number;
      iat: number;
      exp: number;
    }

    const isTokenExpired = (payload: TokenPayload): boolean => {
      return Date.now() >= payload.exp * 1000;
    };

    const hasRequiredClaims = (payload: Partial<TokenPayload>): boolean => {
      return !!(payload.sub && payload.email && payload.role && payload.iat && payload.exp);
    };

    it('detects expired tokens', () => {
      const expiredPayload: TokenPayload = {
        sub: 1,
        email: 'test@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000) - 3600,
        exp: Math.floor(Date.now() / 1000) - 1800, // Expired 30 min ago
      };
      
      expect(isTokenExpired(expiredPayload)).toBe(true);
    });

    it('validates active tokens', () => {
      const activePayload: TokenPayload = {
        sub: 1,
        email: 'test@example.com',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };
      
      expect(isTokenExpired(activePayload)).toBe(false);
    });

    it('validates required claims', () => {
      const validPayload = {
        sub: 1,
        email: 'test@example.com',
        role: 'admin',
        iat: Date.now(),
        exp: Date.now() + 3600000,
      };
      
      expect(hasRequiredClaims(validPayload)).toBe(true);
      expect(hasRequiredClaims({ sub: 1 })).toBe(false);
      expect(hasRequiredClaims({})).toBe(false);
    });
  });
});
