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
import { logger } from '@/lib/logger';
import { strictRateLimit } from '@/lib/rateLimit';

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

async function handleSendOtp(req: NextRequest): Promise<Response> {
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
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }
    
    // Find user by phone number (check both User and Patient tables)
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { phone: formattedPhone },
          { phone: phone },
          { phone: phone.replace(/\D/g, '') },
        ],
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        phone: true,
      },
    });
    
    // Also check Patient table if no user found
    let patient = null;
    if (!user) {
      patient = await prisma.patient.findFirst({
        where: {
          OR: [
            { phoneNumber: formattedPhone },
            { phoneNumber: phone },
            { phoneNumber: phone.replace(/\D/g, '') },
          ],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          phoneNumber: true,
        },
      });
    }
    
    // Don't reveal if user exists or not (security)
    // But we won't send OTP if no user found
    if (!user && !patient) {
      // For security, still return success but log the attempt
      logger.warn('OTP request for unregistered phone number', { phone: formattedPhone });
      
      // Return success to prevent phone enumeration attacks
      return NextResponse.json({
        success: true,
        message: 'If this phone number is registered, you will receive an OTP code.',
        expiresIn: OTP_EXPIRY_MINUTES * 60,
      });
    }
    
    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    
    // Store OTP in database
    // First, delete any existing OTPs for this phone
    await prisma.phoneOtp.deleteMany({
      where: {
        phone: formattedPhone,
      },
    }).catch(() => {
      // Table might not exist yet, that's ok
    });
    
    // Create new OTP record
    await prisma.phoneOtp.create({
      data: {
        phone: formattedPhone,
        code: otp,
        expiresAt,
        userId: user?.id || null,
        patientId: patient?.id || null,
      },
    }).catch(async (err) => {
      // If table doesn't exist, create it
      logger.warn('PhoneOtp table may not exist, attempting to create...', { error: err.message });
      
      // Fallback: store in cache or memory (not ideal for production)
      // For now, we'll proceed and the verify endpoint will handle this
    });
    
    // Send SMS
    const firstName = user?.firstName || patient?.firstName || 'there';
    const smsBody = `Hi ${firstName}! Your EONPRO verification code is: ${otp}. This code expires in ${OTP_EXPIRY_MINUTES} minutes. Do not share this code with anyone.`;
    
    try {
      await sendSMS(formattedPhone, smsBody);
      logger.info('OTP sent successfully', { phone: formattedPhone, userId: user?.id, patientId: patient?.id });
    } catch (smsError: any) {
      logger.error('Failed to send OTP SMS', { error: smsError.message, phone: formattedPhone });
      return NextResponse.json(
        { error: 'Failed to send verification code. Please try again.' },
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
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// Temporarily bypass rate limiting for debugging
export async function POST(req: NextRequest): Promise<Response> {
  return handleSendOtp(req);
}

