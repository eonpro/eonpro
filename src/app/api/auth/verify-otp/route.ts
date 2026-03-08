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
import { standardRateLimit } from '@/lib/rateLimit';
import { formatPhoneNumber } from '@/lib/integrations/twilio/smsService';
import { logger } from '@/lib/logger';
import { SignJWT } from 'jose';
import { AUTH_CONFIG, JWT_SECRET, JWT_REFRESH_SECRET } from '@/lib/auth/config';
import { createSessionRecord } from '@/lib/auth/session-manager';
import { authRateLimiter } from '@/lib/security/enterprise-rate-limiter';
import { hashRefreshToken } from '@/lib/auth/refresh-token-rotation';

// Schema for OTP verification
const verifyOtpSchema = z.object({
  phone: z.string().trim().min(10, 'Phone number must be at least 10 digits'),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});

export const POST = standardRateLimit(async (req: NextRequest) => {
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
    const otpRecord = await prisma.phoneOtp.findFirst({
      where: {
        phone: formattedPhone,
        code: code,
        expiresAt: {
          gt: new Date(),
        },
        used: false,
      },
    });

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
      data: { used: true, usedAt: new Date() },
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
      return NextResponse.json(
        { error: 'Invalid or expired verification code. Please request a new code.' },
        { status: 401 }
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

    // Create a session record so the auth middleware can validate this token.
    const effectiveUserId = isPatientLogin && patient ? patient.id : user!.id;
    const effectiveRole = (tokenPayload.role as string) || 'patient';
    const effectiveClinicId = (tokenPayload.clinicId as number) || undefined;

    const { sessionId } = await createSessionRecord(
      String(effectiveUserId),
      effectiveRole,
      effectiveClinicId,
      req
    );
    tokenPayload.sessionId = sessionId;

    // Clear lockout state and rate limits on successful OTP login
    const clientIp = authRateLimiter.getClientIp(req);
    const userEmail = user?.email || patient?.email || undefined;
    const clearPromises: Promise<unknown>[] = [
      authRateLimiter.clearRateLimit(clientIp, userEmail).catch((err: unknown) => {
        logger.warn('[VERIFY-OTP] Rate limit clear failed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }),
    ];
    if (user) {
      clearPromises.push(
        prisma.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: 0, lockedUntil: null },
        }).catch((err: unknown) => {
          logger.warn('[VERIFY-OTP] Lockout clear failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        })
      );
    }
    if (clearPromises.length > 0) {
      await Promise.all(clearPromises);
    }

    const expiry =
      effectiveRole === 'patient'
        ? AUTH_CONFIG.tokenExpiry.patient
        : effectiveRole === 'provider'
          ? AUTH_CONFIG.tokenExpiry.provider
          : AUTH_CONFIG.tokenExpiry.access;

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(JWT_SECRET);

    const refreshToken = await new SignJWT({
      id: effectiveUserId,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
      .sign(JWT_REFRESH_SECRET);

    if (user) {
      prisma.userSession.create({
        data: {
          userId: user.id,
          token: token.substring(0, 64),
          refreshToken: refreshToken.substring(0, 64),
          refreshTokenHash: hashRefreshToken(refreshToken),
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
          userAgent: req.headers.get('user-agent') || 'unknown',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          lastActivity: new Date(),
        },
      }).catch((err: unknown) => {
        logger.warn('[VERIFY-OTP] UserSession creation failed', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    }

    logger.info('Successful OTP login', {
      userId: user?.id,
      patientId: patient?.id,
      loginMethod: 'phone_otp',
      sessionId,
    });

    if (user?.id) {
      prisma.auditLog
        .create({
          data: {
            action: 'LOGIN',
            userId: user.id,
            details: { method: 'phone_otp', isPatient: isPatientLogin, sessionId },
          },
        })
        .catch((err: unknown) => {
          logger.warn('[VERIFY-OTP] Audit log creation failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
    } else {
      logger.info('[VERIFY-OTP] Skipping user auditLog write for patient-only OTP login', {
        patientId: patient?.id,
      });
    }

    const userData =
      isPatientLogin && patient
        ? {
            id: patient.id,
            email: patient.email,
            firstName: patient.firstName,
            lastName: patient.lastName,
            role: 'patient',
            clinicId: patient.clinicId,
            patientId: patient.id,
          }
        : {
            id: user!.id,
            email: user!.email,
            firstName: user!.firstName,
            lastName: user!.lastName,
            role: user!.role,
            clinicId: user!.clinicId,
            patientId: 'patientId' in user! && (user as any).patientId ? (user as any).patientId : undefined,
          };

    const response = NextResponse.json({
      success: true,
      token,
      refreshToken,
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
  } catch (error: unknown) {
    logger.error(
      'Error in verify-otp endpoint',
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 });
  }
});
