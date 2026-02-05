/**
 * Enterprise Rate Limiter
 * 
 * Production-grade rate limiting for enterprise healthcare platform.
 * Features:
 * - Composite rate limiting (IP + email + combined)
 * - Progressive security escalation
 * - Trusted network support
 * - Admin override capabilities
 * - Full audit trail
 * 
 * @module security/enterprise-rate-limiter
 * @version 1.0.0
 */

import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';
import { logger } from '@/lib/logger';

// ============================================================================
// Types
// ============================================================================

export interface RateLimitConfig {
  /** Rate limit for IP-based tracking (requests per hour) */
  ipLimitPerHour: number;
  /** Rate limit for email-based tracking (requests per hour) */
  emailLimitPerHour: number;
  /** Maximum combined attempts before escalation */
  maxAttempts: number;
  /** Enable progressive security (CAPTCHA, delays, etc.) */
  enableProgressiveSecurity: boolean;
  /** Block duration in seconds after exceeding limits */
  blockDurationSeconds: number;
  /** Trusted IP ranges (CIDR notation or exact IPs) */
  trustedIpRanges?: string[];
  /** Multiplier for trusted network limits */
  trustedNetworkMultiplier?: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current attempt count */
  attempts: number;
  /** Remaining attempts before next escalation */
  remainingAttempts: number;
  /** Whether CAPTCHA is required */
  requiresCaptcha: boolean;
  /** Delay in seconds before next attempt allowed */
  delaySeconds: number;
  /** Whether email verification is required */
  requiresEmailVerification: boolean;
  /** Whether account is soft-locked */
  isLocked: boolean;
  /** Available unlock methods */
  unlockMethods: ('email_otp' | 'admin_unlock')[];
  /** Time until rate limit resets (seconds) */
  resetInSeconds: number;
  /** Human-readable message */
  message: string;
  /** Security level (1-6) */
  securityLevel: number;
  /** IP-based attempt count */
  ipAttempts: number;
  /** Email-based attempt count */
  emailAttempts: number;
}

export interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lastAttempt: number;
  blocked: boolean;
  blockedUntil?: number;
  securityLevel: number;
  captchaRequired: boolean;
  emailVerificationRequired: boolean;
}

export interface RateLimitStatus {
  ip: string;
  email?: string;
  ipEntry: RateLimitEntry | null;
  emailEntry: RateLimitEntry | null;
  comboEntry: RateLimitEntry | null;
  isTrustedNetwork: boolean;
  effectiveLimits: {
    ipLimit: number;
    emailLimit: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_CONFIG: RateLimitConfig = {
  ipLimitPerHour: 50,
  emailLimitPerHour: 10,
  maxAttempts: 20,
  enableProgressiveSecurity: true,
  blockDurationSeconds: 30 * 60, // 30 minutes
  trustedIpRanges: [],
  trustedNetworkMultiplier: 3,
};

// Progressive security thresholds
const SECURITY_THRESHOLDS = {
  WARNING_START: 3,        // Show remaining attempts
  CAPTCHA_START: 5,        // Require CAPTCHA
  DELAY_START: 10,         // Add progressive delays
  EMAIL_VERIFY_START: 15,  // Require email verification
  SOFT_LOCK_START: 20,     // Soft lock account
};

// Progressive delay schedule (seconds)
const DELAY_SCHEDULE = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 60, 120, 180, 300, 300, 300, 300, 300, 300];

// ============================================================================
// Redis Client (Lazy Initialization)
// ============================================================================

let redisClient: any = null;
let redisAvailable = false;
let redisChecked = false;

async function getRedisClient(): Promise<any> {
  if (redisChecked) {
    return redisAvailable ? redisClient : null;
  }

  redisChecked = true;

  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;
  
  if (!redisUrl) {
    logger.info('[EnterpriseRateLimit] Redis not configured, using in-memory fallback');
    return null;
  }

  try {
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
      const { Redis } = await import('@upstash/redis');
      redisClient = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      });
      redisAvailable = true;
      logger.info('[EnterpriseRateLimit] Connected to Upstash Redis');
      return redisClient;
    }

    const { createClient } = await import('redis');
    redisClient = createClient({ url: redisUrl });
    await redisClient.connect();
    redisAvailable = true;
    logger.info('[EnterpriseRateLimit] Connected to Redis');
    return redisClient;
  } catch (error) {
    logger.warn('[EnterpriseRateLimit] Redis connection failed, using in-memory fallback', { error });
    redisAvailable = false;
    return null;
  }
}

