/**
 * SEND OTP API
 * ============
 * Sends a 6-digit OTP code via SMS for phone number authentication
 *
 * POST /api/auth/send-otp
 * Body: { phone: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { sendSMS, formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { isTwilioConfigured } from '@/lib/integrations/twilio/config';
import { isFeatureEnabled } from '@/lib/features';
import { logger } from '@/lib/logger';

// Schema for phone number
const sendOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

// Generate a random 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// OTP expiry time in minutes
const OTP_EXPIRY_MINUTES = 5;

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const validated = sendOtpSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid phone number', details: validated.error.issues },
        { status: 400 }
      );
    }

    const { phone } = validated.data;

    // Format phone number
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    // Find provider by phone number
    const provider = await prisma.provider.findFirst({
      where: {
        OR: [{ phone: formattedPhone }, { phone: phone }, { phone: phone.replace(/\D/g, '') }],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        phone: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            role: true,
            clinicId: true,
          },
        },
      },
    });

    // Also check Patient table if no provider found
    let patient: {
      id: number;
      email: string | null;
      firstName: string;
      phone: string | null;
    } | null = null;
    if (!provider) {
      patient = await prisma.patient.findFirst({
        where: {
          OR: [{ phone: formattedPhone }, { phone: phone }, { phone: phone.replace(/\D/g, '') }],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          phone: true,
        },
      });
    }

    // Don't reveal if account exists or not (security)
    // But we won't send OTP if no account found
    if (!provider && !patient) {
      // For security, still return success but log the attempt
      logger.warn('OTP request for unregistered phone number', { phone: formattedPhone });

      // Return success to prevent phone enumeration attacks
      return NextResponse.json({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP code.',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      });
    }

    // Verify Twilio is configured (not mock mode)
    const twilioConfigured = isTwilioConfigured();
    if (!twilioConfigured && process.env.TWILIO_USE_MOCK !== 'true') {
      logger.error('Twilio not configured - cannot send OTP SMS');
      return NextResponse.json(
        { error: 'SMS service is temporarily unavailable. Please use email login or try again later.' },
        { status: 503 }
      );
    }

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in database — this MUST succeed for verification to work
    let otpStored = false;
    try {
      await prisma.phoneOtp.deleteMany({
        where: { phone: formattedPhone },
      });

      await prisma.phoneOtp.create({
        data: {
          phone: formattedPhone,
          code: otp,
          expiresAt,
          userId: provider?.user?.id || null,
          patientId: patient?.id || null,
        },
      });
      otpStored = true;
    } catch (err: any) {
      logger.error('Failed to store OTP in database', { error: err.message });
    }

    if (!otpStored) {
      return NextResponse.json(
        { error: 'Unable to generate verification code. Please try again or use email login.' },
        { status: 500 }
      );
    }

    // Send SMS
    const firstName = provider?.firstName || patient?.firstName || 'there';
    const smsBody = `Hi ${firstName}! Your EONPRO verification code is: ${otp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;

    const twilioFeatureEnabled = isFeatureEnabled('TWILIO_SMS');
    const useMock = !twilioConfigured || process.env.TWILIO_USE_MOCK === 'true';

    try {
      const smsResult = await sendSMS({
        to: formattedPhone,
        body: smsBody,
      });

      if (!smsResult.success) {
        logger.error('Failed to send OTP SMS', {
          error: smsResult.error,
          details: smsResult.details,
          phone: formattedPhone,
          twilioConfigured,
          twilioFeatureEnabled,
          useMock,
        });
        return NextResponse.json(
          {
            error: 'Failed to send verification code. Please try again.',
            debug: {
              twilioConfigured,
              twilioFeatureEnabled,
              useMock,
              twilioError: smsResult.error,
              twilioDetails: smsResult.details?.message || smsResult.details,
            },
          },
          { status: 500 }
        );
      }

      logger.info('OTP sent successfully', {
        phone: formattedPhone,
        providerId: provider?.id,
        patientId: patient?.id,
        messageId: smsResult.messageId,
        isMock: smsResult.details?.mock === true,
      });

      // If using mock, return a warning
      if (smsResult.details?.mock) {
        return NextResponse.json({
          success: true,
          message: 'Verification code sent (MOCK MODE - real SMS not configured).',
          expiresIn: OTP_EXPIRY_MINUTES * 60,
          debug: { mock: true, twilioConfigured, twilioFeatureEnabled },
        });
      }
    } catch (smsError: any) {
      logger.error('Failed to send OTP SMS', { error: smsError.message, phone: formattedPhone });
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.', debug: smsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent to your phone.',
      expiresIn: OTP_EXPIRY_MINUTES * 60, // in seconds
    });
  } catch (error: any) {
    logger.error('Error in send-otp endpoint', { error: error.message });
    return NextResponse.json(
      { error: 'An error occurred. Please try again.', debug: error.message },
      { status: 500 }
    );
  }
}
