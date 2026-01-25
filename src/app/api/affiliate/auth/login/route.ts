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
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '@/lib/auth/config';

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

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

    // Try 1: Find in new Affiliate table (linked to User)
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        user: {
          email: normalizedEmail,
        },
        status: 'ACTIVE',
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

    if (affiliate && affiliate.user) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, affiliate.user.passwordHash);
      
      if (!isValidPassword) {
        logger.warn('[Affiliate Auth] Invalid password (Affiliate table)', {
          affiliateId: affiliate.id,
        });
        
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // Create JWT token
      const token = await new SignJWT({
        id: affiliate.id,
        affiliateId: affiliate.id,
        userId: affiliate.user.id,
        clinicId: affiliate.clinicId,
        email: affiliate.user.email,
        name: affiliate.displayName,
        role: 'affiliate',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);

      // Update last login
      await prisma.affiliate.update({
        where: { id: affiliate.id },
        data: { lastLoginAt: new Date() },
      });

      logger.info('[Affiliate Auth] Login successful (Affiliate table)', {
        affiliateId: affiliate.id,
        userId: affiliate.user.id,
      });

      // Create response with cookie
      const response = NextResponse.json({
        success: true,
        token,
        affiliate: {
          id: affiliate.id,
          displayName: affiliate.displayName,
          email: affiliate.user.email,
        },
      });

      // Set HTTP-only cookie
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test',
        sameSite: 'lax',
        maxAge: SESSION_DURATION,
        path: '/',
      });

      return response;
    }

    // Try 2: Fall back to legacy Influencer table
    const influencer = await prisma.influencer.findUnique({
      where: { email: normalizedEmail },
    });

    if (influencer && influencer.passwordHash) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, influencer.passwordHash);
      
      if (!isValidPassword) {
        logger.warn('[Affiliate Auth] Invalid password (Influencer table)', {
          influencerId: influencer.id,
        });
        
        return NextResponse.json(
          { error: 'Invalid email or password' },
          { status: 401 }
        );
      }

      // Check status
      if (influencer.status !== 'ACTIVE') {
        return NextResponse.json(
          { error: 'Account is not active' },
          { status: 401 }
        );
      }

      // Create JWT token (using influencer ID) - same format as /api/influencers/auth/login
      const token = await new SignJWT({
        id: influencer.id,
        influencerId: influencer.id,
        clinicId: influencer.clinicId,
        email: influencer.email,
        name: influencer.name,
        promoCode: influencer.promoCode,
        role: 'influencer',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);

      // Update last login
      await prisma.influencer.update({
        where: { id: influencer.id },
        data: { lastLogin: new Date() },
      });

      logger.info('[Affiliate Auth] Login successful (Influencer table)', {
        influencerId: influencer.id,
      });

      // Create response with cookie
      const response = NextResponse.json({
        success: true,
        token,
        affiliate: {
          id: influencer.id,
          displayName: influencer.name,
          email: influencer.email,
        },
      });

      // Set HTTP-only cookie (same name as influencer login for compatibility)
      response.cookies.set('influencer-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test',
        sameSite: 'lax',
        maxAge: SESSION_DURATION,
        path: '/',
      });

      // Also set affiliate_session cookie
      response.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test',
        sameSite: 'lax',
        maxAge: SESSION_DURATION,
        path: '/',
      });

      return response;
    }

    // No matching account found
    logger.info('[Affiliate Auth] Email not found', {
      email: normalizedEmail.substring(0, 3) + '***',
    });
    
    return NextResponse.json(
      { error: 'Invalid email or password' },
      { status: 401 }
    );
  } catch (error) {
    logger.error('[Affiliate Auth] Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
