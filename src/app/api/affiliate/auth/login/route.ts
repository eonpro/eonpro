/**
 * Affiliate Login (Email + Password)
 *
 * Authenticates affiliates using email and password.
 * Creates a session and returns a JWT token.
 *
 * First-time detection:
 * - If User.lastPasswordChange is null, the user was created with a temp password
 *   (via application approval or admin creation) and has never set their own password.
 * - Returns { needsPasswordSetup: true } so the client can redirect to the setup flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { JWT_SECRET } from '@/lib/auth/config';

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Email-only check schema — used when client wants to pre-check
 * whether the account needs password setup before prompting for password.
 */
const emailCheckSchema = z.object({
  email: z.string().email('Invalid email format'),
  checkOnly: z.literal(true),
});

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days in seconds

import { authRateLimiter } from '@/lib/security/rate-limiter-redis';

async function handler(request: NextRequest) {
  try {
    const body = await request.json();

    // ──────────────────────────────────────────────────────────────────────
    // Pre-flight email check: does this affiliate need password setup?
    // Called from the login page before showing the password field.
    // ──────────────────────────────────────────────────────────────────────
    const emailCheck = emailCheckSchema.safeParse(body);
    if (emailCheck.success) {
      const normalizedEmail = emailCheck.data.email.trim().toLowerCase();

      const affiliate = await prisma.affiliate.findFirst({
        where: {
          user: { email: normalizedEmail },
          status: 'ACTIVE',
        },
        include: {
          user: {
            select: {
              id: true,
              lastPasswordChange: true,
            },
          },
        },
      });

      // Always return same shape to prevent enumeration
      if (!affiliate || !affiliate.user) {
        return NextResponse.json({ needsPasswordSetup: false });
      }

      // If lastPasswordChange is null, user has never set their own password
      const needsSetup = affiliate.user.lastPasswordChange === null;

      if (needsSetup) {
        logger.info('[Affiliate Auth] First-time user detected', {
          affiliateId: affiliate.id,
          userId: affiliate.user.id,
        });
      }

      return NextResponse.json({ needsPasswordSetup: needsSetup });
    }

    // ──────────────────────────────────────────────────────────────────────
    // Standard login flow
    // ──────────────────────────────────────────────────────────────────────
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Find affiliate in Affiliate table (linked to User)
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
            lastPasswordChange: true,
          },
        },
      },
    });

    if (affiliate && affiliate.user) {
      // Verify password
      const isValidPassword = await bcrypt.compare(password, affiliate.user.passwordHash);

      if (!isValidPassword) {
        logger.warn('[Affiliate Auth] Invalid password', {
          affiliateId: affiliate.id,
        });

        return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
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

      logger.info('[Affiliate Auth] Login successful', {
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

    // No matching account found
    logger.info('[Affiliate Auth] Email not found', {
      email: normalizedEmail.substring(0, 3) + '***',
    });

    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  } catch (error) {
    logger.error('[Affiliate Auth] Login error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: error instanceof Error ? error.stack : undefined }),
    });

    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

// Apply rate limiting: 5 attempts per 15 min, 30 min block on exceed
export const POST = authRateLimiter(handler);