// ============================================================================
// In-Memory Fallback
// ============================================================================

const memoryCache = new LRUCache<string, RateLimitEntry>({
  max: 50000,
  ttl: 60 * 60 * 1000, // 1 hour TTL
});

// ============================================================================
// Trusted Network Detection
// ============================================================================

function isIpInRange(ip: string, cidr: string): boolean {
  // Simple exact match for now
  if (!cidr.includes('/')) {
    return ip === cidr;
  }
  
  // CIDR notation parsing
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits)) - 1);
  
  const ipParts = ip.split('.').map(Number);
  const rangeParts = range.split('.').map(Number);
  
  if (ipParts.length !== 4 || rangeParts.length !== 4) {
    return false;
  }
  
  const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
  const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];
  
  return (ipNum & mask) === (rangeNum & mask);
}

function isTrustedNetwork(ip: string, trustedRanges: string[]): boolean {
  if (!trustedRanges || trustedRanges.length === 0) {
    return false;
  }
  
  return trustedRanges.some(range => isIpInRange(ip, range));
}

// ============================================================================
// Rate Limit Entry Management
// ============================================================================

async function getEntry(key: string): Promise<RateLimitEntry | null> {
  const redis = await getRedisClient();
  
  if (redis && redisAvailable) {
    try {
      const data = await redis.get(key);
      if (data) {
        return typeof data === 'string' ? JSON.parse(data) : data;
      }
      return null;
    } catch (err) {
      logger.warn('[EnterpriseRateLimit] Redis read failed', { key, error: err });
    }
  }
  
  return memoryCache.get(key) || null;
}

async function setEntry(key: string, entry: RateLimitEntry, ttlSeconds: number): Promise<void> {
  const redis = await getRedisClient();
  
  if (redis && redisAvailable) {
    try {
      const isUpstash = !!process.env.UPSTASH_REDIS_REST_URL;
      if (isUpstash) {
        await redis.setex(key, ttlSeconds, JSON.stringify(entry));
      } else {
        await redis.setEx(key, ttlSeconds, JSON.stringify(entry));
      }
      return;
    } catch (err) {
      logger.warn('[EnterpriseRateLimit] Redis write failed', { key, error: err });
    }
  }
  
  memoryCache.set(key, entry);
}

async function deleteEntry(key: string): Promise<void> {
  const redis = await getRedisClient();
  
  if (redis && redisAvailable) {
    try {
      await redis.del(key);
    } catch (err) {
      logger.warn('[EnterpriseRateLimit] Redis delete failed', { key, error: err });
    }
  }
  
  memoryCache.delete(key);
}

// ============================================================================
// Security Level Calculation
// ============================================================================

function calculateSecurityLevel(attempts: number): number {
  if (attempts >= SECURITY_THRESHOLDS.SOFT_LOCK_START) return 6;
  if (attempts >= SECURITY_THRESHOLDS.EMAIL_VERIFY_START) return 5;
  if (attempts >= SECURITY_THRESHOLDS.DELAY_START) return 4;
  if (attempts >= SECURITY_THRESHOLDS.CAPTCHA_START) return 3;
  if (attempts >= SECURITY_THRESHOLDS.WARNING_START) return 2;
  return 1;
}

function getDelayForAttempt(attempts: number): number {
  if (attempts < DELAY_SCHEDULE.length) {
    return DELAY_SCHEDULE[attempts];
  }
  return DELAY_SCHEDULE[DELAY_SCHEDULE.length - 1];
}

// ============================================================================
// Core Rate Limiting Logic
// ============================================================================

export class EnterpriseRateLimiter {
  private config: RateLimitConfig;
  private namespace: string;

  constructor(config: Partial<RateLimitConfig> = {}, namespace = 'auth') {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.namespace = namespace;
    
    // Load trusted IPs from environment
    if (process.env.TRUSTED_IP_RANGES) {
      this.config.trustedIpRanges = process.env.TRUSTED_IP_RANGES.split(',').map(s => s.trim());
    }
  }

