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
import { AUTH_CONFIG, JWT_SECRET, JWT_REFRESH_SECRET } from '@/lib/auth/config';
import { createSessionRecord } from '@/lib/auth/session-manager';
import { authRateLimiter } from '@/lib/security/enterprise-rate-limiter';
import { hashRefreshToken } from '@/lib/auth/refresh-token-rotation';

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

    // Create a session record so the auth middleware can validate this token.
    // This mirrors what the password login route does — without a sessionId
    // in the JWT, the middleware rejects the token as "session expired."
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
    const clearPromises: Promise<unknown>[] = [
      authRateLimiter.clearRateLimit(clientIp, email).catch((err: unknown) => {
        logger.warn('[VERIFY-EMAIL-OTP] Rate limit clear failed', {
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
          logger.warn('[VERIFY-EMAIL-OTP] Lockout clear failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        })
      );
    }
    await Promise.all(clearPromises);

    // Determine token expiry based on role
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

    // Create refresh token so patients can stay logged in beyond the access token TTL
    const refreshToken = await new SignJWT({
      id: effectiveUserId,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
      .sign(JWT_REFRESH_SECRET);

    // Create UserSession for refresh-token rotation (non-blocking)
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
        logger.warn('[VERIFY-EMAIL-OTP] UserSession creation failed', {
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });
    }

    logger.info('Successful email OTP login', {
      userId: user?.id,
      patientId: patient?.id,
      loginMethod: 'email_otp',
      sessionId,
    });

    // Audit log (non-blocking)
    prisma.auditLog.create({
      data: {
        action: 'LOGIN',
        userId: user?.id || 0,
        details: {
          method: 'email_otp',
          isPatient: isPatientLogin,
          sessionId,
        },
      },
    }).catch((auditErr: unknown) => {
      logger.warn('[VERIFY-EMAIL-OTP] Audit log creation failed', {
        error: auditErr instanceof Error ? auditErr.message : 'Unknown error',
      });
    });

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
      refreshToken,
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
