/**
 * VERIFY OTP API
 * ==============
 * Verifies a 6-digit OTP code and logs the user in
 * 
 * POST /api/auth/verify-otp
 * Body: { phone: string, code: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { logger } from '@/lib/logger';
import { strictRateLimit } from '@/lib/rateLimit';
import { sign } from 'jsonwebtoken';
import { AUTH_CONFIG } from '@/lib/auth/config';

// Schema for OTP verification
const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
});

// Get JWT secret
const JWT_SECRET = process.env.JWT_SECRET || AUTH_CONFIG.jwtSecret;

async function handleVerifyOtp(req: NextRequest): Promise<Response> {
  try {
    const body = await req.json();
    const validated = verifyOtpSchema.safeParse(body);
    
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.issues },
        { status: 400 }
      );
    }
    
    const { phone, code } = validated.data;
    
    // Format phone number
    const formattedPhone = formatPhoneNumber(phone);
    if (!formattedPhone) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      );
    }
    
    // Find the OTP record
    const otpRecord = await prisma.phoneOtp.findFirst({
      where: {
        phone: formattedPhone,
        code: code,
        expiresAt: {
          gt: new Date(),
        },
        used: false,
      },
    }).catch(() => null);
    
    if (!otpRecord) {
      logger.warn('Invalid or expired OTP attempt', { phone: formattedPhone });
      return NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 401 }
      );
    }
    
    // Mark OTP as used
    await prisma.phoneOtp.update({
      where: { id: otpRecord.id },
      data: { used: true },
    }).catch(() => {});
    
    // Find the user
    let user = null;
    let patient = null;
    let isPatientLogin = false;
    
    if (otpRecord.userId) {
      user = await prisma.user.findUnique({
        where: { id: otpRecord.userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          clinicId: true,
          status: true,
        },
      });
    }
    
    if (!user && otpRecord.patientId) {
      patient = await prisma.patient.findUnique({
        where: { id: otpRecord.patientId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          clinicId: true,
        },
      });
      isPatientLogin = true;
    }
    
    // If still no user found, search by phone
    if (!user && !patient) {
      user = await prisma.user.findFirst({
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
          lastName: true,
          role: true,
          clinicId: true,
          status: true,
        },
      });
      
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
            lastName: true,
            clinicId: true,
          },
        });
        isPatientLogin = !!patient;
      }
    }
    
    if (!user && !patient) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }
    
    // Check if user account is active
    if (user && user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Your account has been suspended. Please contact support.' },
        { status: 403 }
      );
    }
    
    // Generate JWT token
    const tokenPayload = isPatientLogin && patient
      ? {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          role: 'patient',
          clinicId: patient.clinicId,
          isPatient: true,
        }
      : {
          id: user!.id,
          email: user!.email,
          firstName: user!.firstName,
          lastName: user!.lastName,
          role: user!.role?.toLowerCase(),
          clinicId: user!.clinicId,
        };
    
    const token = sign(tokenPayload, JWT_SECRET, {
      expiresIn: AUTH_CONFIG.tokenExpiry.access,
    });
    
    // Log successful login
    logger.info('Successful OTP login', {
      userId: user?.id,
      patientId: patient?.id,
      phone: formattedPhone,
      loginMethod: 'phone_otp',
    });
    
    // Create audit log
    try {
      await prisma.auditLog.create({
        data: {
          action: 'LOGIN',
          userId: user?.id || null,
          details: {
            method: 'phone_otp',
            phone: formattedPhone,
            isPatient: isPatientLogin,
          },
        },
      });
    } catch (e) {
      // Audit log failure shouldn't block login
    }
    
    // Return token and user data
    const userData = isPatientLogin && patient
      ? {
          id: patient.id,
          email: patient.email,
          firstName: patient.firstName,
          lastName: patient.lastName,
          role: 'patient',
          clinicId: patient.clinicId,
        }
      : {
          id: user!.id,
          email: user!.email,
          firstName: user!.firstName,
          lastName: user!.lastName,
          role: user!.role,
          clinicId: user!.clinicId,
        };
    
    return NextResponse.json({
      success: true,
      token,
      user: userData,
      message: 'Login successful',
    });
    
  } catch (error: any) {
    logger.error('Error in verify-otp endpoint', { error: error.message });
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
}

// Apply strict rate limiting (10 attempts per minute per IP)
export const POST = strictRateLimit(handleVerifyOtp);
