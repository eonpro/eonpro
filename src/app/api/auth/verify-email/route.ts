/**
 * Email verification endpoint
 * Handles sending and verifying email verification codes
 */

import { NextRequest, NextResponse } from 'next/server';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import {
  generateOTP,
  storeVerificationCode,
  verifyOTPCode,
  sendVerificationEmail,
} from '@/lib/auth/verification';

/**
 * POST /api/auth/verify-email
 * Send verification code to email
 */
export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { email, action } = body;

    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Generate OTP code
    const code = generateOTP();

    // Store verification code
    const stored = await storeVerificationCode(
      email.toLowerCase(),
      code,
      'email_verification'
    );

    if (!stored) {
      return NextResponse.json(
        { error: 'Failed to generate verification code' },
        { status: 500 }
      );
    }

    // Send email
    const sent = await sendVerificationEmail(
      email.toLowerCase(),
      code,
      'email_verification'
    );

    if (!sent) {
      return NextResponse.json(
        { error: 'Failed to send verification email' },
        { status: 500 }
      );
    }

    logger.info(`Verification email sent to ${email}`);

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your email',
      // In development only, include the code for testing
      ...(process.env.NODE_ENV === 'development' && { code }),
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error sending verification email:', error);
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/auth/verify-email
 * Verify email with OTP code
 */
export const PUT = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { email, code } = body;

    // Validate input
    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      );
    }

    // Verify the code
    const result = await verifyOTPCode(
      email.toLowerCase(),
      code,
      'email_verification'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    logger.info(`Email verified for ${email}`);

    return NextResponse.json({
      success: true,
      message: result.message,
      email: result.email,
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error verifying email:', error);
    return NextResponse.json(
      { error: 'Failed to verify email' },
      { status: 500 }
    );
  }
});
