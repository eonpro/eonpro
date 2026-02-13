/**
 * Password Reset and Recovery System
 * HIPAA-compliant password reset with secure tokens
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';

// Configuration
const RESET_TOKEN_LENGTH = 32;
const RESET_TOKEN_EXPIRY_HOURS = 1; // 1 hour expiry
const MIN_PASSWORD_LENGTH = 12;
const PASSWORD_REQUIREMENTS = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
};

interface PasswordResetResult {
  success: boolean;
  message?: string;
  error?: string;
}

interface PasswordValidation {
  isValid: boolean;
  errors: string[];
}

/**
 * Initiate password reset process
 */
export async function initiatePasswordReset(
  email: string,
  ipAddress?: string
): Promise<PasswordResetResult> {
  try {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        firstName: true,
        status: true,
        lockedUntil: true,
      },
    });

    // Always return success even if user not found (security best practice)
    if (!user) {
      logger.security('Password reset attempted for non-existent email', { email, ipAddress });
      return {
        success: true,
        message: 'If an account exists, a reset link has been sent',
      };
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      logger.security('Password reset attempted for locked account', { userId: user.id, email });
      return {
        success: true,
        message: 'If an account exists, a reset link has been sent',
      };
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(RESET_TOKEN_LENGTH).toString('hex');
    const hashedToken = hashToken(resetToken);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + RESET_TOKEN_EXPIRY_HOURS);

    // Store reset token
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
        ipAddress,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED',
        details: {
          email,
          ipAddress,
          timestamp: new Date().toISOString(),
        },
        ipAddress,
      },
    });

    // Send reset email
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`;
    await sendPasswordResetEmail(user.email, user.firstName, resetUrl);

    logger.security('Password reset initiated', { userId: user.id, email });

    return {
      success: true,
      message: 'Reset link sent to email address',
    };
  } catch (error) {
    logger.error('Password reset initiation failed', error as Error);
    return {
      success: false,
      error: 'Failed to initiate password reset',
    };
  }
}

/**
 * Verify reset token
 */
export async function verifyResetToken(token: string): Promise<boolean> {
  try {
    const hashedToken = hashToken(token);

    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    return !!resetToken;
  } catch (error) {
    logger.error('Reset token verification failed', error as Error);
    return false;
  }
}

/**
 * Reset password with token
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string,
  confirmPassword: string,
  ipAddress?: string
): Promise<PasswordResetResult> {
  try {
    // Validate passwords match
    if (newPassword !== confirmPassword) {
      return {
        success: false,
        error: 'Passwords do not match',
      };
    }

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join('. '),
      };
    }

    // Find and validate token
    const hashedToken = hashToken(token);
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        token: hashedToken,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!resetToken) {
      logger.security('Invalid or expired reset token used', { ipAddress });
      return {
        success: false,
        error: 'Invalid or expired reset token',
      };
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user password and reset login attempts
    await prisma.user.update({
      where: { id: resetToken.userId },
      data: {
        passwordHash,
        lastPasswordChange: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });

    // Mark token as used
    await prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        used: true,
        usedAt: new Date(),
      },
    });

    // Invalidate all existing sessions for security
    await prisma.userSession.deleteMany({
      where: { userId: resetToken.userId },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId: resetToken.userId,
        action: 'PASSWORD_RESET_COMPLETED',
        details: {
          ipAddress,
          timestamp: new Date().toISOString(),
        },
        ipAddress,
      },
    });

    // Send confirmation email
    await sendPasswordResetConfirmation(resetToken.user.email, resetToken.user.firstName);

    logger.security('Password reset completed', {
      userId: resetToken.userId,
      email: resetToken.user.email,
    });

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  } catch (error) {
    logger.error('Password reset failed', error as Error);
    return {
      success: false,
      error: 'Failed to reset password',
    };
  }
}

/**
 * Change password for authenticated user
 */
export async function changePassword(
  userId: number,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string
): Promise<PasswordResetResult> {
  try {
    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        email: true,
        firstName: true,
      },
    });

    if (!user) {
      return {
        success: false,
        error: 'User not found',
      };
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      await logFailedPasswordChange(userId, ipAddress);
      return {
        success: false,
        error: 'Current password is incorrect',
      };
    }

    // Validate new password
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join('. '),
      };
    }

    // Check password history (prevent reuse)
    const isSamePassword = await bcrypt.compare(newPassword, user.passwordHash);
    if (isSamePassword) {
      return {
        success: false,
        error: 'New password cannot be the same as current password',
      };
    }

    // Hash and update password
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        lastPasswordChange: new Date(),
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'PASSWORD_CHANGED',
        details: {
          ipAddress,
          timestamp: new Date().toISOString(),
        },
        ipAddress,
      },
    });

    // Send notification email
    await sendPasswordChangeNotification(user.email, user.firstName);

    logger.security('Password changed successfully', { userId, email: user.email });

    return {
      success: true,
      message: 'Password changed successfully',
    };
  } catch (error) {
    logger.error('Password change failed', error as Error);
    return {
      success: false,
      error: 'Failed to change password',
    };
  }
}

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): PasswordValidation {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(`Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`);
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (PASSWORD_REQUIREMENTS.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (PASSWORD_REQUIREMENTS.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak passwords
  const weakPasswords = ['password', '12345678', 'qwerty', 'admin', 'letmein'];
  if (weakPasswords.some((weak) => password.toLowerCase().includes(weak))) {
    errors.push('Password is too common or weak');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Helper functions

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendPasswordResetEmail(
  email: string,
  firstName: string,
  resetUrl: string
): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Password Reset Request - EONPRO',
    html: `
      <h2>Hello ${firstName},</h2>
      <p>You requested to reset your password. Click the link below to create a new password:</p>
      <p><a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a></p>
      <p>This link will expire in ${RESET_TOKEN_EXPIRY_HOURS} hour(s).</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr>
      <p><small>For security, this link can only be used once.</small></p>
    `,
  });
}

async function sendPasswordResetConfirmation(email: string, firstName: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Password Reset Successful - EONPRO',
    html: `
      <h2>Hello ${firstName},</h2>
      <p>Your password has been successfully reset.</p>
      <p>If you didn't make this change, please contact support immediately.</p>
      <p>For security reasons, all your previous sessions have been logged out.</p>
    `,
  });
}

async function sendPasswordChangeNotification(email: string, firstName: string): Promise<void> {
  await sendEmail({
    to: email,
    subject: 'Password Changed - EONPRO',
    html: `
      <h2>Hello ${firstName},</h2>
      <p>Your password has been successfully changed.</p>
      <p>If you didn't make this change, please reset your password immediately and contact support.</p>
    `,
  });
}

async function logFailedPasswordChange(userId: number, ipAddress?: string): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'PASSWORD_CHANGE_FAILED',
      details: {
        reason: 'Invalid current password',
        ipAddress,
        timestamp: new Date().toISOString(),
      },
      ipAddress,
    },
  });
}