  /**
   * Extract client IP from request
   */
  getClientIp(req: NextRequest): string {
    return (
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-real-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      'unknown'
    );
  }

  /**
   * Generate cache keys
   */
  private getKeys(ip: string, email?: string): { ipKey: string; emailKey?: string; comboKey?: string } {
    const ipKey = `${this.namespace}:ip:${ip}`;
    const emailKey = email ? `${this.namespace}:email:${email.toLowerCase()}` : undefined;
    const comboKey = email ? `${this.namespace}:combo:${ip}:${email.toLowerCase()}` : undefined;
    return { ipKey, emailKey, comboKey };
  }

  /**
   * Check rate limit and record attempt
   */
  async checkAndRecord(
    ip: string,
    email?: string,
    success = false
  ): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    const hourAgo = now - 3600;
    
    const { ipKey, emailKey, comboKey } = this.getKeys(ip, email);
    const trusted = isTrustedNetwork(ip, this.config.trustedIpRanges || []);
    
    // Apply multiplier for trusted networks
    const multiplier = trusted ? (this.config.trustedNetworkMultiplier || 3) : 1;
    const effectiveIpLimit = this.config.ipLimitPerHour * multiplier;
    const effectiveEmailLimit = this.config.emailLimitPerHour * multiplier;
    
    // Get current entries
    let ipEntry = await getEntry(ipKey);
    let emailEntry = emailKey ? await getEntry(emailKey) : null;
    let comboEntry = comboKey ? await getEntry(comboKey) : null;
    
    // Reset expired entries
    if (ipEntry && ipEntry.firstAttempt < hourAgo) {
      ipEntry = null;
    }
    if (emailEntry && emailEntry.firstAttempt < hourAgo) {
      emailEntry = null;
    }
    if (comboEntry && comboEntry.firstAttempt < hourAgo) {
      comboEntry = null;
    }
    
    // Initialize entries if needed
    const defaultEntry: RateLimitEntry = {
      attempts: 0,
      firstAttempt: now,
      lastAttempt: now,
      blocked: false,
      securityLevel: 1,
      captchaRequired: false,
      emailVerificationRequired: false,
    };
    
    ipEntry = ipEntry || { ...defaultEntry };
    
    // Check for blocks
    if (ipEntry.blocked && ipEntry.blockedUntil && ipEntry.blockedUntil > now) {
      return this.createBlockedResponse(ipEntry, now, trusted);
    }
    
    if (emailEntry?.blocked && emailEntry.blockedUntil && emailEntry.blockedUntil > now) {
      return this.createBlockedResponse(emailEntry, now, trusted);
    }
    
    if (comboEntry?.blocked && comboEntry.blockedUntil && comboEntry.blockedUntil > now) {
      return this.createBlockedResponse(comboEntry, now, trusted);
    }
    
    // On successful login, reset the rate limit for this email
    if (success && email) {
      await this.clearRateLimit(ip, email);
      return {
        allowed: true,
        attempts: 0,
        remainingAttempts: this.config.maxAttempts,
        requiresCaptcha: false,
        delaySeconds: 0,
        requiresEmailVerification: false,
        isLocked: false,
        unlockMethods: [],
        resetInSeconds: 3600,
        message: 'Login successful',
        securityLevel: 1,
        ipAttempts: 0,
        emailAttempts: 0,
      };
    }
    
    // Increment attempts
    ipEntry.attempts++;
    ipEntry.lastAttempt = now;
    
    if (emailEntry) {
      emailEntry.attempts++;
      emailEntry.lastAttempt = now;
    } else if (emailKey) {
      emailEntry = { ...defaultEntry, attempts: 1 };
    }
    
    if (comboEntry) {
      comboEntry.attempts++;
      comboEntry.lastAttempt = now;
    } else if (comboKey) {
      comboEntry = { ...defaultEntry, attempts: 1 };
    }
    
    // Calculate effective attempts (max of IP and email)
    const effectiveAttempts = Math.max(
      ipEntry.attempts,
      emailEntry?.attempts || 0,
      comboEntry?.attempts || 0
    );
    
    // Calculate security level
    const securityLevel = this.config.enableProgressiveSecurity 
      ? calculateSecurityLevel(effectiveAttempts)
      : 1;
    
