/**
 * User Welcome Notification Service
 *
 * Sends a secure "Set Your Password" email and/or SMS when a new user
 * is created for a clinic. Uses PasswordResetToken (same mechanism as
 * the affiliate approval flow) so credentials are never transmitted
 * in plaintext.
 *
 * Email: AWS SES via @/lib/email
 * SMS:   Twilio via @/lib/integrations/twilio/smsService
 */

import crypto from 'crypto';
import { basePrisma as prisma } from '@/lib/db';
import { sendEmail, type EmailResult } from '@/lib/email';
import { sendSMS, formatPhoneNumber, type SMSResponse } from '@/lib/integrations/twilio/smsService';
import { logger } from '@/lib/logger';

const SETUP_TOKEN_EXPIRY_HOURS = 72; // 3 days for initial setup

export interface UserWelcomeParams {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  clinicId: number;
  clinicName: string;
  clinicSubdomain?: string | null;
  clinicCustomDomain?: string | null;
  clinicLogoUrl?: string | null;
  phone?: string | null;
  sendEmail?: boolean;
  sendSms?: boolean;
}

export interface UserWelcomeResult {
  emailSent: boolean;
  smsSent: boolean;
  emailError?: string;
  smsError?: string;
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

function getRoleLabel(role: string): string {
  return ROLE_LABELS[role.toUpperCase()] || role;
}

function buildSetupUrl(
  rawToken: string,
  role: string,
  clinicSubdomain?: string | null,
  clinicCustomDomain?: string | null,
): string {
  const domain = clinicCustomDomain
    || (clinicSubdomain ? `${clinicSubdomain}.eonpro.io` : null)
    || 'app.eonpro.io';

  const upperRole = role.toUpperCase();
  if (upperRole === 'AFFILIATE') {
    return `https://${domain}/affiliate/welcome?token=${rawToken}`;
  }
  return `https://${domain}/setup-account?token=${rawToken}`;
}

function buildWelcomeEmailHtml(params: UserWelcomeParams, setupUrl: string): string {
  const roleLabel = getRoleLabel(params.role);
  const logoHtml = params.clinicLogoUrl
    ? `<img src="${params.clinicLogoUrl}" alt="${params.clinicName}" style="height: 40px; max-width: 200px; object-fit: contain;" />`
    : `<h2 style="color: #1f2937; margin: 0;">${params.clinicName}</h2>`;

  return `
    <div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #374151;">
      <div style="text-align: center; padding: 32px 0 24px;">
        ${logoHtml}
      </div>
      <div style="background: #ffffff; border-radius: 16px; padding: 32px; border: 1px solid #e5e7eb;">
        <h1 style="font-size: 20px; font-weight: 600; color: #111827; margin: 0 0 8px;">
          Welcome, ${params.firstName}!
        </h1>
        <p style="font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 20px;">
          Your <strong>${roleLabel}</strong> account has been created at <strong>${params.clinicName}</strong>.
          To get started, set your password by clicking the button below.
        </p>

        <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 0 0 24px; text-align: center;">
          <p style="font-size: 13px; color: #6b7280; margin: 0 0 4px;">Your login email</p>
          <p style="font-size: 15px; font-weight: 600; color: #111827; margin: 0;">${params.email}</p>
        </div>

        <div style="text-align: center; margin: 24px 0;">
          <a href="${setupUrl}" style="
            display: inline-block;
            background: #111827;
            color: #ffffff;
            padding: 14px 32px;
            border-radius: 12px;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
          ">
            Set My Password
          </a>
        </div>

        <p style="font-size: 13px; line-height: 1.5; color: #6b7280; margin: 24px 0 0;">
          This link expires in ${SETUP_TOKEN_EXPIRY_HOURS} hours. If you did not expect this account,
          please contact your clinic administrator.
        </p>
      </div>
      <div style="text-align: center; padding: 24px 0;">
        <p style="font-size: 12px; color: #9ca3af; margin: 0;">
          Powered by <strong>EONPro</strong>
        </p>
      </div>
    </div>
  `;
}

/**
 * Create a setup token and send a "Set Your Password" email and/or SMS.
 *
 * Flow:
 * 1. Generate cryptographic token
 * 2. Store hashed token in PasswordResetToken table
 * 3. Send email with setup link (and/or SMS)
 *
 * The user clicks the link → /setup-account?token=xxx → sets their own password.
 * No plaintext credentials are ever transmitted.
 */
export async function sendUserWelcomeNotification(
  params: UserWelcomeParams
): Promise<UserWelcomeResult> {
  const result: UserWelcomeResult = {
    emailSent: false,
    smsSent: false,
  };

  const roleLabel = getRoleLabel(params.role);

  try {
    // Generate setup token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SETUP_TOKEN_EXPIRY_HOURS);

    await prisma.passwordResetToken.create({
      data: {
        userId: params.userId,
        token: hashedToken,
        expiresAt,
      },
    });

    const setupUrl = buildSetupUrl(
      rawToken,
      params.role,
      params.clinicSubdomain,
      params.clinicCustomDomain,
    );

    // --- Email ---
    if (params.sendEmail !== false) {
      try {
        const emailResult: EmailResult = await sendEmail({
          to: params.email,
          subject: `Welcome to ${params.clinicName} — Set Your Password`,
          html: buildWelcomeEmailHtml(params, setupUrl),
          clinicId: params.clinicId,
          sourceType: 'notification',
          sourceId: `user-welcome-${params.userId}`,
        });

        result.emailSent = emailResult.success;
        if (!emailResult.success) {
          result.emailError = emailResult.error;
          logger.error('[UserWelcome] Email failed', {
            userId: params.userId,
            clinicId: params.clinicId,
            role: params.role,
            error: emailResult.error,
          });
        } else {
          logger.info('[UserWelcome] Email sent', {
            userId: params.userId,
            clinicId: params.clinicId,
            role: params.role,
            messageId: emailResult.messageId,
          });
        }
      } catch (err) {
        result.emailError = err instanceof Error ? err.message : String(err);
        logger.error('[UserWelcome] Email exception', {
          userId: params.userId,
          clinicId: params.clinicId,
          error: result.emailError,
        });
      }
    }

    // --- SMS ---
    if (params.sendSms && params.phone) {
      try {
        const smsBody =
          `${params.clinicName}: Your ${roleLabel} account is ready. ` +
          `Set your password here: ${setupUrl}`;

        const smsResult: SMSResponse = await sendSMS({
          to: formatPhoneNumber(params.phone),
          body: smsBody,
          clinicId: params.clinicId,
          templateType: 'USER_WELCOME',
        });

        result.smsSent = smsResult.success;
        if (!smsResult.success) {
          result.smsError = smsResult.error;
          logger.error('[UserWelcome] SMS failed', {
            userId: params.userId,
            clinicId: params.clinicId,
            role: params.role,
            error: smsResult.error,
          });
        } else {
          logger.info('[UserWelcome] SMS sent', {
            userId: params.userId,
            clinicId: params.clinicId,
            role: params.role,
            messageId: smsResult.messageId,
          });
        }
      } catch (err) {
        result.smsError = err instanceof Error ? err.message : String(err);
        logger.error('[UserWelcome] SMS exception', {
          userId: params.userId,
          clinicId: params.clinicId,
          error: result.smsError,
        });
      }
    }
  } catch (tokenErr) {
    const msg = tokenErr instanceof Error ? tokenErr.message : String(tokenErr);
    result.emailError = msg;
    result.smsError = msg;
    logger.error('[UserWelcome] Token creation failed', {
      userId: params.userId,
      clinicId: params.clinicId,
      error: msg,
    });
  }

  return result;
}
