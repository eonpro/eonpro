/**
 * Affiliate Login (Email + Password)
 * 
 * Authenticates affiliates using email and password.
 * Creates a session and returns a JWT token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'affiliate-portal-secret-key-change-in-production'
);

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find affiliate by user email
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: {
          email: normalizedEmail,
        },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            passwordHash: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    if (!affiliate || !affiliate.user) {
      logger.info('[Affiliate Auth] Email not found', {
        email: normalizedEmail.substring(0, 3) + '***',
      });
      
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, affiliate.user.passwordHash);
    
    if (!isValidPassword) {
      logger.warn('[Affiliate Auth] Invalid password', {
        affiliateId: affiliate.id,
      });
      
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

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
      token, // Return token for localStorage storage
      affiliate: {
        id: affiliate.id,
        displayName: affiliate.displayName,
        email: affiliate.user.email,
      },
    });
  } catch (error) {
    logger.error('[Affiliate Auth] Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
