/**
 * Resend Setup Email API
 *
 * POST /api/auth/resend-setup-email
 * Body: { email: string }
 *
 * For users who exist in the system but have never logged in (lastLogin === null).
 * Generates a new PasswordResetToken and sends a "Set Your Password" email
 * using the existing user-welcome notification infrastructure.
 *
 * Security:
 * - Rate limited to prevent abuse
 * - Always returns success to avoid email enumeration
 * - Only sends for non-patient users who have never logged in
 *
 * @security Public (pre-auth, rate-limited)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { standardRateLimit } from '@/lib/rateLimit';
import { sendUserWelcomeNotification } from '@/lib/notifications/user-welcome';

const schema = z.object({
  email: z
    .string()
    .email()
    .transform((v) => v.toLowerCase().trim()),
});

export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: true });
    }

    const { email } = parsed.data;

    const user = await prisma.user.findFirst({
      where: {
        email,
        status: 'ACTIVE',
        lastLogin: null,
        role: { not: 'PATIENT' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        clinicId: true,
        clinic: {
          select: {
            name: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
          },
        },
      },
    });

    if (!user || !user.clinicId || !user.clinic) {
      return NextResponse.json({ success: true });
    }

    const result = await sendUserWelcomeNotification({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      clinicId: user.clinicId,
      clinicName: user.clinic.name,
      clinicSubdomain: user.clinic.subdomain,
      clinicCustomDomain: user.clinic.customDomain,
      clinicLogoUrl: user.clinic.logoUrl,
      sendEmail: true,
      sendSms: false,
    });

    if (result.emailSent) {
      logger.info('[ResendSetupEmail] Setup email resent', {
        userId: user.id,
        role: user.role,
        clinicId: user.clinicId,
      });
    } else {
      logger.error('[ResendSetupEmail] Failed to send setup email', {
        userId: user.id,
        error: result.emailError,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[ResendSetupEmail] Error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: true });
  }
});
