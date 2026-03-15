/**
 * Password reset endpoint
 * Handles sending reset codes and updating passwords
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { basePrisma as prisma } from '@/lib/db';
import { handleApiError } from '@/domains/shared/errors';
import {
  generateOTP,
  storeVerificationCode,
  verifyOTPCode,
  sendVerificationEmail,
  sendVerificationSMS,
  isSmsConfigured,
  resolveClinicEmailBranding,
} from '@/lib/auth/verification';
import { isEmailConfigured } from '@/lib/email';

const resetRoleSchema = z.enum([
  'patient',
  'provider',
  'admin',
  'super_admin',
  'affiliate',
  'staff',
  'support',
  'sales_rep',
  'pharmacy_rep',
]);

const requestResetSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: resetRoleSchema.default('provider'),
  clinicId: z.number().optional(),
  method: z.enum(['email', 'sms']).default('email'),
});

const confirmResetSchema = z.object({
  email: z.string().email('Valid email is required'),
  code: z.string().trim().min(4, 'Reset code is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters long'),
  role: resetRoleSchema.default('provider'),
});

function maskEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split('@');
  if (!local || !domain) return '***';
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/**
 * POST /api/auth/reset-password
 * Send password reset code to email
 */
export const POST = strictRateLimit(async (req: NextRequest) => {
  try {
    const parsed = requestResetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reset request' }, { status: 400 });
    }
    const { email, role, clinicId, method } = parsed.data;

    const viaSMS = method === 'sms';
    if (viaSMS && role !== 'patient') {
      return NextResponse.json(
        { error: 'SMS reset is only available for patient accounts' },
        { status: 400 }
      );
    }

    if (viaSMS && !isSmsConfigured()) {
      logger.error('SMS service not configured - cannot send password reset code via text');
      return NextResponse.json(
        { error: 'Text message service is temporarily unavailable. Please try resetting via email instead.' },
        { status: 503 }
      );
    }

    if (!viaSMS && !isEmailConfigured()) {
      logger.error('Email service not configured - cannot send password reset code');
      return NextResponse.json(
        { error: 'Email service is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    let userExists = false;
    let patientPhone: string | null = null;

    switch (role) {
      case 'patient': {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, patientId: true },
        });
        userExists = !!user;
        if (user?.patientId && viaSMS) {
          const patient = await prisma.patient.findUnique({
            where: { id: user.patientId },
            select: { phone: true },
          });
          patientPhone = patient?.phone || null;
        }
        break;
      }
      case 'provider': {
        const provider: any = await prisma.provider.findFirst({
          where: { email: email.toLowerCase() },
        });
        userExists = !!provider;
        break;
      }
      case 'admin': {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, role: true },
        });
        userExists =
          user?.role === 'admin' ||
          email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
        break;
      }
      case 'super_admin':
      case 'affiliate':
      case 'staff':
      case 'support':
      case 'sales_rep':
      case 'pharmacy_rep': {
        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, role: true },
        });
        userExists = user?.role === role;
        break;
      }
      default:
        return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    if (userExists) {
      const code = generateOTP();
      const stored = await storeVerificationCode(email.toLowerCase(), code, 'password_reset');
      if (!stored) {
        logger.error('Failed to store password reset code', { role });
        return NextResponse.json(
          { error: 'Unable to process reset request. Please try again in a few minutes.' },
          { status: 503 }
        );
      }

      if (viaSMS && patientPhone) {
        const clinicBranding = await resolveClinicEmailBranding(
          typeof clinicId === 'number' ? clinicId : undefined
        );
        const smsSent = await sendVerificationSMS(
          patientPhone,
          code,
          'password_reset',
          clinicBranding?.clinicName
        );
        if (!smsSent) {
          logger.error('Failed to send password reset SMS', { role });
          return NextResponse.json(
            { error: 'We could not send the reset code via text. Please try again or use email.' },
            { status: 503 }
          );
        }
      } else {
        const clinic = await resolveClinicEmailBranding(
          typeof clinicId === 'number' ? clinicId : undefined
        );
        const emailSent = await sendVerificationEmail(
          email.toLowerCase(),
          code,
          'password_reset',
          clinic
        );
        if (!emailSent) {
          logger.error('Failed to send password reset email', { role });
          return NextResponse.json(
            {
              error:
                'We could not send the reset code to your email. Please check your address and try again, or contact support if the problem continues.',
            },
            { status: 503 }
          );
        }
      }

      logger.info('Password reset requested', {
        role,
        method,
        email: maskEmail(email),
      });
    } else {
      logger.warn('Password reset requested for non-existent user', {
        role,
        email: maskEmail(email),
      });
    }

    const successMsg = viaSMS
      ? 'If an account with a phone number on file exists, a reset code has been sent via text.'
      : 'If an account exists with this email, a reset code has been sent.';

    return NextResponse.json({
      success: true,
      message: successMsg,
      ...(process.env.NODE_ENV === 'development' && {
        userExists,
        ...(userExists && {
          code: await prisma.emailVerificationCode
            .findFirst({
              where: {
                email: email.toLowerCase(),
                type: 'PASSWORD_RESET',
              },
              orderBy: { createdAt: 'desc' },
            })
            .then((r) => r?.code),
        }),
      }),
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'POST /api/auth/reset-password' });
  }
});