    // Check limits
    const ipExceeded = ipEntry.attempts > effectiveIpLimit;
    const emailExceeded = emailEntry && emailEntry.attempts > effectiveEmailLimit;
    const maxExceeded = effectiveAttempts >= this.config.maxAttempts;
    
    // Determine response
    let allowed = true;
    let message = 'Request allowed';
    const requiresCaptcha = securityLevel >= 3;
    const requiresEmailVerification = securityLevel >= 5;
    const isLocked = securityLevel >= 6 || maxExceeded;
    const delaySeconds = this.config.enableProgressiveSecurity 
      ? getDelayForAttempt(effectiveAttempts)
      : 0;
    
    // Build unlock methods
    const unlockMethods: ('email_otp' | 'admin_unlock')[] = [];
    if (isLocked || securityLevel >= 4) {
      unlockMethods.push('email_otp');
      unlockMethods.push('admin_unlock');
    }
    
    // Block if limits exceeded
    if (ipExceeded || emailExceeded || maxExceeded) {
      allowed = false;
      
      // Apply block
      const blockUntil = now + this.config.blockDurationSeconds;
      
      if (ipExceeded) {
        ipEntry.blocked = true;
        ipEntry.blockedUntil = blockUntil;
        message = `Too many requests from this IP. Please try again in ${Math.ceil(this.config.blockDurationSeconds / 60)} minutes.`;
      }
      
      if (emailExceeded && emailEntry) {
        emailEntry.blocked = true;
        emailEntry.blockedUntil = blockUntil;
        message = `Too many attempts for this email. Please try again in ${Math.ceil(this.config.blockDurationSeconds / 60)} minutes.`;
      }
      
      if (maxExceeded) {
        if (comboEntry) {
          comboEntry.blocked = true;
          comboEntry.blockedUntil = blockUntil;
        }
        message = 'Account temporarily locked due to multiple failed attempts. Use email verification to unlock or contact support.';
      }
    } else if (delaySeconds > 0) {
      message = `Please wait ${delaySeconds} seconds before trying again.`;
    } else if (requiresEmailVerification) {
      message = 'Email verification required due to multiple failed attempts.';
    } else if (requiresCaptcha) {
      message = 'Please complete the security check to continue.';
    } else if (securityLevel >= 2) {
      const remaining = SECURITY_THRESHOLDS.CAPTCHA_START - effectiveAttempts;
      message = `${remaining} attempts remaining before additional security is required.`;
    }
    
    // Update security flags
    ipEntry.securityLevel = securityLevel;
    ipEntry.captchaRequired = requiresCaptcha;
    ipEntry.emailVerificationRequired = requiresEmailVerification;
    
    if (emailEntry) {
      emailEntry.securityLevel = securityLevel;
      emailEntry.captchaRequired = requiresCaptcha;
      emailEntry.emailVerificationRequired = requiresEmailVerification;
    }
    
    if (comboEntry) {
      comboEntry.securityLevel = securityLevel;
      comboEntry.captchaRequired = requiresCaptcha;
      comboEntry.emailVerificationRequired = requiresEmailVerification;
    }
    
    // Save entries
    const ttl = 3600; // 1 hour
    await setEntry(ipKey, ipEntry, ttl);
    if (emailKey && emailEntry) {
      await setEntry(emailKey, emailEntry, ttl);
    }
    if (comboKey && comboEntry) {
      await setEntry(comboKey, comboEntry, ttl);
    }
    
    // Log rate limit event
    if (!allowed || securityLevel >= 3) {
      logger.warn('[EnterpriseRateLimit] Security event', {
        ip,
        email: email ? `${email.substring(0, 3)}***` : undefined,
        securityLevel,
        attempts: effectiveAttempts,
        allowed,
        requiresCaptcha,
        requiresEmailVerification,
        isLocked,
        trusted,
      });
    }
    
