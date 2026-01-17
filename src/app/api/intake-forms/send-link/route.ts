import { NextRequest, NextResponse } from 'next/server';
import { withProviderAuth } from '@/lib/auth/middleware';
import { createFormLink } from '@/lib/intake-forms/service';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import nodemailer from 'nodemailer';

// Validation schema
const sendLinkSchema = z.object({
  templateId: z.number().positive('Template ID is required'),
  patientEmail: z.string().email('Invalid email address'),
  patientPhone: z.string().optional(),
  sendMethod: z.enum(['email', 'sms', 'both', 'none']).default('email'),
  customMessage: z.string().optional(),
});

// Email transporter setup
const createTransporter = () => {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  const smtpUser = process.env.SMTP_USER;
  const smtpPassword = process.env.SMTP_PASSWORD;

  if (!smtpUser || !smtpPassword) {
    logger.warn('Email not configured - using console output for development');
    return null;
  }

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPassword,
    },
  });
};

// Send email with form link
async function sendEmailWithLink(
  to: string,
  formName: string,
  link: string,
  customMessage?: string
): Promise<void> {
  const transporter = createTransporter();
  
  const emailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
        <h1 style="color: white; margin: 0;">Intake Form Request</h1>
      </div>
      <div style="padding: 30px; background: #f9fafb;">
        <p style="font-size: 16px; color: #374151;">Hello,</p>
        
        <p style="font-size: 16px; color: #374151;">
          We need you to complete the <strong>${formName}</strong> intake form.
          ${customMessage ? `<br><br>${customMessage}` : ''}
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${link}" 
             style="display: inline-block; padding: 12px 30px; background: #10b981; 
                    color: white; text-decoration: none; border-radius: 6px; 
                    font-weight: bold; font-size: 16px;">
            Complete Form
          </a>
        </div>
        
        <p style="font-size: 14px; color: #6b7280; margin-top: 20px;">
          Or copy and paste this link into your browser:<br>
          <a href="${link}" style="color: #3b82f6; word-break: break-all;">${link}</a>
        </p>
        
        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">
            This link will expire in 30 days. Please complete the form as soon as possible.
          </p>
        </div>
      </div>
    </div>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM || '"Clinic" <noreply@clinic.com>',
        to,
        subject: `Please complete your ${formName} form`,
        html: emailContent,
      });
      logger.info(`Email sent to ${to} with form link`);
    } catch (error: any) {
    // @ts-ignore
   
      logger.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  } else {
    // Development mode - log to console
    logger.info('[EMAIL] Would be sent:', {
      to,
      subject: `Please complete your ${formName} form`,
      link
    });
  }
}

// Send SMS with form link (using Twilio if configured)
async function sendSMSWithLink(
  phone: string,
  formName: string,
  link: string
): Promise<void> {
  const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
    logger.warn('Twilio not configured - SMS not sent');
    logger.info('[SMS] Would be sent:', {
      to: phone,
      message: `Please complete your ${formName} intake form: ${link}`
    });
    return;
  }

  try {
    const twilio = require('twilio');
    const client = twilio(twilioAccountSid, twilioAuthToken);
    
    await client.messages.create({
      body: `Please complete your ${formName} intake form: ${link}`,
      from: twilioPhoneNumber,
      to: phone,
    });
    
    logger.info(`SMS sent to ${phone} with form link`);
  } catch (error: any) {
    // @ts-ignore
   
    logger.error('Failed to send SMS:', error);
    // Don't throw - SMS is optional
  }
}

/**
 * POST /api/intake-forms/send-link
 * Send an intake form link to a patient
 */
export const POST = withProviderAuth(async (req: NextRequest, user) => {
  try {
    const body = await req.json();
    
    // Validate request
    const parsed = sendLinkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: parsed.error.issues },
        { status: 400 }
      );
    }

    const { templateId, patientEmail, patientPhone, sendMethod, customMessage } = parsed.data;

    // Create the form link
    const link = await createFormLink({
      templateId,
      patientEmail,
      patientPhone,
      metadata: {
        sentBy: user.email,
        sendMethod,
        customMessage,
      } as any,
    });

    // Build the full URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('host')}`;
    const fullLink = `${baseUrl}/intake/${link.id}`;

    // Template should be included based on the service
    const templateName = (link as any).template?.name || `Form Template #${templateId}`;

    // Send based on method
    if (sendMethod === 'email' || sendMethod === 'both') {
      await sendEmailWithLink(
        patientEmail,
        templateName,
        fullLink,
        customMessage
      );
    }

    if ((sendMethod === 'sms' || sendMethod === 'both') && patientPhone) {
      await sendSMSWithLink(
        patientPhone,
        templateName,
        fullLink
      );
    }

    return NextResponse.json({
      success: true,
      link: fullLink,
      linkId: link.id,
      expiresAt: link.expiresAt,
      message: sendMethod === 'none' 
        ? 'Link created (not sent)' 
        : `Form link sent via ${sendMethod}`,
    });

  } catch (error: any) {
    logger.error('Failed to send form link', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send form link' },
      { status: 500 }
    );
  }
});