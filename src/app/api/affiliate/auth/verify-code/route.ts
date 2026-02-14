/**
 * Verify OTP Code for Affiliate Login
 *
 * Validates the 6-digit code and creates a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import { JWT_SECRET } from '@/lib/auth/config';
import { otpRateLimiter } from '@/lib/security/rate-limiter-redis';

const verifyCodeSchema = z.object({
  phone: z.string().min(1, 'Phone is required'),
  code: z.string().length(6, 'Code must be exactly 6 digits'),
});

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

async function handler(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = verifyCodeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { phone, code } = parsed.data;

    const normalizedPhone = phone.replace(/\D/g, '');

    // Find affiliate by phone
    // Only ACTIVE affiliates can log in (AffiliateStatus enum: ACTIVE, PAUSED, SUSPENDED, INACTIVE)
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: {
          phone: {
            endsWith: normalizedPhone.slice(-10),
          },
        },
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    // Get OTP record
    const otpRecord = await prisma.affiliateOtpCode.findUnique({
      where: { affiliateId: affiliate.id },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { error: 'No code found. Please request a new one.' },
        { status: 401 }
      );
    }

    // Check attempts (max 5)
    if (otpRecord.attempts >= 5) {
      return NextResponse.json(
        { error: 'Too many attempts. Please request a new code.' },
        { status: 429 }
      );
    }

    // Check expiration
    if (otpRecord.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'Code expired. Please request a new one.' },
        { status: 401 }
      );
    }

    // Verify code
    if (otpRecord.code !== code) {
      // Increment attempts
      await prisma.affiliateOtpCode.update({
        where: { affiliateId: affiliate.id },
        data: { attempts: { increment: 1 } },
      });

      return NextResponse.json({ error: 'Invalid code' }, { status: 401 });
    }

    // Code is valid - delete it
    await prisma.affiliateOtpCode.delete({
      where: { affiliateId: affiliate.id },
    });

    // Create JWT token
    const token = await new SignJWT({
      sub: affiliate.user.id.toString(),
      affiliateId: affiliate.id,
      clinicId: affiliate.clinicId,
      role: 'affiliate',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(JWT_SECRET);

    // Set session cookie
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_DURATION / 1000,
      path: '/',
    });

    // Update last login
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: { lastLoginAt: new Date() },
    });

    logger.info('[Affiliate Auth] Login successful', {
      affiliateId: affiliate.id,
      userId: affiliate.user.id,
    });

    return NextResponse.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        displayName: affiliate.displayName,
      },
    });
  } catch (error) {
    logger.error('[Affiliate Auth] Verify code error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Verification failed' }, { status: 500 });
  }
}

// Apply OTP rate limiting: 5 attempts per 5 min
export const POST = otpRateLimiter(handler);
