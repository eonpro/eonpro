/**
 * Email verification service
 * Handles OTP generation, storage, and verification for email authentication
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

interface VerificationResult {
  success: boolean;
  message: string;
  email?: string;
}

/**
 * Generate a 6-digit OTP code
 */
export function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate a secure verification token
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Store verification code for an email
 * Uses the PatientAudit table temporarily (in production, use a dedicated table)
 */
export async function storeVerificationCode(
  email: string,
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp'
): Promise<boolean> {
  try {
    // Store verification code with 15-minute expiration
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Using PatientAudit table as temporary storage for verification codes
    // In production, create a dedicated VerificationCodes table
    await prisma.patientAudit.create({
      data: {
        patientId: 0, // Special ID for verification codes
        action: type.toUpperCase(),
        actorEmail: email,
        diff: JSON.stringify({
          code,
          expiresAt: expiresAt.toISOString(),
          verified: false,
        }),
      },
    });

    logger.info(`Verification code stored for ${email} (${type})`);
    return true;
  } catch (error) {
    logger.error('Failed to store verification code:', error);
    return false;
  }
}

/**
 * Verify an OTP code
 */
export async function verifyOTPCode(
  email: string,
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp'
): Promise<VerificationResult> {
  try {
    // Find the most recent verification code for this email
    const verificationRecord: any = await prisma.patientAudit.findFirst({
      where: {
        patientId: 0,
        action: type.toUpperCase(),
        actorEmail: email,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!verificationRecord) {
      return {
        success: false,
        message: 'No verification code found for this email',
      };
    }

    const data = JSON.parse(verificationRecord.diff as string);

    // Check if code is expired
    if (new Date() > new Date(data.expiresAt)) {
      return {
        success: false,
        message: 'Verification code has expired',
      };
    }

    // Check if already verified
    if (data.verified) {
      return {
        success: false,
        message: 'This code has already been used',
      };
    }

    // Check if code matches
    if (data.code !== code) {
      // Log failed attempt
      logger.warn(`Invalid verification code attempt for ${email}`);
      return {
        success: false,
        message: 'Invalid verification code',
      };
    }

    // Mark as verified
    await prisma.patientAudit.update({
      where: { id: verificationRecord.id },
      data: {
        diff: JSON.stringify({
          ...data,
          verified: true,
          verifiedAt: new Date().toISOString(),
        }),
      },
    });

    logger.info(`Email verified successfully for ${email}`);

    return {
      success: true,
      message: 'Email verified successfully',
      email,
    };
  } catch (error) {
    logger.error('Error verifying OTP code:', error);
    return {
      success: false,
      message: 'Verification failed',
    };
  }
}

/**
 * Send verification email via AWS SES
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp'
): Promise<boolean> {
  try {
    const subject =
      type === 'login_otp'
        ? 'Your Login Code - EONPRO'
        : type === 'email_verification'
          ? 'Verify Your Email Address - EONPRO'
          : 'Reset Your Password - EONPRO';

    const result = await sendEmail({
      to: email,
      subject,
      html: generateEmailTemplate(code, type),
      text: `Your ${type === 'login_otp' ? 'login' : type === 'email_verification' ? 'verification' : 'password reset'} code is: ${code}. This code expires in 15 minutes.`,
      sourceType: 'manual',
      sourceId: `${type}-${Date.now()}`,
      skipLogging: true, // Critical auth emails must bypass suppression checks
    });

    if (result.success) {
      logger.info(`Verification email sent to ${email}`, { type, messageId: result.messageId });
      return true;
    } else {
      logger.error(`Failed to send verification email to ${email}`, { type, error: result.error });
      return false;
    }
  } catch (error: unknown) {
    logger.error('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Generate email HTML template with EONPRO branding
 */
function generateEmailTemplate(
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp'
): string {
  const title =
    type === 'login_otp'
      ? 'Your Login Code'
      : type === 'email_verification'
        ? 'Verify Your Email Address'
        : 'Reset Your Password';

  const message =
    type === 'login_otp'
      ? 'Use this code to log in to your account:'
      : type === 'email_verification'
        ? 'Please use the following code to verify your email address:'
        : 'Please use the following code to reset your password:';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #efece7; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .card { background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: #059669; color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 600; }
          .content { padding: 30px; }
          .code-box { 
            background: #efece7; 
            border: 2px dashed #059669; 
            border-radius: 8px;
            padding: 20px; 
            margin: 24px 0; 
            text-align: center; 
            font-size: 36px; 
            font-weight: bold; 
            letter-spacing: 8px;
            color: #059669;
          }
          .warning { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 16px; border-radius: 4px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #6B7280; font-size: 13px; border-top: 1px solid #E5E7EB; }
          .footer a { color: #059669; text-decoration: none; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header">
              <h1>${title}</h1>
            </div>
            <div class="content">
              <p>${message}</p>
              <div class="code-box">${code}</div>
              <div class="warning">
                <strong>This code expires in 15 minutes</strong> for security reasons.
              </div>
              <p style="color: #6B7280; font-size: 14px;">If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} EONPRO. All rights reserved.</p>
              <p><a href="https://eonpro.io">eonpro.io</a></p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Clean up expired verification codes
 */
export async function cleanupExpiredCodes(): Promise<void> {
  try {
    const expiredRecords = await prisma.patientAudit.findMany({
      where: {
        patientId: 0,
        action: {
          in: ['EMAIL_VERIFICATION', 'PASSWORD_RESET', 'LOGIN_OTP'],
        },
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Older than 24 hours
        },
      },
    });

    if (expiredRecords.length > 0) {
      await prisma.patientAudit.deleteMany({
        where: {
          id: {
            in: expiredRecords.map((r: any) => r.id),
          },
        },
      });

      logger.info(`Cleaned up ${expiredRecords.length} expired verification codes`);
    }
  } catch (error) {
    logger.error('Failed to cleanup expired codes:', error);
  }
}
