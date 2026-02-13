/**
 * Password Verification Endpoint
 * Used for confirming sensitive actions like clinic switching
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

const verifyPasswordSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /api/auth/verify-password
 * Verify the current user's password for sensitive operations
 */
async function verifyPasswordHandler(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();

    // Validate input
    const validationResult = verifyPasswordSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const { password } = validationResult.data;

    // Get user with password hash
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    if (!userData?.passwordHash) {
      logger.warn('[Verify Password] User has no password hash', { userId: user.id });
      return NextResponse.json({ error: 'Unable to verify password' }, { status: 400 });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, userData.passwordHash);

    if (!isValid) {
      logger.warn('[Verify Password] Invalid password attempt', { userId: user.id });
      return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    }

    logger.info('[Verify Password] Password verified successfully', { userId: user.id });

    return NextResponse.json({
      success: true,
      verified: true,
    });
  } catch (error: any) {
    logger.error('[Verify Password] Error:', error);
    return NextResponse.json({ error: 'Failed to verify password' }, { status: 500 });
  }
}

// Apply rate limiting and authentication
export const POST = strictRateLimit(withAuth(verifyPasswordHandler));
