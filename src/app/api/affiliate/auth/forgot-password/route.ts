/**
 * Affiliate Forgot Password API
 *
 * POST /api/affiliate/auth/forgot-password
 *
 * Initiates password reset flow for affiliate users.
 * Generates a secure, hashed token stored in PasswordResetToken table,
 * then sends a branded reset email via AWS SES.
 *
 * Security:
 * - Rate limited (3 requests per 15 min per IP)
 * - Hashed token stored (SHA-256) — raw token only in email link
 * - 1-hour token expiry
 * - Always returns success (prevents email enumeration)
 * - Audit logged
 *
 * @security Public (pre-auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';

// ============================================================================
// Config
// ============================================================================

const RESET_TOKEN_LENGTH = 32; // 256-bit token
const RESET_TOKEN_EXPIRY_HOURS = 1;

// ============================================================================
// Validation
// ============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email format').max(255),
});

// ============================================================================
// Rate Limiter
// ============================================================================

const forgotPasswordRateLimiter = createRateLimiter({
  identifier: 'affiliate-forgot-password',
  windowSeconds: 15 * 60, // 15 minutes
  maxRequests: 3,
  blockDurationSeconds: 15 * 60,
  message: 'Too many password reset requests. Please try again in 15 minutes.',
});

// ============================================================================
// Helpers
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Resolve the base URL for the affiliate portal.
 * Uses the request's origin (preserves subdomain/custom domain).
 */
function getBaseUrl(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;

  const host = request.headers.get('host');
  const protocol = request.headers.get('x-forwarded-proto') || 'https';
  if (host) return `${protocol}://${host}`;

  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.eonpro.io';
}

/**
 * Send clinic-branded password reset email to affiliate.
 */
async function sendAffiliateResetEmail(params: {
  email: string;
  firstName: string;
  resetUrl: string;
  clinicName?: string;
  clinicLogoUrl?: string | null;
  clinicId?: number;
}): Promise<void> {
  const { email, firstName, resetUrl, clinicName, clinicLogoUrl, clinicId } = params;

  const brandName = clinicName || 'EONPro';
  const logoHtml = clinicLogoUrl
    ? `<img src="${clinicLogoUrl}" alt="${brandName}" style="height: 40px; max-width: 200px; object-fit: contain;" />`
    : `<h2 style="color: #1f2937; margin: 0;">${brandName}</h2>`;

  await sendEmail({
    to: email,
    subject: `Set Your Password — ${brandName} Partner Portal`,
    html: `
      <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
        <div style="text-align: center; padding: 32px 0 24px;">
          ${logoHtml}
        </div>
        <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
          <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px;">
            Hello ${firstName},
          </h1>
          <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 24px;">
            We received a request to set or reset your Partner Portal password. Click the button below to create your new password.
          </p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="
              display: inline-block;
              background: #111827;
              color: #ffffff;
              padding: 14px 32px;
              border-radius: 12px;
              text-decoration: none;
              font-weight: 600;
              font-size: 15px;
            ">
              Set My Password
            </a>
          </div>
          <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 24px 0 0;">
            This link expires in ${RESET_TOKEN_EXPIRY_HOURS} hour and can only be used once.
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
        <div style="text-align: center; padding: 24px 0;">
          <p style="font-size: 12px; color: #9ca3af; margin: 0;">
            Powered by <strong>EONPro</strong> • Partner Portal
          </p>
        </div>
      </div>
    `,
    clinicId,
    sourceType: 'notification',
    sourceId: 'affiliate-password-reset',
  });
}

// ============================================================================
// Handler
// ============================================================================

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;

    // Always return success (prevents email enumeration)
    const successResponse = NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a reset link has been sent.',
    });

    // Find affiliate by email — must be ACTIVE with a linked User
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: { email: normalizedEmail },
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            status: true,
            lockedUntil: true,
            lastPasswordChange: true,
          },
        },
        clinic: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!affiliate || !affiliate.user) {
      logger.security('[Affiliate Auth] Password reset for non-existent email', {
        emailPrefix: normalizedEmail.substring(0, 3) + '***',
        ipAddress,
      });
      return successResponse;
    }

    const user = affiliate.user;

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      logger.security('[Affiliate Auth] Password reset for locked account', {
        userId: user.id,
        affiliateId: affiliate.id,
        ipAddress,
      });
      return successResponse;
    }

    // Check if account is inactive
    if (user.status !== 'ACTIVE') {
      logger.security('[Affiliate Auth] Password reset for inactive account', {
        userId: user.id,
        affiliateId: affiliate.id,
        status: user.status,
        ipAddress,
      });
      return successResponse;
    }

    // Invalidate any existing unused tokens for this user (prevent token flooding)
    await prisma.passwordResetToken.updateMany({
      where: {
        userId: user.id,
        used: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // Generate secure reset token
    const rawToken = crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex');
    const hashedToken = hashToken(rawToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

    // Store hashed token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
        ipAddress,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'AFFILIATE_PASSWORD_RESET_REQUESTED',
        resource: 'User',
        resourceId: user.id,
        details: {
          affiliateId: affiliate.id,
          clinicId: affiliate.clinicId,
          ipAddress,
          timestamp: new Date().toISOString(),
        },
        ipAddress,
        clinicId: affiliate.clinicId,
      },
    });

    // Build URL using the request's origin (preserves subdomain)
    // First-time users go to /affiliate/welcome (full onboarding)
    // Returning users go to /affiliate/reset-password (password-only)
    const baseUrl = getBaseUrl(request);
    const isFirstTime = user.lastPasswordChange === null;
    const resetPath = isFirstTime ? '/affiliate/welcome' : '/affiliate/reset-password';
    const resetUrl = `${baseUrl}${resetPath}?token=${rawToken}`;

    // Send branded email
    await sendAffiliateResetEmail({
      email: user.email,
      firstName: user.firstName,
      resetUrl,
      clinicName: affiliate.clinic?.name,
      clinicLogoUrl: affiliate.clinic?.logoUrl,
      clinicId: affiliate.clinicId,
    });

    logger.info('[Affiliate Auth] Password reset email sent', {
      affiliateId: affiliate.id,
      userId: user.id,
      clinicId: affiliate.clinicId,
    });

    return successResponse;
  } catch (error) {
    logger.error('[Affiliate Auth] Forgot password error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
}

// Apply rate limiting: 3 attempts per 15 min
export const POST = forgotPasswordRateLimiter(handler);
