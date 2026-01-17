/**
 * Password reset endpoint
 * Handles sending reset codes and updating passwords
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db';
import {
  generateOTP,
  storeVerificationCode,
  verifyOTPCode,
  sendVerificationEmail,
} from '@/lib/auth/verification';

/**
 * POST /api/auth/reset-password
 * Send password reset code to email
 */
export const POST = strictRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const { email, role = 'provider' } = body;

    // Validate input
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Check if user exists based on role
    let userExists = false;
    
    switch (role) {
      case 'provider':
        const provider: any = await // @ts-ignore
    prisma.provider.findFirst({ where: { email: email.toLowerCase() },
        });
        userExists = !!provider;
        break;
        
      case 'influencer':
        const influencer = await prisma.influencer.findUnique({
          where: { email: email.toLowerCase() },
        });
        userExists = !!influencer;
        break;
        
      case 'admin':
        userExists = email.toLowerCase() === process.env.ADMIN_EMAIL?.toLowerCase();
        break;
        
      default: return NextResponse.json(
          { error: 'Invalid role specified' },
          { status: 400 }
        );
    }

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (userExists) {
      // Generate OTP code
      const code = generateOTP();

      // Store verification code
      await storeVerificationCode(
        email.toLowerCase(),
        code,
        'password_reset'
      );

      // Send email
      await sendVerificationEmail(
        email.toLowerCase(),
        code,
        'password_reset'
      );

      logger.info(`Password reset requested for ${email} (${role})`);
    } else {
      logger.warn(`Password reset requested for non-existent user: ${email} (${role})`);
    }

    // Always return success to prevent user enumeration
    return NextResponse.json({
      success: true,
      message: 'If an account exists with this email, a reset code has been sent',
      // In development only, indicate if user exists and include code
      ...(process.env.NODE_ENV === 'development' && {
        userExists,
        ...(userExists && { code: (await prisma.patientAudit.findFirst({
          where: {
            patientId: 0,
            action: 'PASSWORD_RESET',
            actorEmail: email.toLowerCase(),
          },
          orderBy: { createdAt: 'desc' },
        }).then(r => r  ? JSON.parse(r.diff as string).code  : undefined)) }),
      }),
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error sending password reset:', error);
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

    // Validate password strength
    if (newPassword.length < 12) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters long' },
        { status: 400 }
      );
    }

    // Verify the code
    const result = await verifyOTPCode(
      email.toLowerCase(),
      code,
      'password_reset'
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.message },
        { status: 400 }
      );
    }

    // Hash the new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password based on role
    let updated = false;
    
    switch (role) {
      case 'provider':
        const providerToUpdate = await prisma.provider.findFirst({ where: { email: email.toLowerCase() }});
        if (providerToUpdate) {
          const provider: any = await prisma.provider.update({
            where: { id: providerToUpdate.id },
            data: { passwordHash },
          }).catch(() => null);
          updated = !!provider;
        }
        break;
        
      case 'influencer':
        const influencer = await prisma.influencer.update({
          where: { email: email.toLowerCase() },
          data: { passwordHash },
        }).catch(() => null);
        updated = !!influencer;
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
      return NextResponse.json(
        { error: 'Failed to update password' },
        { status: 500 }
      );
    }

    // Log password reset
    logger.info(`Password reset successfully for ${email} (${role})`);
    
    // Create audit log
    if (role === 'provider') {
      const user: any = await // @ts-ignore
    prisma.provider.findFirst({ where: { email: email.toLowerCase() },
      });
      if (user) {
        await prisma.providerAudit.create({
          data: {
            providerId: user.id,
            action: 'PASSWORD_RESET',
            actorEmail: user.email,
            diff: JSON.stringify({ timestamp: new Date().toISOString() }),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error resetting password:', error);
    return NextResponse.json(
      { error: 'Failed to reset password' },
      { status: 500 }
    );
  }
});