    return {
      allowed,
      attempts: effectiveAttempts,
      remainingAttempts: Math.max(0, this.config.maxAttempts - effectiveAttempts),
      requiresCaptcha,
      delaySeconds,
      requiresEmailVerification,
      isLocked,
      unlockMethods,
      resetInSeconds: 3600 - (now - ipEntry.firstAttempt),
      message,
      securityLevel,
      ipAttempts: ipEntry.attempts,
      emailAttempts: emailEntry?.attempts || 0,
    };
  }

  /**
   * Create response for blocked request
   */
  private createBlockedResponse(entry: RateLimitEntry, now: number, trusted: boolean): RateLimitResult {
    const remainingBlock = entry.blockedUntil ? entry.blockedUntil - now : 0;
    
    return {
      allowed: false,
      attempts: entry.attempts,
      remainingAttempts: 0,
      requiresCaptcha: true,
      delaySeconds: remainingBlock,
      requiresEmailVerification: true,
      isLocked: true,
      unlockMethods: ['email_otp', 'admin_unlock'],
      resetInSeconds: remainingBlock,
      message: `Account temporarily locked. Please try again in ${Math.ceil(remainingBlock / 60)} minutes or use email verification to unlock.`,
      securityLevel: 6,
      ipAttempts: entry.attempts,
      emailAttempts: entry.attempts,
    };
  }

  /**
   * Get current rate limit status (for admin visibility)
   */
  async getStatus(ip: string, email?: string): Promise<RateLimitStatus> {
    const { ipKey, emailKey, comboKey } = this.getKeys(ip, email);
    const trusted = isTrustedNetwork(ip, this.config.trustedIpRanges || []);
    const multiplier = trusted ? (this.config.trustedNetworkMultiplier || 3) : 1;
    
    const [ipEntry, emailEntry, comboEntry] = await Promise.all([
      getEntry(ipKey),
      emailKey ? getEntry(emailKey) : null,
      comboKey ? getEntry(comboKey) : null,
    ]);
    
    return {
      ip,
      email,
      ipEntry,
      emailEntry,
      comboEntry,
      isTrustedNetwork: trusted,
      effectiveLimits: {
        ipLimit: this.config.ipLimitPerHour * multiplier,
        emailLimit: this.config.emailLimitPerHour * multiplier,
      },
    };
  }

  /**
   * Clear rate limit (admin override or successful unlock)
   */
  async clearRateLimit(ip: string, email?: string, adminUserId?: number): Promise<void> {
    const { ipKey, emailKey, comboKey } = this.getKeys(ip, email);
    
    await deleteEntry(ipKey);
    if (emailKey) await deleteEntry(emailKey);
    if (comboKey) await deleteEntry(comboKey);
    
    logger.info('[EnterpriseRateLimit] Rate limit cleared', {
      ip,
      email: email ? `${email.substring(0, 3)}***` : undefined,
      clearedBy: adminUserId ? `admin:${adminUserId}` : 'system',
    });
  }

  /**
   * Check if rate limited (without recording attempt)
   */
  async isRateLimited(ip: string, email?: string): Promise<boolean> {
    const { ipKey, emailKey, comboKey } = this.getKeys(ip, email);
    const now = Math.floor(Date.now() / 1000);
    
    const [ipEntry, emailEntry, comboEntry] = await Promise.all([
      getEntry(ipKey),
      emailKey ? getEntry(emailKey) : null,
      comboKey ? getEntry(comboKey) : null,
    ]);
    
    if (ipEntry?.blocked && ipEntry.blockedUntil && ipEntry.blockedUntil > now) {
      return true;
    }
    if (emailEntry?.blocked && emailEntry.blockedUntil && emailEntry.blockedUntil > now) {
      return true;
    }
    if (comboEntry?.blocked && comboEntry.blockedUntil && comboEntry.blockedUntil > now) {
      return true;
    }
    
    return false;
  }

  /**
   * Create middleware wrapper
   */
  middleware() {
    return (handler: (req: NextRequest) => Promise<Response>) => {
      return async (req: NextRequest): Promise<Response> => {
        const ip = this.getClientIp(req);
        
        // Try to extract email from request body for login requests
        let email: string | undefined;
        try {
          const clonedReq = req.clone();
          const body = await clonedReq.json();
          email = body.email;
        } catch {
          // Body not available or not JSON
        }
        
        const result = await this.checkAndRecord(ip, email);
        
        if (!result.allowed) {
          return NextResponse.json(
            {
              error: result.message,
              code: 'RATE_LIMIT_EXCEEDED',
              securityLevel: result.securityLevel,
              requiresCaptcha: result.requiresCaptcha,
              requiresEmailVerification: result.requiresEmailVerification,
              isLocked: result.isLocked,
              unlockMethods: result.unlockMethods,
              retryAfter: result.resetInSeconds,
            },
            {
              status: 429,
              headers: {
                'X-RateLimit-Remaining': result.remainingAttempts.toString(),
                'X-RateLimit-Reset': new Date((Math.floor(Date.now() / 1000) + result.resetInSeconds) * 1000).toISOString(),
                'Retry-After': result.resetInSeconds.toString(),
                'X-Security-Level': result.securityLevel.toString(),
              },
            }
          );
        }
        
        // Process request
        const response = await handler(req);
        
        // Add rate limit headers
        const headers = new Headers(response.headers);
        headers.set('X-RateLimit-Remaining', result.remainingAttempts.toString());
        headers.set('X-Security-Level', result.securityLevel.toString());
        
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      };
    };
  }
}

