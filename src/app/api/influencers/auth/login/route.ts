import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/db';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    logger.debug('[Influencer Auth] Login attempt for:', { value: email });
    logger.debug('[Influencer Auth] Prisma instance:', { exists: !!prisma });

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // Find influencer by email
    logger.debug('[Influencer Auth] Looking up influencer...');
    if (!prisma) {
      throw new Error('Prisma client is not initialized');
    }

    const influencer = await prisma.influencer.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!influencer) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Check if influencer has a password set
    if (!influencer.passwordHash) {
      return NextResponse.json(
        { error: 'Please contact support to set up your account' },
        { status: 401 }
      );
    }

    // Verify password
    logger.debug('[Influencer Auth] Verifying password...');
    let isPasswordValid = false;
    try {
      isPasswordValid = await bcrypt.compare(password, influencer.passwordHash);
    } catch (err: any) {
      // @ts-ignore

      logger.error('[Influencer Auth] Password comparison error:', err);
      throw err;
    }

    if (!isPasswordValid) {
      logger.debug('[Influencer Auth] Password invalid');
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }
    logger.debug('[Influencer Auth] Password valid');

    // Check if influencer is active
    if (influencer.status !== 'ACTIVE') {
      logger.debug('[Influencer Auth] Status check failed:', {
        actual: influencer.status,
        expected: 'ACTIVE',
      });
      return NextResponse.json(
        { error: `Account is ${influencer.status.toLowerCase()}` },
        { status: 403 }
      );
    }

    // Update last login
    await prisma.influencer.update({
      where: { id: influencer.id },
      data: { lastLogin: new Date() },
    });

    // Create JWT token
    const token = await new SignJWT({
      id: influencer.id,
      email: influencer.email,
      name: influencer.name,
      promoCode: influencer.promoCode,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(JWT_SECRET);

    // Create response with token
    const response = NextResponse.json({
      success: true,
      influencer: {
        id: influencer.id,
        name: influencer.name,
        email: influencer.email,
        promoCode: influencer.promoCode,
        commissionRate: influencer.commissionRate,
      },
    });

    // Set HTTP-only cookie
    response.cookies.set('influencer-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error: any) {
    // @ts-ignore

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[Influencer Auth] Login error:', error);
    logger.error('[Influencer Auth] Error stack:', { value: error.stack });
    return NextResponse.json({ error: errorMessage || 'Failed to login' }, { status: 500 });
  }
}