/**
 * PUT /api/auth/reset-password
 * Reset password with OTP code
 */
export const PUT = strictRateLimit(async (req: NextRequest) => {
  try {
    const parsed = confirmResetSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid reset request' }, { status: 400 });
    }
    const { email, code, newPassword, role } = parsed.data;

    // Verify the code
    const result = await verifyOTPCode(email.toLowerCase(), code, 'password_reset');

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password based on role
    let updated = false;

    switch (role) {
      case 'patient': {
        const userToUpdate = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, patientId: true },
        });
        if (userToUpdate) {
          const updatedUser = await prisma.user.update({
            where: { id: userToUpdate.id },
            data: { passwordHash },
          });
          updated = !!updatedUser;

          // Create audit log for patient
          if (updated && userToUpdate.patientId) {
            await prisma.patientAudit
              .create({
                data: {
                  patientId: userToUpdate.patientId,
                  action: 'PASSWORD_RESET',
                  actorEmail: email.toLowerCase(),
                  diff: JSON.stringify({ timestamp: new Date().toISOString() }),
                },
              })
              .catch((err) => {
                logger.warn('[ResetPassword] Failed to create audit log for patient password reset', { error: err instanceof Error ? err.message : String(err) });
                return null;
              });
          }
        }
        break;
      }

      case 'provider': {
        // Prefer unified user record when present
        const unifiedUser = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true },
        });
        if (unifiedUser) {
          await prisma.user.update({
            where: { id: unifiedUser.id },
            data: { passwordHash },
          });
          updated = true;
          break;
        }

        const providerToUpdate = await prisma.provider.findFirst({
          where: { email: email.toLowerCase() },
        });
        if (providerToUpdate) {
          const provider: any = await prisma.provider.update({
            where: { id: providerToUpdate.id },
            data: { passwordHash },
          });
          updated = !!provider;
        }
        break;
      }

      case 'affiliate':
      case 'staff':
      case 'support':
      case 'sales_rep':
      case 'pharmacy_rep':
      case 'super_admin':
      case 'admin': {
        const userToUpdate = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
          select: { id: true, role: true },
        });
        if (userToUpdate && userToUpdate.role === role) {
          await prisma.user.update({
            where: { id: userToUpdate.id },
            data: { passwordHash },
          });
          updated = true;
        }
        break;
      }

      default:
        return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    if (!updated) {
      return NextResponse.json(
        { error: 'Unable to complete password reset for this account' },
        { status: 400 }
      );
    }

    // Log password reset
    logger.info('Password reset successfully', {
      role,
      email: maskEmail(email),
    });

    // Create audit log
    if (role === 'provider') {
      const providerUser = await prisma.provider.findFirst({
        where: { email: email.toLowerCase() },
      });
      if (providerUser) {
        await prisma.providerAudit
          .create({
            data: {
              providerId: providerUser.id,
              action: 'PASSWORD_RESET',
              actorEmail: providerUser.email || email.toLowerCase(),
              diff: JSON.stringify({ timestamp: new Date().toISOString() }),
            },
          })
          .catch((err) => {
            logger.warn('[ResetPassword] Failed to create provider audit log', {
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: unknown) {
    return handleApiError(error, { route: 'PUT /api/auth/reset-password' });
  }
});
