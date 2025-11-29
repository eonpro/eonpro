/**
 * Email verification service
 * Handles OTP generation, storage, and verification for email authentication
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
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
  type: 'email_verification' | 'password_reset'
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
  } catch (error: any) {
    // @ts-ignore
   
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
  type: 'email_verification' | 'password_reset'
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
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Error verifying OTP code:', error);
    return {
      success: false,
      message: 'Verification failed',
    };
  }
}

/**
 * Send verification email (mock implementation)
 * In production, integrate with email service like SendGrid/AWS SES
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  type: 'email_verification' | 'password_reset'
): Promise<boolean> {
  try {
    // Mock email sending
    logger.info(`[EMAIL] Sending ${type} to ${email}`);
    logger.info(`[EMAIL] Verification code: ${code}`);
    
    // In production, use actual email service:
    // await sendGrid.send({
    //   to: email,
    //   from: 'noreply@lifefile.com',
    //   subject: type === 'email_verification' 
    //     ? 'Verify your email address'
    //     : 'Reset your password',
    //   html: generateEmailTemplate(code, type),
    // });

    // For development, also log to console for testing
    logger.info(`
    ========================================
    ${type === 'email_verification' ? 'EMAIL VERIFICATION' : 'PASSWORD RESET'}
    ========================================
    To: ${email}
    Code: ${code}
    Expires in: 15 minutes
    ========================================
    `);

    return true;
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to send verification email:', error);
    return false;
  }
}

/**
 * Generate email HTML template
 */
function generateEmailTemplate(code: string, type: 'email_verification' | 'password_reset'): string {
  const title = type === 'email_verification' 
    ? 'Verify Your Email Address' 
    : 'Reset Your Password';
    
  const message = type === 'email_verification'
    ? 'Please use the following code to verify your email address:'
    : 'Please use the following code to reset your password:';

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
          .code-box { 
            background: #f4f4f4; 
            border: 2px solid #4CAF50; 
            padding: 20px; 
            margin: 30px 0; 
            text-align: center; 
            font-size: 32px; 
            font-weight: bold; 
            letter-spacing: 5px;
          }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${title}</h1>
          </div>
          <p>${message}</p>
          <div class="code-box">${code}</div>
          <p>This code will expire in 15 minutes for security reasons.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} Lifefile. All rights reserved.</p>
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
          in: ['EMAIL_VERIFICATION', 'PASSWORD_RESET'],
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
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to cleanup expired codes:', error);
  }
}
