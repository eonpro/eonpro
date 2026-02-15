/**
 * Affiliate Onboarding API
 *
 * GET  /api/affiliate/auth/onboarding?token=xxx — Load onboarding data
 * POST /api/affiliate/auth/onboarding          — Complete onboarding (profile + password)
 *
 * Used by the /affiliate/welcome page for first-time affiliate setup.
 * Token-gated (uses PasswordResetToken).
 *
 * GET returns:
 *  - Affiliate name, email, phone
 *  - Clinic name + branding
 *  - Compensation plan details
 *  - Ref codes
 *  - Address from metadata
 *
 * POST accepts:
 *  - token, password, confirmPassword
 *  - Optional profile updates: displayName, firstName, lastName, phone, address
 *  - Sets password, updates profile, marks onboarding complete
 *  - Returns JWT for auto-login
 *
 * @security Public (pre-auth, token-gated)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma, Prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import { JWT_SECRET } from '@/lib/auth/config';
import { validatePasswordStrength } from '@/lib/auth/password-reset';
import { sendEmail } from '@/lib/email';
import { createRateLimiter } from '@/lib/security/rate-limiter-redis';

// ============================================================================
// Helpers
// ============================================================================

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Format commission plan for human-readable display.
 */
function formatCommissionPlan(plan: {
  name: string;
  description: string | null;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  recurringEnabled: boolean;
  recurringMonths: number | null;
  appliesTo: string;
}) {
  const details: { label: string; value: string; highlight?: boolean }[] = [];

  // Initial / first-payment commission
  if (plan.initialPercentBps) {
    details.push({
      label: 'Per converted referral',
      value: `${(plan.initialPercentBps / 100).toFixed(plan.initialPercentBps % 100 === 0 ? 0 : 1)}%`,
      highlight: true,
    });
  } else if (plan.initialFlatAmountCents) {
    details.push({
      label: 'Per converted referral',
      value: `$${(plan.initialFlatAmountCents / 100).toFixed(2)}`,
      highlight: true,
    });
  } else if (plan.percentBps) {
    details.push({
      label: 'Commission rate',
      value: `${(plan.percentBps / 100).toFixed(plan.percentBps % 100 === 0 ? 0 : 1)}%`,
      highlight: true,
    });
  } else if (plan.flatAmountCents) {
    details.push({
      label: 'Commission per referral',
      value: `$${(plan.flatAmountCents / 100).toFixed(2)}`,
      highlight: true,
    });
  }

  // Recurring commission
  if (plan.recurringEnabled) {
    if (plan.recurringPercentBps) {
      const recurringLabel = plan.recurringMonths
        ? `Recurring (${plan.recurringMonths} months)`
        : 'Recurring (lifetime)';
      details.push({
        label: recurringLabel,
        value: `${(plan.recurringPercentBps / 100).toFixed(plan.recurringPercentBps % 100 === 0 ? 0 : 1)}%`,
      });
    } else if (plan.recurringFlatAmountCents) {
      const recurringLabel = plan.recurringMonths
        ? `Recurring (${plan.recurringMonths} months)`
        : 'Recurring (lifetime)';
      details.push({
        label: recurringLabel,
        value: `$${(plan.recurringFlatAmountCents / 100).toFixed(2)}`,
      });
    }
  }

  // Applies to
  const appliesToMap: Record<string, string> = {
    FIRST_PAYMENT_ONLY: 'First payment only',
    ALL_PAYMENTS: 'All payments',
    RECURRING_ONLY: 'Recurring payments only',
  };
  if (plan.appliesTo && appliesToMap[plan.appliesTo]) {
    details.push({ label: 'Applies to', value: appliesToMap[plan.appliesTo] });
  }

  return {
    name: plan.name,
    description: plan.description,
    details,
  };
}

