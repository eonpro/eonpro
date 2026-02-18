/**
 * VERIFY EMAIL OTP API
 * ====================
 * Verifies a 6-digit email OTP and logs the user in (issues JWT)
 *
 * POST /api/auth/verify-email-otp
 * Body: { email: string, code: string, clinicId?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { basePrisma as prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { verifyOTPCode } from '@/lib/auth/verification';
import { SignJWT } from 'jose';
import { AUTH_CONFIG, JWT_SECRET } from '@/lib/auth/config';

const verifyEmailOtpSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase().trim()),
  code: z.string().length(6, 'Code must be exactly 6 digits'),
  clinicId: z.number().positive().optional(),
});

export const POST = standardRateLimit(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const validated = verifyEmailOtpSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validated.error.issues },
        { status: 400 }
      );
    }

    const { email, code, clinicId } = validated.data;

    // Verify the OTP code
    const otpResult = await verifyOTPCode(email, code, 'login_otp');

    if (!otpResult.success) {
      logger.warn('Invalid email OTP attempt');
      return NextResponse.json(
        { error: otpResult.message || 'Invalid or expired code. Please request a new one.' },
        { status: 401 }
      );
    }

    // Look up the account by email
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

    // Try User table first
    user = await prisma.user.findFirst({
      where: { email },
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

    // If not found in User table, check Patient table
    if (!user) {
      patient = await prisma.patient.findFirst({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          clinicId: true,
        },
      });

      if (patient) {
        isPatientLogin = true;
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

    // Build JWT payload
    const tokenPayload: Record<string, unknown> =
      isPatientLogin && patient
        ? {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            role: 'patient',
            clinicId: clinicId || patient.clinicId,
            patientId: patient.id,
            isPatient: true,
          }
        : {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
            role: user!.role?.toLowerCase(),
            clinicId: clinicId || user!.clinicId,
          };

    // For provider users, resolve providerId
    if (!isPatientLogin && user && user.role?.toLowerCase() === 'provider') {
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
        // Non-fatal — proceed without providerId
      }
    }

    // Determine token expiry based on role
    const role = (tokenPayload.role as string) || 'patient';
    const expiry =
      role === 'patient'
        ? AUTH_CONFIG.tokenExpiry.patient
        : role === 'provider'
          ? AUTH_CONFIG.tokenExpiry.provider
          : AUTH_CONFIG.tokenExpiry.access;

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(JWT_SECRET);

    logger.info('Successful email OTP login', {
      userId: user?.id,
      patientId: patient?.id,
      loginMethod: 'email_otp',
    });

    // Audit log (non-blocking)
    try {
      await prisma.auditLog.create({
        data: {
          action: 'LOGIN',
          userId: user?.id || 0,
          details: {
            method: 'email_otp',
            isPatient: isPatientLogin,
          },
        },
      });
    } catch (auditErr: unknown) {
      logger.warn('[VERIFY-EMAIL-OTP] Audit log creation failed', {
        error: auditErr instanceof Error ? auditErr.message : 'Unknown error',
      });
    }

    // Build response user data
    const userData =
      isPatientLogin && patient
        ? {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            role: 'patient',
            clinicId: clinicId || patient.clinicId,
            patientId: patient.id,
          }
        : {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
            role: user!.role,
            clinicId: clinicId || user!.clinicId,
          };

    const response = NextResponse.json({
      success: true,
      token,
      user: userData,
      message: 'Login successful',
    });

    // Set auth cookies
    const userRole = (userData.role as string)?.toLowerCase() || 'patient';
    response.cookies.set({
      name: `${userRole}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24,
    });

    response.cookies.set({
      name: 'auth-token',
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error: unknown) {
    logger.error(
      'Error in verify-email-otp endpoint',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    );
  }
});
