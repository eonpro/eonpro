/**
 * Account Unlock API
 * 
 * Self-service endpoint for users to unlock their accounts
 * after being rate-limited. Uses email OTP verification.
 * 
 * POST /api/auth/unlock-account/request - Request unlock code
 * POST /api/auth/unlock-account/verify - Verify code and unlock
 * 
 * @module api/auth/unlock-account
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { 
  authRateLimiter, 
  adminGetRateLimitStatus,
} from '@/lib/security/enterprise-rate-limiter';
import { sendEmail } from '@/lib/email';
import { logger } from '@/lib/logger';

// ============================================================================
// Schemas
// ============================================================================

const requestUnlockSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const verifyUnlockSchema = z.object({
  email: z.string().email('Invalid email address'),
  code: z.string().length(6, 'Code must be 6 digits'),
});

// ============================================================================
// OTP Storage (in-memory for simplicity, use Redis in production)
// ============================================================================

const otpStore = new Map<string, { code: string; expires: number; attempts: number }>();

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanExpiredOTPs(): void {
  const now = Date.now();
  for (const [key, value] of otpStore.entries()) {
    if (value.expires < now) {
      otpStore.delete(key);
    }
  }
}

// ============================================================================
// POST - Request Unlock Code
// ============================================================================

export async function POST(req: NextRequest): Promise<NextResponse> {
  const clientIp = authRateLimiter.getClientIp(req);
  
  try {
    const body = await req.json();
    
    // Determine action based on body
    if ('code' in body) {
      return verifyUnlockCode(req, body, clientIp);
    } else {
      return requestUnlockCode(req, body, clientIp);
    }
  } catch (error) {
    logger.error('[UnlockAccount] Error', { error, ip: clientIp });
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}

async function requestUnlockCode(
  req: NextRequest, 
  body: unknown, 
  clientIp: string
): Promise<NextResponse> {
  // Validate input
  const validation = requestUnlockSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid email address' },
      { status: 400 }
    );
  }

  const { email } = validation.data;

  // Check if account is actually rate-limited
  const status = await adminGetRateLimitStatus(clientIp, email);
  const isLocked = 
    status.ipEntry?.blocked || 
    status.emailEntry?.blocked || 
    status.comboEntry?.blocked;

  if (!isLocked) {
    // Don't reveal if account exists or not
    return NextResponse.json({
      success: true,
      message: 'If your account is locked, you will receive an unlock code at your email address.',
    });
  }

  // Verify user exists (without revealing to client)
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, firstName: true },
  });

  if (!user) {
    // Don't reveal that user doesn't exist
    return NextResponse.json({
      success: true,
      message: 'If your account is locked, you will receive an unlock code at your email address.',
    });
  }

  // Rate limit unlock requests (prevent abuse)
  const unlockRequestKey = `unlock:${email.toLowerCase()}`;
  const existingOtp = otpStore.get(unlockRequestKey);
  
  if (existingOtp && existingOtp.expires > Date.now()) {
    const secondsRemaining = Math.ceil((existingOtp.expires - Date.now()) / 1000);
    if (secondsRemaining > 240) { // Only allow resend after 1 minute
      return NextResponse.json(
        { 
          error: 'Please wait before requesting another code',
          retryAfter: secondsRemaining - 240,
        },
        { status: 429 }
      );
    }
  }

  // Generate and store OTP
  const otp = generateOTP();
  otpStore.set(unlockRequestKey, {
    code: otp,
    expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    attempts: 0,
  });

  // Clean expired OTPs periodically
  cleanExpiredOTPs();

  // Send email
  try {
    await sendEmail({
      to: user.email,
      subject: 'Your Account Unlock Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Account Unlock Code</h2>
          <p>Hello ${user.firstName || 'there'},</p>
          <p>Your account has been temporarily locked due to multiple failed login attempts. 
          Use the code below to unlock your account:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; letter-spacing: 8px; font-weight: bold; color: #333;">${otp}</span>
          </div>
          <p>This code expires in 5 minutes.</p>
          <p>If you did not request this, please secure your account by changing your password.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #888; font-size: 12px;">
            This is an automated security message from EONPRO Healthcare Platform.
          </p>
        </div>
      `,
    });

    logger.info('[UnlockAccount] OTP sent', {
      email: email.substring(0, 3) + '***',
      ip: clientIp,
    });
  } catch (emailError) {
    logger.error('[UnlockAccount] Failed to send email', { 
      error: emailError,
      email: email.substring(0, 3) + '***',
    });
    
    return NextResponse.json(
      { error: 'Failed to send unlock code. Please try again or contact support.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    message: 'If your account is locked, you will receive an unlock code at your email address.',
    expiresIn: 300, // 5 minutes
  });
}

async function verifyUnlockCode(
  req: NextRequest,
  body: unknown,
  clientIp: string
): Promise<NextResponse> {
  // Validate input
  const validation = verifyUnlockSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: 'Invalid code format' },
      { status: 400 }
    );
  }

  const { email, code } = validation.data;
  const unlockRequestKey = `unlock:${email.toLowerCase()}`;

  // Get stored OTP
  const storedOtp = otpStore.get(unlockRequestKey);

  if (!storedOtp) {
    return NextResponse.json(
      { error: 'No unlock request found. Please request a new code.' },
      { status: 400 }
    );
  }

  // Check expiration
  if (storedOtp.expires < Date.now()) {
    otpStore.delete(unlockRequestKey);
    return NextResponse.json(
      { error: 'Code has expired. Please request a new code.' },
      { status: 400 }
    );
  }

  // Check attempts (prevent brute force on OTP)
  if (storedOtp.attempts >= 5) {
    otpStore.delete(unlockRequestKey);
    return NextResponse.json(
      { error: 'Too many attempts. Please request a new code.' },
      { status: 429 }
    );
  }

  // Verify code
  if (storedOtp.code !== code) {
    storedOtp.attempts++;
    otpStore.set(unlockRequestKey, storedOtp);
    
    return NextResponse.json(
      { 
        error: 'Invalid code',
        attemptsRemaining: 5 - storedOtp.attempts,
      },
      { status: 400 }
    );
  }

  // Code is valid - clear rate limits
  await authRateLimiter.clearRateLimit(clientIp, email);
  
  // Delete used OTP
  otpStore.delete(unlockRequestKey);

  // Log the unlock
  logger.info('[UnlockAccount] Account unlocked via OTP', {
    email: email.substring(0, 3) + '***',
    ip: clientIp,
  });

  // Create audit log
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (user) {
    await prisma.userAuditLog.create({
      data: {
        userId: user.id,
        action: 'ACCOUNT_UNLOCKED',
        ipAddress: clientIp,
        userAgent: req.headers.get('user-agent'),
        details: {
          method: 'email_otp',
          unlockedAt: new Date().toISOString(),
        },
      },
    }).catch((err) => {
      logger.warn('[UnlockAccount] Failed to create audit log', { error: err });
    });
  }

  return NextResponse.json({
    success: true,
    message: 'Account unlocked successfully. You can now log in.',
  });
}