// ============================================================================
// GET — Load onboarding data
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const hashedToken = hashToken(token);

    // Find and validate token
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
            phone: true,
            lastPasswordChange: true,
          },
        },
      },
    });

    if (!resetToken) {
      return NextResponse.json({
        valid: false,
        error: 'This link has expired or is invalid. Please request a new one.',
      });
    }

    // Must be a first-time affiliate (lastPasswordChange is null)
    if (resetToken.user.lastPasswordChange !== null) {
      return NextResponse.json({
        valid: false,
        error: 'This account has already been set up. Please log in normally.',
        redirectTo: '/affiliate/login',
      });
    }

    // Find affiliate with full data
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        userId: resetToken.userId,
        status: 'ACTIVE',
      },
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            primaryColor: true,
          },
        },
        refCodes: {
          where: { isActive: true },
          select: { refCode: true },
        },
        planAssignments: {
          where: {
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          take: 1,
          include: {
            commissionPlan: {
              select: {
                name: true,
                description: true,
                planType: true,
                flatAmountCents: true,
                percentBps: true,
                initialPercentBps: true,
                initialFlatAmountCents: true,
                recurringPercentBps: true,
                recurringFlatAmountCents: true,
                recurringEnabled: true,
                recurringMonths: true,
                appliesTo: true,
              },
            },
          },
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json({
        valid: false,
        error: 'No active partner account found.',
      });
    }

    // Extract address from metadata
    const metadata = affiliate.metadata as Record<string, unknown> | null;
    const address = (metadata?.address as Record<string, string>) || {};

    // Format compensation plan
    const currentPlan = affiliate.planAssignments[0]?.commissionPlan;
    const formattedPlan = currentPlan ? formatCommissionPlan(currentPlan) : null;

    return NextResponse.json({
      valid: true,
      affiliate: {
        id: affiliate.id,
        displayName: affiliate.displayName,
        refCodes: affiliate.refCodes.map((rc) => rc.refCode),
      },
      user: {
        firstName: resetToken.user.firstName,
        lastName: resetToken.user.lastName,
        email: resetToken.user.email,
        phone: resetToken.user.phone || '',
      },
      clinic: {
        name: affiliate.clinic.name,
        logoUrl: affiliate.clinic.logoUrl,
        primaryColor: affiliate.clinic.primaryColor,
      },
      compensationPlan: formattedPlan,
      address: {
        line1: address.line1 || '',
        line2: address.line2 || '',
        city: address.city || '',
        state: address.state || '',
        zipCode: address.zipCode || '',
        country: address.country || 'US',
      },
    });
  } catch (error) {
    logger.error('[Affiliate Onboarding] Load error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to load onboarding data' }, { status: 500 });
  }
}

// ============================================================================
// POST — Complete onboarding
// ============================================================================

const completeOnboardingSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1, 'Password is required'),
  confirmPassword: z.string().min(1, 'Password confirmation is required'),
  // Profile updates (all optional)
  displayName: z.string().max(200).optional(),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(20).optional(),
  address: z.object({
    line1: z.string().max(255).optional(),
    line2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    state: z.string().max(100).optional(),
    zipCode: z.string().max(20).optional(),
    country: z.string().max(2).optional(),
  }).optional(),
});

const onboardingRateLimiter = createRateLimiter({
  identifier: 'affiliate-onboarding',
  windowSeconds: 15 * 60,
  maxRequests: 5,
  blockDurationSeconds: 30 * 60,
  message: 'Too many attempts. Please try again later.',
});

const COOKIE_NAME = 'affiliate_session';
const SESSION_DURATION = 30 * 24 * 60 * 60; // 30 days

