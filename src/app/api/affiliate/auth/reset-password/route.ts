/**
 * Affiliate Reset Password API
 *
 * POST /api/affiliate/auth/reset-password
 *
 * Verifies the reset token and sets a new password for the affiliate.
 *
 * Security:
 * - Rate limited (5 attempts per 15 min per IP)
 * - Token is SHA-256 hashed before lookup (raw token never stored)
 * - Token marked as used after successful reset
 * - All existing sessions invalidated
 * - Enterprise password strength validation (12+ chars, uppercase, lowercase, numbers, special)
 * - Audit logged
 *
 * Also supports GET for token verification (pre-flight check).
 *
 * @security Public (pre-auth, token-gated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { validatePasswordStrength } from '@/lib/auth/password-reset';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';

// ============================================================================
// Validation
// ============================================================================

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
});

const verifyTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// ============================================================================
// Rate Limiter
// ============================================================================

const resetPasswordRateLimiter = createRateLimiter({
  identifier: 'affiliate-reset-password',
  windowSeconds: 15 * 60,
  maxRequests: 5,
  blockDurationSeconds: 30 * 60,
  message: 'Too many password reset attempts. Please try again later.',
});

// ============================================================================
// Helpers
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ============================================================================
// GET — Verify token is valid (pre-flight check from reset page)
// ============================================================================

async function handleGet(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { valid: false, error: 'Token is required' },
        { status: 400 }
      );
    }

    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
          },
        },
      },
    });

    if (!resetToken) {
      return NextResponse.json({
        valid: false,
        error: 'Invalid or expired reset link. Please request a new one.',
      });
    }

    // Verify this user is actually an affiliate
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        userId: resetToken.userId,
        status: 'ACTIVE',
      },
      select: { id: true, displayName: true },
    });

    if (!affiliate) {
      return NextResponse.json({
        valid: false,
        error: 'This reset link is not valid for a partner account.',
      });
    }

    return NextResponse.json({
      valid: true,
      // Only return first name for UX greeting (non-sensitive)
      firstName: resetToken.user.firstName,
      // Mask email for display (sav***@gmail.com)
      email: maskEmail(resetToken.user.email),
    });
  } catch (error) {
    logger.error('[Affiliate Auth] Token verification error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json(
      { valid: false, error: 'Failed to verify token' },
      { status: 500 }
    );
  }
}

// ============================================================================
// POST — Reset password with token
// ============================================================================

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password, confirmPassword } = parsed.data;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;

    // Validate passwords match
    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Passwords do not match' },
        { status: 400 }
      );
    }

    // Validate password strength (enterprise requirements)
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      return NextResponse.json(
        {
          error: 'Password does not meet requirements',
          requirements: validation.errors,
        },
        { status: 400 }
      );
    }

    // Find and validate token
    const hashedToken = hashToken(token);
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            passwordHash: true,
          },
        },
      },
    });

    if (!resetToken) {
      logger.security('[Affiliate Auth] Invalid/expired reset token used', {
        ipAddress,
      });
      return NextResponse.json(
        { error: 'Invalid or expired reset link. Please request a new one.' },
        { status: 400 }
      );
    }

    // Verify this user is an affiliate
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        userId: resetToken.userId,
        status: 'ACTIVE',
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!affiliate) {
      logger.security('[Affiliate Auth] Reset token used by non-affiliate user', {
        userId: resetToken.userId,
        ipAddress,
      });
      return NextResponse.json(
        { error: 'This reset link is not valid for a partner account.' },
        { status: 403 }
      );
    }

    // Check new password is not same as current
    const isSamePassword = await bcrypt.compare(password, resetToken.user.passwordHash);
    if (isSamePassword) {
      return NextResponse.json(
        { error: 'New password must be different from your current password.' },
        { status: 400 }
      );
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Execute in transaction: update password, mark token used, invalidate sessions
    await prisma.$transaction(
      async (tx) => {
        // Update user password
        await tx.user.update({
          where: { id: resetToken.userId },
          data: {
            passwordHash,
            lastPasswordChange: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        // Mark token as used
        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: {
            used: true,
            usedAt: new Date(),
          },
        });

        // Invalidate all existing sessions for security
        await tx.userSession.deleteMany({
          where: { userId: resetToken.userId },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: resetToken.userId,
            action: 'AFFILIATE_PASSWORD_RESET_COMPLETED',
            resource: 'User',
            resourceId: resetToken.userId,
            details: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              isFirstTimeSetup: !resetToken.user.passwordHash || resetToken.user.passwordHash === '',
              ipAddress,
              timestamp: new Date().toISOString(),
            },
            ipAddress,
            clinicId: affiliate.clinicId,
          },
        });
      },
      { isolationLevel: 'Serializable', timeout: 15000 }
    );

    // Send confirmation email (non-blocking, after transaction)
    sendEmail({
      to: resetToken.user.email,
      subject: `Password Updated — ${affiliate.clinic?.name || 'EONPro'} Partner Portal`,
      html: `
        <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
          <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
            <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px;">
              Password Updated
            </h1>
            <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px;">
              Hello ${resetToken.user.firstName}, your Partner Portal password has been successfully updated.
            </p>
            <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 0;">
              If you didn't make this change, please contact support immediately.
              For security, all previous sessions have been signed out.
            </p>
          </div>
          <div style="text-align: center; padding: 24px 0;">
            <p style="font-size: 12px; color: #9ca3af; margin: 0;">
              Powered by <strong>EONPro</strong> • Partner Portal
            </p>
          </div>
        </div>
      `,
      clinicId: affiliate.clinicId,
      sourceType: 'notification',
      sourceId: 'affiliate-password-reset-confirmation',
    }).catch((err) => {
      logger.warn('[Affiliate Auth] Failed to send reset confirmation email', {
        error: err instanceof Error ? err.message : 'Unknown error',
        userId: resetToken.userId,
      });
    });

    logger.info('[Affiliate Auth] Password reset completed', {
      affiliateId: affiliate.id,
      userId: resetToken.userId,
      clinicId: affiliate.clinicId,
    });

    return NextResponse.json({
      success: true,
      message: 'Password has been set successfully. You can now log in.',
    });
  } catch (error) {
    logger.error('[Affiliate Auth] Reset password error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
}

// ============================================================================
// Helpers
// ============================================================================

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const visible = local.substring(0, Math.min(3, local.length));
  return `${visible}***@${domain}`;
}

// ============================================================================
// Exports
// ============================================================================

export const GET = handleGet;
export const POST = resetPasswordRateLimiter(handlePost);
