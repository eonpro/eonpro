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
import { SignJWT } from 'jose';
import { AUTH_CONFIG, JWT_SECRET } from '@/lib/auth/config';

// Schema for OTP verification
const verifyOtpSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  code: z.string().length(6, 'OTP must be exactly 6 digits'),
});

export async function POST(req: NextRequest): Promise<Response> {
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
      return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 });
    }

    // Find the OTP record
    const otpRecord = await prisma.phoneOtp
      .findFirst({
        where: {
          phone: formattedPhone,
          code: code,
          expiresAt: {
            gt: new Date(),
          },
          used: false,
        },
      })
      .catch((err) => {
        logger.warn('[VerifyOTP] Failed to query OTP record', { error: err instanceof Error ? err.message : String(err) });
        return null;
      });

    if (!otpRecord) {
      logger.warn('Invalid or expired OTP attempt', { phone: formattedPhone });
      return NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 401 }
      );
    }

    // Mark OTP as used
    await prisma.phoneOtp
      .update({
        where: { id: otpRecord.id },
        data: { used: true, usedAt: new Date() },
      })
      .catch((err) => {
        logger.warn('[VerifyOTP] Failed to mark OTP as used', { error: err instanceof Error ? err.message : String(err), otpId: otpRecord.id });
      });

    // Find the account
    type UserData = {
      id: number;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      clinicId: number | null;
      status?: string;
    };
    type PatientData = {
      id: number;
      email: string | null;
      firstName: string;
      lastName: string;
      clinicId: number | null;
    };
    let user: UserData | null = null;
    let patient: PatientData | null = null;
    let isPatientLogin = false;

    // If OTP has userId, get the user
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

    // If OTP has patientId, get the patient
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

    // If still no account found, search by phone
    if (!user && !patient) {
      // Check Provider first (which has the phone field)
      const provider = await prisma.provider.findFirst({
        where: {
          OR: [{ phone: formattedPhone }, { phone: phone }, { phone: phone.replace(/\D/g, '') }],
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              clinicId: true,
              status: true,
            },
          },
        },
      });

      if (provider?.user) {
        user = provider.user;
      }

      // Check Patient if no provider found
      if (!user) {
        patient = await prisma.patient.findFirst({
          where: {
            OR: [{ phone: formattedPhone }, { phone: phone }, { phone: phone.replace(/\D/g, '') }],
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
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check if user account is active
    if (user && user.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Your account has been suspended. Please contact support.' },
        { status: 403 }
      );
    }

    // Generate JWT token
    const tokenPayload: any =
      isPatientLogin && patient
        ? {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            role: 'patient',
            clinicId: patient.clinicId,
            patientId: patient.id, // CRITICAL: Include patientId for patient portal API access
            isPatient: true,
          }
        : {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
            role: user!.role?.toLowerCase(),
            clinicId: user!.clinicId,
            patientId: 'patientId' in user! && user!.patientId ? user!.patientId : undefined,
          };

    // For provider users, add providerId to token
    if (!isPatientLogin && user && user.role?.toLowerCase() === 'provider') {
      // Check if user has providerId or linked provider
      if ('providerId' in user && user.providerId) {
        tokenPayload.providerId = user.providerId;
      } else if ('provider' in user && user.provider) {
        tokenPayload.providerId = (user.provider as any).id;
      } else {
        // FALLBACK: Look up provider by email
        try {
          const providerByEmail = await prisma.provider.findFirst({
            where: { email: user.email.toLowerCase() },
            select: { id: true, clinicId: true },
          });
          if (providerByEmail) {
            tokenPayload.providerId = providerByEmail.id;
            if (!tokenPayload.clinicId && providerByEmail.clinicId) {
              tokenPayload.clinicId = providerByEmail.clinicId;
            }
          }
        } catch {
          // Ignore fallback errors
        }
      }
    }

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
      .sign(JWT_SECRET);

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
          userId: user?.id || 0,
          details: {
            method: 'phone_otp',
            phone: formattedPhone,
            isPatient: isPatientLogin,
          },
        },
      });
    } catch (error: unknown) {
      // Audit log failure shouldn't block login
      logger.warn('[VERIFY-OTP] Audit log creation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Return token and user data
    const userData =
      isPatientLogin && patient
        ? {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            role: 'patient',
            clinicId: patient.clinicId,
            patientId: patient.id, // CRITICAL: Include patientId for patient portal
          }
        : {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
            role: user!.role,
            clinicId: user!.clinicId,
            patientId: 'patientId' in user! && user!.patientId ? user!.patientId : undefined,
          };

    const response = NextResponse.json({
      success: true,
      token,
      user: userData,
      message: 'Login successful',
    });

    // Set auth cookies (same as main login endpoint)
    const userRole = userData.role?.toLowerCase() || 'patient';
    response.cookies.set({
      name: `${userRole}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    response.cookies.set({
      name: 'auth-token',
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error: any) {
    logger.error('Error in verify-otp endpoint', { error: error.message });
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 });
  }
}
