/**
 * Login endpoint with enterprise-grade rate limiting
 *
 * Features:
 * - Composite rate limiting (IP + email)
 * - Progressive security escalation
 * - Trusted network support
 * - Self-service unlock via email OTP
 * - Admin override capability
 *
 * @module api/auth/login
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { prisma, basePrisma } from '@/lib/db';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { authRateLimiter } from '@/lib/security/enterprise-rate-limiter';
import { logger } from '@/lib/logger';
// Note: Patient, Provider, Order types imported from models are not directly used
// The Prisma client provides type-safe queries for these entities

// Zod schema for login request validation
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  role: z
    .enum(['patient', 'provider', 'admin', 'super_admin', 'influencer', 'staff', 'support'])
    .default('patient'),
  clinicId: z.number().nullable().optional(), // Accept null, undefined, or number
  captchaToken: z.string().optional(), // For CAPTCHA verification when required
});

/**
 * POST /api/auth/login
 * Login endpoint with enterprise-grade rate limiting
 *
 * Security Features:
 * - Composite rate limiting (IP + email based)
 * - Progressive security (CAPTCHA, delays, email verification)
 * - Trusted network support
 * - Clear rate limits on successful login
 *
 * Supports multi-clinic users - returns clinics array for selection
 */
async function loginHandler(req: NextRequest) {
  const startTime = Date.now();
  let debugInfo: Record<string, unknown> = { step: 'start' };
  const clientIp = authRateLimiter.getClientIp(req);

  try {
    const body = await req.json();

    // Validate input with Zod schema
    const validationResult = loginSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const {
      email,
      password,
      role,
      clinicId: selectedClinicId,
      captchaToken,
    } = validationResult.data;

    // ============================================================================
    // ENTERPRISE RATE LIMITING - Check before any database operations
    // ============================================================================
    const rateLimitResult = await authRateLimiter.checkAndRecord(clientIp, email, false);

    if (!rateLimitResult.allowed) {
      // Log the rate limit event
      logger.warn('[Login] Rate limit exceeded', {
        ip: clientIp,
        email: email.substring(0, 3) + '***',
        attempts: rateLimitResult.attempts,
        securityLevel: rateLimitResult.securityLevel,
        isLocked: rateLimitResult.isLocked,
      });

      // Return progressive security response
      return NextResponse.json(
        {
          error: rateLimitResult.message,
          code: 'RATE_LIMIT_EXCEEDED',
          securityLevel: rateLimitResult.securityLevel,
          requiresCaptcha: rateLimitResult.requiresCaptcha,
          requiresEmailVerification: rateLimitResult.requiresEmailVerification,
          isLocked: rateLimitResult.isLocked,
          unlockMethods: rateLimitResult.unlockMethods,
          remainingAttempts: rateLimitResult.remainingAttempts,
          retryAfter: rateLimitResult.resetInSeconds,
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Remaining': rateLimitResult.remainingAttempts.toString(),
            'X-RateLimit-Reset': new Date(
              Date.now() + rateLimitResult.resetInSeconds * 1000
            ).toISOString(),
            'Retry-After': rateLimitResult.resetInSeconds.toString(),
            'X-Security-Level': rateLimitResult.securityLevel.toString(),
          },
        }
      );
    }

    // TODO: Verify CAPTCHA if required by security level
    // if (rateLimitResult.requiresCaptcha && !captchaToken) {
    //   return NextResponse.json(
    //     {
    //       error: 'Security verification required',
    //       code: 'CAPTCHA_REQUIRED',
    //       requiresCaptcha: true,
    //       remainingAttempts: rateLimitResult.remainingAttempts,
    //     },
    //     { status: 403 }
    //   );
    // }

    // Debug info only in development
    if (process.env.NODE_ENV === 'development') {
      debugInfo = { step: 'parsed_body', email, role, hasPassword: !!password };
      logger.debug('[Login] Starting login', debugInfo);
    }

    // Find user from unified User table first
    // Define a flexible type that can hold various user shapes from different queries
    type FlexibleUser = Awaited<ReturnType<typeof prisma.user.findUnique>> & {
      provider?: unknown;
      influencer?: unknown;
      patient?: unknown;
      permissions?: unknown;
      features?: unknown;
    };

    let user: FlexibleUser | null = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        provider: true,
        influencer: true,
        patient: true,
      },
    });

    // Debug logging only in development
    if (process.env.NODE_ENV === 'development') {
      debugInfo.step = 'user_found';
      debugInfo.userFound = !!user;
      logger.debug('[Login] User lookup result', { found: !!user, role: user?.role });
    }

    let passwordHash: string | null = null;

    if (user) {
      // User exists in unified system
      passwordHash = user.passwordHash;
    } else {
      // Fallback to legacy tables for backward compatibility
      switch (role) {
        case 'provider':
          // Legacy provider lookup - use basePrisma to bypass clinic filtering
          // since providers can be shared across clinics
          const provider = await basePrisma.provider.findFirst({
            where: { email: email.toLowerCase() },
          });
          if (provider) {
            // Map provider to user-like structure for token generation
            const providerData = provider as typeof provider & {
              passwordHash?: string;
              firstName?: string;
              lastName?: string;
              clinicId?: number;
            };
            user = {
              id: providerData.id,
              email: providerData.email || '',
              firstName: providerData.firstName || '',
              lastName: providerData.lastName || '',
              role: 'provider',
              status: 'ACTIVE',
              providerId: providerData.id,
              clinicId: providerData.clinicId,
            } as unknown as FlexibleUser;
            passwordHash = providerData.passwordHash || null;
          }
          break;

        case 'influencer':
          const influencer = await prisma.influencer.findUnique({
            where: { email: email.toLowerCase() },
          });
          if (influencer) {
            user = {
              id: influencer.id,
              email: influencer.email,
              firstName: influencer.name,
              lastName: '',
              role: 'influencer',
              status: 'ACTIVE',
            } as unknown as FlexibleUser;
            passwordHash = influencer.passwordHash;
          }
          break;

        case 'patient':
          // Patient login from legacy Patient table
          const patientRecord = await prisma.patient.findFirst({
            where: { email: email.toLowerCase() },
          });
          // Note: Patients typically don't have passwords in legacy system
          // They use email magic link or are created via User table now
          if (patientRecord) {
            // Check if there's an associated User record
            const patientUser = await prisma.user.findFirst({
              where: { patientId: patientRecord.id },
            });
            if (patientUser) {
              user = patientUser as FlexibleUser;
              passwordHash = patientUser.passwordHash;
            }
          }
          break;

        case 'admin':
        case 'super_admin':
          // SECURITY: Admin users must exist in the database
          // No hardcoded credentials - all admins must be created via proper user management
          const adminUser = await prisma.user.findFirst({
            where: {
              email: email.toLowerCase(),
              role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            },
            include: {
              provider: true,
            },
          });
          if (adminUser) {
            user = adminUser as FlexibleUser;
            passwordHash = adminUser.passwordHash;
          }
          break;

        case 'staff':
        case 'support':
          // Staff and support users
          const staffUser = await prisma.user.findFirst({
            where: {
              email: email.toLowerCase(),
              role: { in: ['STAFF', 'SUPPORT'] },
            },
          });
          if (staffUser) {
            user = staffUser as FlexibleUser;
            passwordHash = staffUser.passwordHash;
          }
          break;

        default:
          // For any unrecognized role, try to find user by email only
          // This provides fallback compatibility
          break;
      }
    }

    // When frontend doesn't send role (e.g. main login page), default is 'patient'
    // so legacy providers/admins would not be found. Try legacy lookups by email once.
    if (!user) {
      const legacyProvider = await basePrisma.provider.findFirst({
        where: { email: email.toLowerCase() },
      });
      if (legacyProvider) {
        const providerData = legacyProvider as typeof legacyProvider & {
          passwordHash?: string;
          firstName?: string;
          lastName?: string;
          clinicId?: number;
        };
        user = {
          id: providerData.id,
          email: providerData.email || '',
          firstName: providerData.firstName || '',
          lastName: providerData.lastName || '',
          role: 'provider',
          status: 'ACTIVE',
          providerId: providerData.id,
          clinicId: providerData.clinicId,
        } as unknown as FlexibleUser;
        passwordHash = providerData.passwordHash || null;
      }
      if (!user) {
        const adminUser = await prisma.user.findFirst({
          where: {
            email: email.toLowerCase(),
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          },
          include: { provider: true },
        });
        if (adminUser) {
          user = adminUser as FlexibleUser;
          passwordHash = adminUser.passwordHash;
        }
      }
    }

    // Check if user exists
    if (!user) {
      // Log failed attempt (no PHI in message)
      logger.warn('Failed login attempt', { emailPrefix: email.substring(0, 3) + '***', role });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password (if passwordHash exists)
    if (passwordHash) {
      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        logger.warn('Invalid password for login attempt', {
          emailPrefix: email.substring(0, 3) + '***',
          role,
        });

        // Return with rate limit info so user knows their status
        return NextResponse.json(
          {
            error: 'Invalid credentials',
            remainingAttempts: rateLimitResult.remainingAttempts - 1,
            requiresCaptcha: rateLimitResult.requiresCaptcha,
            securityLevel: rateLimitResult.securityLevel,
          },
          {
            status: 401,
            headers: {
              'X-RateLimit-Remaining': Math.max(
                0,
                rateLimitResult.remainingAttempts - 1
              ).toString(),
              'X-Security-Level': rateLimitResult.securityLevel.toString(),
            },
          }
        );
      }
    }

    // ============================================================================
    // SUCCESS - Clear rate limit for this email/IP combination (non-blocking)
    // ============================================================================
    try {
      await authRateLimiter.clearRateLimit(clientIp, email);
      logger.info('[Login] Rate limit cleared on successful login', {
        ip: clientIp,
        email: email.substring(0, 3) + '***',
      });
    } catch (clearErr: unknown) {
      logger.warn('[Login] Rate limit clear failed (login continues)', {
        error: clearErr instanceof Error ? clearErr.message : 'Unknown error',
      });
    }

    // Check if email is verified for patients
    const userWithEmail = user as typeof user & { emailVerified?: boolean };
    if (user.role === 'PATIENT' && userWithEmail.emailVerified === false) {
      logger.warn('Unverified email login attempt', { emailPrefix: email.substring(0, 3) + '***' });
      return NextResponse.json(
        {
          error: 'Please verify your email before logging in.',
          code: 'EMAIL_NOT_VERIFIED',
          email: user.email,
        },
        { status: 403 }
      );
    }

    // Normalize role to lowercase for consistency (Prisma enum may be string e.g. SUPER_ADMIN)
    const userRole = String(user.role ?? role).toLowerCase();

    // Fetch user's clinics for multi-clinic support
    let clinics: Array<{
      id: number;
      name: string;
      subdomain: string | null;
      logoUrl: string | null;
      iconUrl: string | null;
      faviconUrl: string | null;
      role: string;
      isPrimary: boolean;
    }> = [];

    // Primary clinic from user record
    if (user.clinicId) {
      const primaryClinic = await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: {
          id: true,
          name: true,
          subdomain: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
        },
      });
      if (primaryClinic) {
        clinics.push({
          ...primaryClinic,
          role: userRole,
          isPrimary: true,
        });
      }
    }

    // Fetch additional clinics from UserClinic table
    try {
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              logoUrl: true,
              iconUrl: true,
              faviconUrl: true,
            },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      for (const uc of userClinics) {
        if (!clinics.find((c) => c.id === uc.clinic.id)) {
          clinics.push({
            ...uc.clinic,
            role: uc.role,
            isPrimary: uc.isPrimary,
          });
        }
      }
    } catch (error: unknown) {
      // UserClinic might not exist (pre-migration), continue with primary clinic
      logger.debug('[Login] UserClinic lookup skipped', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: user.id,
      });
    }

    // Determine active clinic - use selected, subdomain-based, primary, or first available
    let activeClinicId: number | undefined = undefined;
    if (userRole !== 'super_admin') {
      if (selectedClinicId && clinics.find((c) => c.id === selectedClinicId)) {
        activeClinicId = selectedClinicId;
      } else {
        // Try to detect clinic from subdomain (for white-labeled login)
        const host = req.headers.get('host') || '';
        const subdomain = extractSubdomain(host);

        if (subdomain) {
          // Find clinic by subdomain (case-insensitive)
          const subdomainClinic = await basePrisma.clinic.findFirst({
            where: { subdomain: { equals: subdomain, mode: 'insensitive' }, status: 'ACTIVE' },
            select: { id: true },
          });

          if (subdomainClinic) {
            // Check if user has access to this clinic
            const hasAccess =
              clinics.some((c) => c.id === subdomainClinic.id) ||
              user.clinicId === subdomainClinic.id;

            if (hasAccess) {
              activeClinicId = subdomainClinic.id;
              logger.info('[Login] Using subdomain clinic', {
                subdomain,
                clinicId: subdomainClinic.id,
                userId: user.id,
              });
            } else {
              // User is on a clinic subdomain they don't have access to — reject to avoid confusion
              const primaryOrFirst = clinics.find((c) => c.isPrimary) || clinics[0];
              const correctSubdomain = primaryOrFirst?.subdomain;
              const correctLoginUrl = correctSubdomain
                ? buildClinicLoginUrl(req.headers.get('host') || '', correctSubdomain)
                : null;

              logger.warn('[Login] Login rejected: user on wrong clinic domain', {
                subdomain,
                subdomainClinicId: subdomainClinic.id,
                userId: user.id,
                userClinicId: user.clinicId,
              });

              return NextResponse.json(
                {
                  error:
                    "This login page is for a different clinic. Use your clinic's login URL to sign in.",
                  code: 'WRONG_CLINIC_DOMAIN',
                  correctLoginUrl,
                  clinicName: primaryOrFirst?.name ?? undefined,
                },
                { status: 403 }
              );
            }
          }
        }

        // Fallback to user's primary clinic or first available
        if (!activeClinicId) {
          activeClinicId = user.clinicId || clinics[0]?.id;
        }
      }
    }

    // Create JWT token
    const tokenPayload: {
      id: number;
      email: string;
      name: string;
      role: string;
      clinicId?: number;
      providerId?: number;
      patientId?: number;
      permissions?: string[];
      features?: string[];
    } = {
      id: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      role: userRole,
      clinicId: activeClinicId,
    };

    // Add providerId if user is a provider or has a linked provider
    if ('providerId' in user && user.providerId) {
      tokenPayload.providerId = user.providerId as number;
    } else if ('provider' in user && user.provider && typeof user.provider === 'object') {
      const provider = user.provider as { id: number };
      tokenPayload.providerId = provider.id;
    } else if (userRole === 'provider') {
      // FALLBACK: Look up provider by email if not already linked
      // This handles cases where the User record exists but providerId wasn't set
      // Use basePrisma to bypass clinic filtering since providers can be shared
      try {
        const providerByEmail = await basePrisma.provider.findFirst({
          where: { email: user.email.toLowerCase() },
          select: { id: true, clinicId: true },
        });
        if (providerByEmail) {
          tokenPayload.providerId = providerByEmail.id;
          // Also set clinicId if not already set
          if (!tokenPayload.clinicId && providerByEmail.clinicId) {
            tokenPayload.clinicId = providerByEmail.clinicId;
          }
          logger.info('[Login] Found provider by email fallback', {
            userId: user.id,
            providerId: providerByEmail.id,
            email: user.email,
          });
        }
      } catch (error: unknown) {
        // Log but don't fail on fallback lookup errors
        logger.debug('[Login] Provider fallback lookup failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          email: user.email,
        });
      }
    }

    // Add patientId if user is a patient or has a linked patient record
    if ('patientId' in user && user.patientId) {
      tokenPayload.patientId = user.patientId;
    } else if (userRole === 'patient') {
      // FALLBACK: Look up patient by email if not already linked
      try {
        const patientByEmail = await prisma.patient.findFirst({
          where: {
            email: user.email.toLowerCase(),
            clinicId: activeClinicId,
          },
          select: { id: true },
        });
        if (patientByEmail) {
          tokenPayload.patientId = patientByEmail.id;
          logger.info('[Login] Found patient by email fallback', {
            userId: user.id,
            patientId: patientByEmail.id,
            email: user.email,
          });
        }
      } catch (error: unknown) {
        // Log but don't fail on fallback lookup errors
        logger.debug('[Login] Patient fallback lookup failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          email: user.email,
        });
      }
    }

    // Add permissions and features if available
    if ('permissions' in user && user.permissions && Array.isArray(user.permissions)) {
      tokenPayload.permissions = user.permissions as string[];
    }
    if ('features' in user && user.features && Array.isArray(user.features)) {
      tokenPayload.features = user.features as string[];
    }

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
      .sign(JWT_SECRET);

    // Create refresh token
    const refreshToken = await new SignJWT({
      id: user.id,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
      .sign(JWT_SECRET);

    // Log successful login
    logger.debug(`Successful login: ${email} (${role})`);

    // Update last login, audit log, and session (non-blocking - do not fail login if these fail)
    const loginTime = new Date();
    if (user && 'lastLogin' in user) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            lastLogin: loginTime,
            failedLoginAttempts: 0,
          },
        });
      } catch (updateErr: unknown) {
        logger.warn('Failed to update user lastLogin', {
          userId: user.id,
          error: updateErr instanceof Error ? updateErr.message : 'Unknown error',
        });
      }

      if (tokenPayload.providerId) {
        await basePrisma.provider
          .update({
            where: { id: tokenPayload.providerId },
            data: { lastLogin: loginTime },
          })
          .catch((error: Error) => {
            logger.warn('Failed to update provider lastLogin:', error);
          });
      }

      await prisma.userAuditLog
        .create({
          data: {
            userId: user.id,
            action: 'LOGIN',
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
            userAgent: req.headers.get('user-agent'),
            details: {
              role: userRole,
              clinicId: activeClinicId,
              providerId: tokenPayload.providerId,
              loginMethod: 'password',
            },
          },
        })
        .catch((error: Error) => {
          logger.warn('Failed to create audit log:', error);
        });

      try {
        await prisma.userSession.create({
          data: {
            userId: user.id,
            token: token.substring(0, 64),
            refreshToken: refreshToken.substring(0, 64),
            ipAddress:
              req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            lastActivity: loginTime,
          },
        });
      } catch (sessionError) {
        logger.warn('Failed to create user session', {
          error: sessionError instanceof Error ? sessionError.message : 'Unknown error',
        });
      }
    }

    // ENTERPRISE: Fetch provider's clinic assignments for multi-clinic support
    let providerClinics: Array<{
      id: number;
      clinicId: number;
      isPrimary: boolean;
      clinic: { id: number; name: string; subdomain: string | null };
    }> = [];

    if (tokenPayload.providerId && prisma.providerClinic) {
      try {
        const assignments = await prisma.providerClinic.findMany({
          where: {
            providerId: tokenPayload.providerId,
            isActive: true,
          },
          select: {
            id: true,
            clinicId: true,
            isPrimary: true,
            clinic: {
              select: { id: true, name: true, subdomain: true },
            },
          },
          orderBy: { isPrimary: 'desc' },
        });
        providerClinics = assignments;
      } catch (err) {
        // ProviderClinic table may not exist yet (pre-migration)
        logger.debug('ProviderClinic fetch skipped - table may not exist', { error: err });
      }
    }

    // Return tokens with clinic information
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        role: userRole,
        clinicId: activeClinicId,
        providerId: tokenPayload.providerId,
        patientId: tokenPayload.patientId,
        permissions: 'permissions' in user ? user.permissions : undefined,
        features: 'features' in user ? user.features : undefined,
      },
      clinics,
      activeClinicId,
      hasMultipleClinics: clinics.length > 1,
      // If multi-clinic and no clinic selected, client should show selection UI
      requiresClinicSelection: clinics.length > 1 && !selectedClinicId,
      // ENTERPRISE: Provider's clinic assignments
      providerClinics,
      hasMultipleProviderClinics: providerClinics.length > 1,
      token,
      refreshToken,
    });

    // Set secure cookie - use the actual user role for cookie name
    response.cookies.set({
      name: `${userRole}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    // Also set a generic auth-token cookie for broader compatibility
    response.cookies.set({
      name: 'auth-token',
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const prismaError = (error as any)?.code;
    const duration = Date.now() - startTime;

    // Log detailed error for debugging
    console.error('[LOGIN_ERROR]', {
      message: errorMessage,
      stack: errorStack,
      type: error?.constructor?.name,
      prismaCode: prismaError,
      debugInfo,
      duration,
    });

    logger.error('Login error:', error instanceof Error ? error : new Error(errorMessage));

    // Report to Sentry (no PHI - step and code only)
    Sentry.captureException(error, {
      tags: {
        route: 'POST /api/auth/login',
        step: String(debugInfo?.step ?? 'unknown'),
        prismaCode: prismaError ? String(prismaError) : undefined,
      },
      extra: {
        duration,
        hasDebugStep: !!debugInfo?.step,
      },
    });

    // Return error details (safe to show in production for debugging login issues)
    return NextResponse.json(
      {
        error: 'An error occurred during login',
        details: errorMessage,
        code: prismaError || 'UNKNOWN',
        step: debugInfo?.step,
        duration,
      },
      { status: 500 }
    );
  }
}

/**
 * Build the login URL for a clinic subdomain using the same base domain as the request.
 * e.g., host "wellmedr.eonpro.io", subdomain "ot" -> "https://ot.eonpro.io/login"
 *       host "wellmedr.localhost:3000", subdomain "ot" -> "http://ot.localhost:3000/login"
 */
function buildClinicLoginUrl(host: string, subdomain: string): string {
  const [hostname, port] = host.split(':');
  const normalizedHost = hostname.toLowerCase();
  const protocol = normalizedHost.includes('localhost') ? 'http' : 'https';

  let baseDomain: string;
  if (normalizedHost.includes('localhost')) {
    baseDomain = 'localhost';
  } else if (normalizedHost.endsWith('.eonpro.io')) {
    baseDomain = 'eonpro.io';
  } else {
    const parts = normalizedHost.split('.');
    baseDomain = parts.length >= 2 ? parts.slice(-2).join('.') : normalizedHost;
  }

  const portSuffix = port ? `:${port}` : '';
  const origin = `${protocol}://${subdomain}.${baseDomain}${portSuffix}`;
  return `${origin}/login`;
}

/**
 * Extract subdomain from hostname
 * e.g., "ot.eonpro.io" -> "ot"
 *       "wellmedr.localhost:3000" -> "wellmedr"
 */
function extractSubdomain(hostname: string): string | null {
  // Normalize hostname (remove port)
  const normalizedHost = hostname.split(':')[0].toLowerCase();

  // Handle localhost specially
  if (normalizedHost.includes('localhost')) {
    const parts = normalizedHost.split('.');
    if (parts.length >= 2 && parts[0] !== 'localhost' && parts[0] !== 'www') {
      return parts[0];
    }
    return null;
  }

  // For eonpro.io domains
  if (normalizedHost.endsWith('.eonpro.io')) {
    const parts = normalizedHost.split('.');
    const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging'];
    if (parts.length >= 3 && !skipSubdomains.includes(parts[0])) {
      return parts[0];
    }
    return null;
  }

  // For other domains with subdomains (e.g., clinic.somedomain.com)
  const parts = normalizedHost.split('.');
  if (parts.length >= 3) {
    const skipSubdomains = ['www', 'app', 'api', 'admin', 'staging', 'portal'];
    if (!skipSubdomains.includes(parts[0])) {
      return parts[0];
    }
  }

  return null;
}

// Export handler directly - rate limiting is handled inside with enterprise features
export const POST = loginHandler;
