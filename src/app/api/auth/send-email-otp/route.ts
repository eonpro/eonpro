/**
 * SEND EMAIL OTP API
 * ==================
 * Sends a 6-digit OTP code via email for passwordless login
 *
 * POST /api/auth/send-email-otp
 * Body: { email: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import {
  generateOTP,
  storeVerificationCode,
  sendVerificationEmail,
  resolveClinicEmailBranding,
} from '@/lib/auth/verification';
import { isEmailConfigured } from '@/lib/email';

const sendEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address').transform((v) => v.toLowerCase().trim()),
  clinicId: z.number().optional(),
});

const OTP_EXPIRY_MINUTES = 15;

function maskEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const validated = sendEmailOtpSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const { email, clinicId } = validated.data;

    // Verify email service is configured (not mock mode)
    if (!isEmailConfigured()) {
      logger.error('Email service not configured - cannot send login OTP');
      return NextResponse.json(
        { error: 'Email service is temporarily unavailable. Please use password login or try again later.' },
        { status: 503 }
      );
    }

    // Look up account by email (User table first, then Patient fallback)
    let accountExists = false;

    const user = await prisma.user.findFirst({
      where: { email },
      select: { id: true, status: true },
    });

    if (user) {
      if (user.status !== 'ACTIVE') {
        // Don't reveal account status — return generic success
        logger.warn('Email OTP requested for inactive user', { userId: user.id });
        return NextResponse.json({
          success: true,
          message: 'If this email is registered, you will receive a login code.',
          expiresIn: OTP_EXPIRY_MINUTES * 60,
        });
      }
      accountExists = true;
    }

    if (!accountExists) {
      const patient = await prisma.patient.findFirst({
        where: { email },
        select: { id: true },
      });
      if (patient) {
        accountExists = true;
      }
    }

    if (!accountExists) {
      // Don't reveal if account exists (prevent email enumeration)
      logger.warn('Email OTP requested for unregistered email', {
        email: maskEmail(email),
      });
      return NextResponse.json({
        success: true,
        message: 'If this email is registered, you will receive a login code.',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      });
    }

    // Generate and store OTP
    const code = generateOTP();
    const stored = await storeVerificationCode(email, code, 'login_otp');

    if (!stored) {
      logger.error('Failed to store login OTP');
      return NextResponse.json(
        { error: 'Login code service is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    const clinic = await resolveClinicEmailBranding(clinicId);
    const sent = await sendVerificationEmail(email, code, 'login_otp', clinic);

    if (!sent) {
      logger.error('Failed to send login OTP email');
      return NextResponse.json(
        { error: 'Email delivery is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    logger.info('Login OTP email sent', { hasAccount: accountExists });

    return NextResponse.json({
      success: true,
      message: 'If this email is registered, you will receive a login code.',
      expiresIn: OTP_EXPIRY_MINUTES * 60,
      ...(process.env.NODE_ENV === 'development' && { code }),
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/auth/send-email-otp' });
  }
});
