/**
 * Account Setup API
 *
 * GET  /api/auth/setup-account?token=xxx — Validate token and return user/clinic info
 * POST /api/auth/setup-account           — Set password and complete setup
 *
 * Generic version of the affiliate onboarding API, usable by any user role
 * (admin, staff, provider, sales_rep, support, pharmacy_rep, affiliate).
 *
 * Uses PasswordResetToken with `used=false` and `expiresAt > now`.
 * First-time setup is identified by `user.lastPasswordChange == null`.
 *
 * @security Public (pre-auth, token-gated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { validatePasswordStrength } from '@/lib/auth/password-reset';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrator',
  PROVIDER: 'Provider',
  STAFF: 'Staff Member',
  SUPPORT: 'Support Agent',
  SALES_REP: 'Sales Representative',
  PHARMACY_REP: 'Pharmacy Representative',
  AFFILIATE: 'Affiliate Partner',
  INFLUENCER: 'Influencer',
};

// ============================================================================
// GET — Validate setup token
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ valid: false, error: 'Token is required' }, { status: 400 });
    }

    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            lastPasswordChange: true,
            clinicId: true,
            clinic: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                primaryColor: true,
                subdomain: true,
                customDomain: true,
              },
            },
          },
        },
      },
    });

    if (!resetToken) {
      return NextResponse.json({
        valid: false,
        error:
          'This link has expired or is invalid. Please contact your administrator for a new invitation.',
      });
    }

    if (resetToken.user.lastPasswordChange !== null) {
      return NextResponse.json({
        valid: false,
        error: 'This account has already been set up. Please log in normally.',
        redirectTo: '/login',
      });
    }

    return NextResponse.json({
      valid: true,
      user: {
        firstName: resetToken.user.firstName,
        lastName: resetToken.user.lastName,
        email: resetToken.user.email,
        role: resetToken.user.role,
        roleLabel: ROLE_LABELS[resetToken.user.role] || resetToken.user.role,
      },
      clinic: {
        name: resetToken.user.clinic?.name || 'Your Organization',
        logoUrl: resetToken.user.clinic?.logoUrl || null,
        primaryColor: resetToken.user.clinic?.primaryColor || '#111827',
      },
    });
  } catch (error) {
    logger.error('[SetupAccount] GET error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to validate setup link' }, { status: 500 });
  }
}

// ============================================================================
// POST — Complete account setup (set password)
// ============================================================================

const setupSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
});

const setupRateLimiter = createRateLimiter({
  identifier: 'account-setup',
  windowSeconds: 15 * 60,
  maxRequests: 10,
  blockDurationSeconds: 30 * 60,
  message: 'Too many attempts. Please try again later.',
});

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = setupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password, confirmPassword } = parsed.data;

    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', requirements: validation.errors },
        { status: 400 }
      );
    }

    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            firstName: true,
            lastPasswordChange: true,
            clinicId: true,
            clinic: {
              select: { name: true, subdomain: true, customDomain: true },
            },
          },
        },
      },
    });

    if (!resetToken) {
      return NextResponse.json(
        {
          error:
            'This link has expired or is invalid. Please contact your administrator for a new invitation.',
        },
        { status: 400 }
      );
    }

    if (resetToken.user.lastPasswordChange !== null) {
      return NextResponse.json(
        { error: 'Account already set up. Please log in.' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;

    await prisma.$transaction(
      async (tx) => {
        await tx.user.update({
          where: { id: resetToken.userId },
          data: {
            passwordHash,
            lastPasswordChange: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true, usedAt: new Date() },
        });

        await tx.auditLog.create({
          data: {
            userId: resetToken.userId,
            action: 'ACCOUNT_SETUP_COMPLETED',
            resource: 'User',
            resourceId: resetToken.userId,
            details: {
              role: resetToken.user.role,
              clinicId: resetToken.user.clinicId,
              ipAddress,
            },
            ipAddress,
            clinicId: resetToken.user.clinicId,
          },
        });
      },
      { isolationLevel: 'Serializable', timeout: 15000 }
    );

    logger.info('[SetupAccount] Completed', {
      userId: resetToken.userId,
      role: resetToken.user.role,
      clinicId: resetToken.user.clinicId,
    });

    const domain = resetToken.user.clinic?.subdomain
      ? `${resetToken.user.clinic.subdomain}.eonpro.io`
      : 'app.eonpro.io';

    const role = resetToken.user.role?.toUpperCase();
    let loginPath = '/login';
    if (role === 'AFFILIATE') loginPath = '/affiliate/login';
    else if (role === 'INFLUENCER') loginPath = '/influencer/login';

    return NextResponse.json({
      success: true,
      loginUrl: `https://${domain}${loginPath}`,
      message: 'Your password has been set. You can now log in.',
    });
  } catch (error) {
    logger.error('[SetupAccount] POST error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'Failed to complete account setup' }, { status: 500 });
  }
}

export const POST = setupRateLimiter(handlePost);
