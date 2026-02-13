/**
 * Verify OTP Code for Affiliate Login
 *
 * Validates the 6-digit code and creates a session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'affiliate-portal-secret-key-change-in-production'
);

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(request: NextRequest) {
  try {
    const { phone, code } = await request.json();

    if (!phone || !code) {
      return NextResponse.json({ error: 'Phone and code are required' }, { status: 400 });
    }

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