// ============================================================================
// Pre-configured Instances
// ============================================================================

/**
 * Authentication rate limiter (login, password reset, etc.)
 */
export const authRateLimiter = new EnterpriseRateLimiter({
  ipLimitPerHour: 50,
  emailLimitPerHour: 15,
  maxAttempts: 20,
  enableProgressiveSecurity: true,
  blockDurationSeconds: 30 * 60, // 30 minutes
}, 'auth');

/**
 * Registration rate limiter
 */
export const registrationRateLimiter = new EnterpriseRateLimiter({
  ipLimitPerHour: 10,
  emailLimitPerHour: 5,
  maxAttempts: 5,
  enableProgressiveSecurity: true,
  blockDurationSeconds: 60 * 60, // 1 hour
}, 'registration');

/**
 * Password reset rate limiter
 */
export const passwordResetRateLimiter = new EnterpriseRateLimiter({
  ipLimitPerHour: 10,
  emailLimitPerHour: 3,
  maxAttempts: 5,
  enableProgressiveSecurity: true,
  blockDurationSeconds: 60 * 60, // 1 hour
}, 'password-reset');

/**
 * OTP verification rate limiter
 */
export const otpRateLimiter = new EnterpriseRateLimiter({
  ipLimitPerHour: 30,
  emailLimitPerHour: 10,
  maxAttempts: 10,
  enableProgressiveSecurity: true,
  blockDurationSeconds: 15 * 60, // 15 minutes
}, 'otp');

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Clear all rate limits for an IP and/or email (admin function)
 */
export async function adminClearRateLimit(
  ip?: string,
  email?: string,
  adminUserId?: number
): Promise<{ success: boolean; message: string }> {
  if (!ip && !email) {
    return { success: false, message: 'IP or email required' };
  }
  
  try {
    await authRateLimiter.clearRateLimit(ip || 'unknown', email, adminUserId);
    return { 
      success: true, 
      message: `Rate limit cleared for ${ip ? `IP: ${ip}` : ''} ${email ? `Email: ${email}` : ''}`.trim() 
    };
  } catch (error) {
    logger.error('[EnterpriseRateLimit] Admin clear failed', { ip, email, error });
    return { success: false, message: 'Failed to clear rate limit' };
  }
}

/**
 * Get rate limit status (admin function)
 */
export async function adminGetRateLimitStatus(
  ip: string,
  email?: string
): Promise<RateLimitStatus> {
  return authRateLimiter.getStatus(ip, email);
}

/**
 * Verify unlock token and clear rate limit
 */
export async function verifyUnlockAndClear(
  ip: string,
  email: string,
  unlockToken: string
): Promise<{ success: boolean; message: string }> {
  // In production, verify the unlock token from email OTP
  // For now, this is a placeholder that should integrate with your OTP service
  
  try {
    // Verify token (implement your token verification logic)
    // const isValid = await verifyOtpToken(email, unlockToken);
    // if (!isValid) {
    //   return { success: false, message: 'Invalid unlock token' };
    // }
    
    await authRateLimiter.clearRateLimit(ip, email);
    return { success: true, message: 'Account unlocked successfully' };
  } catch (error) {
    logger.error('[EnterpriseRateLimit] Unlock verification failed', { ip, email, error });
    return { success: false, message: 'Failed to unlock account' };
  }
}
