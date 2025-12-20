/**
 * Centralized authentication configuration
 * HIPAA-compliant JWT secret management with enhanced security
 */

import crypto from 'crypto';
import { logger } from '@/lib/logger';

// Security constants
const MIN_SECRET_LENGTH = 32; // Minimum 256 bits
const WEAK_SECRET_PATTERNS = [
  'secret', 'password', '123456', 'admin', 'default',
  'test', 'demo', 'example', 'changeme', 'temporary',
  'dev-secret', 'placeholder'
];

// Validate JWT_SECRET is set at initialization
let jwtSecret = process.env.JWT_SECRET;

// During build, use a placeholder
if (!jwtSecret && process.argv.includes('build')) {
  jwtSecret = 'BUILD-TIME-PLACEHOLDER-REPLACE-BEFORE-RUNTIME';
}

// CRITICAL: No default secrets in any environment for HIPAA compliance
if (!jwtSecret) {
  const errorMsg = `
SECURITY ERROR: JWT_SECRET environment variable is required for HIPAA compliance.

To generate a secure secret, run:
  openssl rand -base64 32

Then add to your .env file:
  JWT_SECRET=<generated-secret>

This is required even in development to prevent accidental PHI exposure.
`;
  
  if (process.env.NODE_ENV === 'production') {
    logger.security('CRITICAL: Missing JWT_SECRET in production');
  }
  
  throw new Error(errorMsg);
}

// Validate secret strength
if (jwtSecret.length < MIN_SECRET_LENGTH) {
  const errorMsg = `JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters. Current: ${jwtSecret.length}`;
  logger.security(errorMsg);
  throw new Error(errorMsg);
}

// Check for weak secrets (skip during build)
if (!process.argv.includes('build')) {
  const secretLower = jwtSecret.toLowerCase();
  const hasWeakPattern = WEAK_SECRET_PATTERNS.some(pattern => 
    secretLower.includes(pattern)
  );

  if (hasWeakPattern) {
    const errorMsg = 'JWT_SECRET contains weak patterns. Use a cryptographically secure random value.';
    logger.security(errorMsg);
    
    // In production, this is fatal
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMsg);
    } else {
      logger.warn('⚠️  Using weak JWT_SECRET in development - change before production!');
    }
  }
}

// Calculate entropy score (skip during build)
if (!process.argv.includes('build')) {
  const hasUpperCase = /[A-Z]/.test(jwtSecret);
  const hasLowerCase = /[a-z]/.test(jwtSecret);
  const hasNumbers = /[0-9]/.test(jwtSecret);
  const hasSpecialChars = /[^A-Za-z0-9]/.test(jwtSecret);
  const entropyScore = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChars].filter(Boolean).length;

  if (entropyScore < 3) {
    logger.warn('JWT_SECRET has low entropy', { entropyScore });
  }
}

// Export the encoded JWT secret for use across the application
export const JWT_SECRET = new TextEncoder().encode(jwtSecret);

// Generate refresh token secret (derive from main secret)
const refreshSecret = process.env.JWT_REFRESH_SECRET || 
  crypto.createHash('sha256')
    .update(jwtSecret + '-refresh-' + process.env.NODE_ENV)
    .digest('base64');

export const JWT_REFRESH_SECRET = new TextEncoder().encode(refreshSecret);

// Token version for rotation (increment to invalidate all tokens)
export const TOKEN_VERSION = parseInt(process.env.TOKEN_VERSION || '1', 10);

// Additional auth configuration - HIPAA compliant settings
export const AUTH_CONFIG = {
  // JWT token expiration times (HIPAA requires short-lived tokens)
  tokenExpiry: {
    access: process.env.NODE_ENV === 'production' ? '15m' : '1h', // 15 min in prod
    refresh: '7d',
    influencer: '8h',
    provider: '4h', // Shorter for providers accessing PHI
    patient: '30m', // Shortest for patients
    absoluteMax: '8h', // Maximum session length
  },
  
  // Milliseconds for calculations
  tokenExpiryMs: {
    access: process.env.NODE_ENV === 'production' ? 15 * 60 * 1000 : 60 * 60 * 1000,
    refresh: 7 * 24 * 60 * 60 * 1000,
    sessionTimeout: 15 * 60 * 1000, // 15 min inactivity timeout
    warningBeforeTimeout: 2 * 60 * 1000, // Warn 2 min before timeout
  },
  
  // Security settings (HIPAA requirements)
  security: {
    maxLoginAttempts: 3, // Reduced for security
    lockoutDuration: 30 * 60 * 1000, // 30 minutes lockout
    passwordMinLength: 12, // Increased for HIPAA
    requireStrongPassword: true,
    requireMFA: process.env.NODE_ENV === 'production',
    requirePasswordChange: 90 * 24 * 60 * 60 * 1000, // 90 days
    passwordHistory: 5, // Remember last 5 passwords
    
    // Session security
    concurrentSessions: 1, // Only one session per user
    logoutOnWindowClose: true,
    clearClipboardOnLogout: true,
    
    // Token versioning for revocation (increment to invalidate all tokens)
    minimumTokenVersion: parseInt(process.env.TOKEN_VERSION || '1', 10),
  },
  
  // Cookie settings (HIPAA compliant)
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV !== "test", // Always secure except in tests
    sameSite: 'strict' as const,
    path: '/',
    maxAge: undefined, // Session cookie (expires on browser close)
  },
  
  // Audit requirements
  audit: {
    logAllAccess: true,
    logFailedAttempts: true,
    retainLogs: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years for HIPAA
  },
  
  // Token payload claims
  claims: {
    includeRoles: true,
    includeClinicId: true,
    includePermissions: false, // Keep token small
    includeUserMetadata: false,
  }
};

// Helper function to validate environment variables
export function validateAuthEnvironment() {
  // In development, be more lenient
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  
  const required = [
    'JWT_SECRET',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
  ];
  
  const missing = required.filter((key: any) => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Please check your .env file.'
    );
  }
}
