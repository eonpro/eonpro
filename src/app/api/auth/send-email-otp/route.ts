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
import {
  generateOTP,
  storeVerificationCode,
  sendVerificationEmail,
} from '@/lib/auth/verification';
import { isEmailConfigured } from '@/lib/email';

const sendEmailOtpSchema = z.object({
  email: z.string().email('Invalid email address').transform((v) => v.toLowerCase().trim()),
});

const OTP_EXPIRY_MINUTES = 15;

export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const validated = sendEmailOtpSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid email address', details: validated.error.issues },
        { status: 400 }
      );
    }

    const { email } = validated.data;

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
      logger.warn('Email OTP requested for unregistered email');
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
        { error: 'Failed to generate login code. Please try again.' },
        { status: 500 }
      );
    }

    // Send email
    const sent = await sendVerificationEmail(email, code, 'login_otp');

    if (!sent) {
      logger.error('Failed to send login OTP email');
      return NextResponse.json(
        { error: 'Failed to send login code. Please try again.' },
        { status: 500 }
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
    logger.error(
      'Error in send-email-otp endpoint',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
});
