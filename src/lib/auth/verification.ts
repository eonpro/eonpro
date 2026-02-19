/**
 * Email verification service
 * Handles OTP generation, storage, and verification for email authentication
 */

import { prisma, basePrisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import crypto from 'crypto';

interface VerificationResult {
  success: boolean;
  message: string;
  email?: string;
}

export interface ClinicEmailBranding {
  clinicName: string;
  logoUrl?: string | null;
  primaryColor: string;
}

/**
 * Resolve clinic branding for email templates from a clinicId.
 * Returns null if clinic not found or no branding configured.
 */
export async function resolveClinicEmailBranding(
  clinicId: number | null | undefined
): Promise<ClinicEmailBranding | undefined> {
  if (!clinicId) return undefined;
  try {
    const clinic = await basePrisma.clinic.findUnique({
      where: { id: clinicId },
      select: { name: true, logoUrl: true, primaryColor: true },
    });
    if (!clinic) return undefined;
    return {
      clinicName: clinic.name,
      logoUrl: clinic.logoUrl,
      primaryColor: clinic.primaryColor || '#059669',
    };
  } catch {
    return undefined;
  }
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
 * Send verification email via AWS SES, branded per clinic
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp',
  clinic?: ClinicEmailBranding
): Promise<boolean> {
  try {
    const brandName = clinic?.clinicName || 'EONPRO';
    const subject =
      type === 'login_otp'
        ? `Your Login Code - ${brandName}`
        : type === 'email_verification'
          ? `Verify Your Email Address - ${brandName}`
          : `Reset Your Password - ${brandName}`;

    const result = await sendEmail({
      to: email,
      subject,
      html: generateEmailTemplate(code, type, clinic),
      text: `Your ${type === 'login_otp' ? 'login' : type === 'email_verification' ? 'verification' : 'password reset'} code is: ${code}. This code expires in 15 minutes.`,
      sourceType: 'manual',
      sourceId: `${type}-${Date.now()}`,
      skipLogging: true,
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
 * Generate email HTML template branded to the clinic (or EONPRO default)
 */
function generateEmailTemplate(
  code: string,
  type: 'email_verification' | 'password_reset' | 'login_otp',
  clinic?: ClinicEmailBranding
): string {
  const brandName = clinic?.clinicName || 'EONPRO';
  const brandColor = clinic?.primaryColor || '#059669';
  const logoUrl = clinic?.logoUrl;

  const title =
    type === 'login_otp'
      ? 'Your Login Code'
      : type === 'email_verification'
        ? 'Verify Your Email'
        : 'Reset Your Password';

  const message =
    type === 'login_otp'
      ? 'Use this code to log in to your account:'
      : type === 'email_verification'
        ? 'Please use the following code to verify your email address:'
        : 'Use this code to reset your password:';

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${brandName}" style="max-height:40px;max-width:180px;margin-bottom:16px;" />`
    : `<h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:white;">${brandName}</h2>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#333;margin:0;padding:0;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="background:white;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,0.08);overflow:hidden;">
      <div style="background:${brandColor};padding:32px 24px;text-align:center;">
        ${logoHtml}
        <h1 style="margin:0;font-size:22px;font-weight:600;color:white;">${title}</h1>
      </div>
      <div style="padding:32px 24px;">
        <p style="margin:0 0 8px;font-size:15px;color:#374151;">${message}</p>
        <div style="background:#f9fafb;border:2px solid ${brandColor};border-radius:12px;padding:24px;margin:20px 0;text-align:center;font-size:36px;font-weight:bold;letter-spacing:8px;color:${brandColor};">
          ${code}
        </div>
        <div style="background:#FFFBEB;border-left:4px solid #F59E0B;padding:12px 16px;border-radius:6px;margin:20px 0;">
          <p style="margin:0;font-size:14px;color:#92400E;"><strong>This code expires in 15 minutes</strong> for security reasons.</p>
        </div>
        <p style="color:#9CA3AF;font-size:13px;margin:20px 0 0;">If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.</p>
      </div>
      <div style="padding:20px 24px;text-align:center;border-top:1px solid #f3f4f6;">
        <p style="margin:0;color:#9CA3AF;font-size:12px;">&copy; ${new Date().getFullYear()} ${brandName}. All rights reserved.</p>
        <p style="margin:4px 0 0;color:#9CA3AF;font-size:12px;">Powered by <a href="https://eonpro.io" style="color:${brandColor};text-decoration:none;">EONPRO</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
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
