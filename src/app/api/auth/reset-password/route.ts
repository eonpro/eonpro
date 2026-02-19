/**
 * Password reset endpoint
 * Handles sending reset codes and updating passwords
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { basePrisma as prisma } from '@/lib/db';
import {
  generateOTP,
  storeVerificationCode,
  verifyOTPCode,
  sendVerificationEmail,
  sendVerificationSMS,
  resolveClinicEmailBranding,
} from '@/lib/auth/verification';
import { isEmailConfigured } from '@/lib/email';

/**
 * POST /api/auth/reset-password
 * Send password reset code to email
 */
export const POST = strictRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { email, role = 'provider', clinicId, method = 'email' } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const viaSMS = method === 'sms';

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
      case 'admin':
        userExists = email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
        break;
      default:
        return NextResponse.json({ error: 'Invalid role specified' }, { status: 400 });
    }

    if (userExists) {
      const code = generateOTP();
      await storeVerificationCode(email.toLowerCase(), code, 'password_reset');

      if (viaSMS && patientPhone) {
        const clinicBranding = await resolveClinicEmailBranding(
          typeof clinicId === 'number' ? clinicId : undefined
        );
        await sendVerificationSMS(
          patientPhone,
          code,
          'password_reset',
          clinicBranding?.clinicName
        );
      } else {
        const clinic = await resolveClinicEmailBranding(
          typeof clinicId === 'number' ? clinicId : undefined
        );
        await sendVerificationEmail(email.toLowerCase(), code, 'password_reset', clinic);
      }

      logger.info(`Password reset requested for ${email} (${role}) via ${method}`);
    } else {
      logger.warn(`Password reset requested for non-existent user: ${email} (${role})`);
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
          code: await prisma.patientAudit
            .findFirst({
              where: {
                patientId: 0,
                action: 'PASSWORD_RESET',
                actorEmail: email.toLowerCase(),
              },
              orderBy: { createdAt: 'desc' },
            })
            .then((r) => (r && typeof r.diff === 'string' ? JSON.parse(r.diff).code : undefined)),
        }),
      }),
    });
  } catch (error: unknown) {
    logger.error(
      'Error sending password reset:',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'Failed to process password reset request' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/auth/reset-password
 * Reset password with OTP code
 */
export const PUT = strictRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { email, code, newPassword, role = 'provider' } = body;

    // Validate input
    if (!email || !code || !newPassword) {
      return NextResponse.json(
        { error: 'Email, code, and new password are required' },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

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
      case 'patient':
        const userToUpdate = await prisma.user.findUnique({
          where: { email: email.toLowerCase() },
        });
        if (userToUpdate) {
          const updatedUser = await prisma.user
            .update({
              where: { id: userToUpdate.id },
              data: { passwordHash },
            })
            .catch((err) => {
              logger.warn('[ResetPassword] Failed to update patient password', { error: err instanceof Error ? err.message : String(err) });
              return null;
            });
          updated = !!updatedUser;

          // Create audit log for patient
          if (updated) {
            await prisma.patientAudit
              .create({
                data: {
                  patientId: userToUpdate.patientId || 0,
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

      case 'provider':
        const providerToUpdate = await prisma.provider.findFirst({
          where: { email: email.toLowerCase() },
        });
        if (providerToUpdate) {
          const provider: any = await prisma.provider
            .update({
              where: { id: providerToUpdate.id },
              data: { passwordHash },
            })
            .catch((err) => {
              logger.warn('[ResetPassword] Failed to update provider password', { error: err instanceof Error ? err.message : String(err) });
              return null;
            });
          updated = !!provider;
        }
        break;

      case 'admin':
        // Admin password is in environment variables, cannot be reset this way
        if (email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase()) {
          logger.warn('Attempt to reset admin password via API');
          return NextResponse.json(
            { error: 'Admin password cannot be reset via this method' },
            { status: 403 }
          );
        }
        break;
    }

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 });
    }

    // Log password reset
    logger.info(`Password reset successfully for ${email} (${role})`);

    // Create audit log
    if (role === 'provider') {
      const providerUser = await prisma.provider.findFirst({
        where: { email: email.toLowerCase() },
      });
      if (providerUser) {
        await prisma.providerAudit.create({
          data: {
            providerId: providerUser.id,
            action: 'PASSWORD_RESET',
            actorEmail: providerUser.email || email.toLowerCase(),
            diff: JSON.stringify({ timestamp: new Date().toISOString() }),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: unknown) {
    logger.error(
      'Error resetting password:',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
});