async function handlePost(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = completeOnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const { token, password, confirmPassword, displayName, firstName, lastName, phone, address } =
      parsed.data;
    const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;

    // Validate passwords match
    if (password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400 });
    }

    // Validate password strength
    const validation = validatePasswordStrength(password);
    if (!validation.isValid) {
      return NextResponse.json(
        { error: 'Password does not meet requirements', requirements: validation.errors },
        { status: 400 }
      );
    }

    // Find and validate token
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
            passwordHash: true,
            lastPasswordChange: true,
          },
        },
      },
    });

    if (!resetToken) {
      return NextResponse.json(
        { error: 'This link has expired or is invalid. Please request a new one.' },
        { status: 400 }
      );
    }

    // Must be first-time
    if (resetToken.user.lastPasswordChange !== null) {
      return NextResponse.json(
        { error: 'Account already set up. Please log in normally.' },
        { status: 400 }
      );
    }

    // Find affiliate
    const affiliate = await prisma.affiliate.findFirst({
      where: { userId: resetToken.userId, status: 'ACTIVE' },
      include: {
        clinic: { select: { id: true, name: true } },
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'No active partner account found.' }, { status: 403 });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Build affiliate metadata update (merge with existing)
    const existingMetadata = (affiliate.metadata as Record<string, unknown>) || {};
    const updatedMetadata = { ...existingMetadata };
    if (address) {
      updatedMetadata.address = {
        ...((existingMetadata.address as Record<string, string>) || {}),
        ...Object.fromEntries(Object.entries(address).filter(([, v]) => v !== undefined && v !== '')),
      };
    }

    // Execute all updates in a transaction
    const result = await prisma.$transaction(
      async (tx) => {
        // Update user: password + optional name/phone
        await tx.user.update({
          where: { id: resetToken.userId },
          data: {
            passwordHash,
            lastPasswordChange: new Date(),
            failedLoginAttempts: 0,
            lockedUntil: null,
            ...(firstName ? { firstName } : {}),
            ...(lastName ? { lastName } : {}),
            ...(phone ? { phone } : {}),
          },
        });

        // Update affiliate: displayName + metadata
        await tx.affiliate.update({
          where: { id: affiliate.id },
          data: {
            ...(displayName ? { displayName } : {}),
            metadata: updatedMetadata as Prisma.InputJsonValue,
            lastLoginAt: new Date(),
          },
        });

        // Mark token as used
        await tx.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true, usedAt: new Date() },
        });

        // Audit log
        await tx.auditLog.create({
          data: {
            userId: resetToken.userId,
            action: 'AFFILIATE_ONBOARDING_COMPLETED',
            resource: 'Affiliate',
            resourceId: affiliate.id,
            details: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              profileUpdated: !!(displayName || firstName || lastName || phone || address),
              ipAddress,
              timestamp: new Date().toISOString(),
            },
            ipAddress,
            clinicId: affiliate.clinicId,
          },
        });

        return true;
      },
      { isolationLevel: 'Serializable', timeout: 15000 }
    );

    if (!result) {
      return NextResponse.json({ error: 'Failed to complete setup' }, { status: 500 });
    }

    // Create JWT for auto-login
    const jwtToken = await new SignJWT({
      id: affiliate.id,
      affiliateId: affiliate.id,
      userId: resetToken.userId,
      clinicId: affiliate.clinicId,
      email: resetToken.user.email,
      name: displayName || affiliate.displayName,
      role: 'affiliate',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(JWT_SECRET);

    logger.info('[Affiliate Onboarding] Completed', {
      affiliateId: affiliate.id,
      userId: resetToken.userId,
      clinicId: affiliate.clinicId,
    });

    // Send welcome confirmation email (non-blocking)
    sendEmail({
      to: resetToken.user.email,
      subject: `You're all set! — ${affiliate.clinic?.name || 'EONPro'} Partner Portal`,
      html: `
        <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
          <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
            <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px;">
              Welcome aboard, ${firstName || resetToken.user.firstName}!
            </h1>
            <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px;">
              Your ${affiliate.clinic?.name || 'EONPro'} Partner Portal account is now set up and ready to go.
              Log in anytime to track your referrals, earnings, and payouts.
            </p>
          </div>
        </div>
      `,
      clinicId: affiliate.clinicId,
      sourceType: 'notification',
      sourceId: `affiliate-onboarding-complete-${affiliate.id}`,
    }).catch(() => {});

    // Return response with JWT + cookie
    const response = NextResponse.json({
      success: true,
      token: jwtToken,
      affiliate: {
        id: affiliate.id,
        displayName: displayName || affiliate.displayName,
        email: resetToken.user.email,
      },
    });

    response.cookies.set(COOKIE_NAME, jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test',
      sameSite: 'lax',
      maxAge: SESSION_DURATION,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error('[Affiliate Onboarding] Complete error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 });
  }
}

export const POST = onboardingRateLimiter(handlePost);
