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
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { prisma, basePrisma } from '@/lib/db';
import { JWT_SECRET, JWT_REFRESH_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { createSessionRecord } from '@/lib/auth/session-manager';
import { authRateLimiter } from '@/lib/security/enterprise-rate-limiter';
import { logger } from '@/lib/logger';
import { getRequestHost, getRequestHostWithUrlFallback, shouldUseEonproCookieDomain } from '@/lib/request-host';
import { hashRefreshToken } from '@/lib/auth/refresh-token-rotation';
import { withApiHandler } from '@/domains/shared/errors';

const AUTH_LOCKOUT_AFTER_ATTEMPTS = parseInt(process.env.AUTH_LOCKOUT_AFTER_ATTEMPTS || '5', 10);
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes
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
  deviceFingerprint: z.string().max(256).optional(), // Enterprise: device binding for audit
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
/** Derive clinicId from request context (header from middleware or body). Avoids null. */
function getClinicIdFromRequest(req: NextRequest, selectedClinicId?: number | null, userClinicId?: number | null): number | null {
  const fromHeader = req.headers.get('x-clinic-id');
  if (fromHeader) {
    const n = parseInt(fromHeader, 10);
    if (!Number.isNaN(n)) return n;
  }
  return selectedClinicId ?? userClinicId ?? null;
}

function createLoginAuditData(
  email: string,
  outcome: string,
  opts: {
    failureReason?: string;
    ipAddress?: string;
    userAgent?: string;
    clinicId?: number | null;
    deviceFingerprint?: string | null;
    requestId?: string | null;
    userId?: number | null;
  }
) {
  return {
    email: email.substring(0, 3) + '***',
    outcome,
    failureReason: opts.failureReason ?? null,
    ipAddress: opts.ipAddress ?? null,
    userAgent: opts.userAgent ?? null,
    clinicId: opts.clinicId ?? null,
    deviceFingerprint: opts.deviceFingerprint ?? null,
    requestId: opts.requestId ?? null,
    userId: opts.userId ?? null,
  };
}

async function loginHandler(req: NextRequest) {
  const startTime = Date.now();
  let debugInfo: Record<string, unknown> = { step: 'start' };
  const clientIp = authRateLimiter.getClientIp(req);
  const requestId = req.headers.get('x-request-id') || crypto.randomUUID();

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
      deviceFingerprint,
    } = validationResult.data;

    // ============================================================================
    // ENTERPRISE RATE LIMITING - Check before any database operations
    // ============================================================================
    const rateLimitResult = await authRateLimiter.checkAndRecord(clientIp, email, false);

    if (!rateLimitResult.allowed) {
      logger.warn('[Login] Rate limit exceeded', {
        ip: clientIp,
        email: email.substring(0, 3) + '***',
        attempts: rateLimitResult.attempts,
        securityLevel: rateLimitResult.securityLevel,
        isLocked: rateLimitResult.isLocked,
      });
      prisma.loginAudit
        .create({
          data: createLoginAuditData(email, 'FAILURE', {
            failureReason: 'Rate limit exceeded',
            ipAddress: clientIp,
            userAgent: req.headers.get('user-agent') || undefined,
            clinicId: getClinicIdFromRequest(req, validationResult.data.clinicId),
            deviceFingerprint: validationResult.data.deviceFingerprint || undefined,
            requestId,
          }),
        })
        .catch((e) => logger.debug('[Login] LoginAudit create failed', { error: e }));

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

    const auditClinicId = () => getClinicIdFromRequest(req, selectedClinicId, (user as { clinicId?: number })?.clinicId);
    const auditIp = clientIp;
    const auditUserAgent = req.headers.get('user-agent') || undefined;

    // Check if user exists (generic 401 to avoid enumeration)
    if (!user) {
      logger.warn('Failed login attempt', { emailPrefix: email.substring(0, 3) + '***', role });
      prisma.loginAudit
        .create({
          data: createLoginAuditData(email, 'FAILURE', {
            failureReason: 'Invalid credentials',
            ipAddress: auditIp,
            userAgent: auditUserAgent,
            clinicId: getClinicIdFromRequest(req, selectedClinicId),
            deviceFingerprint: deviceFingerprint || undefined,
            requestId,
          }),
        })
        .catch((e) => logger.debug('[Login] LoginAudit create failed', { error: e }));
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Durable lockout: check User.lockedUntil (generic 401 to avoid enumeration)
    const userWithLock = user as typeof user & { lockedUntil?: Date | null };
    if (userWithLock.lockedUntil && new Date(userWithLock.lockedUntil) > new Date()) {
      logger.warn('[Login] Locked account attempt', { emailPrefix: email.substring(0, 3) + '***' });
      prisma.loginAudit
        .create({
          data: createLoginAuditData(email, 'LOCKOUT', {
            failureReason: 'Account locked',
            ipAddress: auditIp,
            userAgent: auditUserAgent,
            clinicId: auditClinicId(),
            deviceFingerprint: deviceFingerprint || undefined,
            requestId,
          }),
        })
        .catch((e) => logger.debug('[Login] LoginAudit create failed', { error: e }));
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Verify password (if passwordHash exists); atomic lockout via transaction
    if (passwordHash) {
      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        logger.warn('Invalid password for login attempt', {
          emailPrefix: email.substring(0, 3) + '***',
          role,
        });
        // Atomic: increment + set lockedUntil if threshold reached
        const updated = await prisma.$transaction(async (tx) => {
          const u = await tx.user.update({
            where: { id: user!.id },
            data: { failedLoginAttempts: { increment: 1 } },
          });
          const nextCount = u.failedLoginAttempts;
          if (nextCount >= AUTH_LOCKOUT_AFTER_ATTEMPTS) {
            await tx.user.update({
              where: { id: user!.id },
              data: { lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) },
            });
          }
          return u;
        });

        prisma.loginAudit
          .create({
            data: createLoginAuditData(email, updated.failedLoginAttempts >= AUTH_LOCKOUT_AFTER_ATTEMPTS ? 'LOCKOUT' : 'FAILURE', {
              failureReason: 'Invalid credentials',
              ipAddress: auditIp,
              userAgent: auditUserAgent,
              clinicId: auditClinicId(),
              deviceFingerprint: deviceFingerprint || undefined,
              requestId,
            }),
          })
          .catch((e) => logger.debug('[Login] LoginAudit create failed', { error: e }));

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
              'X-RateLimit-Remaining': Math.max(0, rateLimitResult.remainingAttempts - 1).toString(),
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

    // Fetch primary clinic and additional clinics in parallel
    const [primaryClinic, userClinicsResult] = await Promise.all([
      user.clinicId
        ? prisma.clinic.findUnique({
            where: { id: user.clinicId },
            select: {
              id: true,
              name: true,
              subdomain: true,
              logoUrl: true,
              iconUrl: true,
              faviconUrl: true,
            },
          })
        : Promise.resolve(null),
      prisma.userClinic.findMany({
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
      }).catch((error: unknown) => {
        // UserClinic might not exist (pre-migration), continue with primary clinic
        logger.debug('[Login] UserClinic lookup skipped', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: user.id,
        });
        return [];
      }),
    ]);

    if (primaryClinic) {
      clinics.push({
        ...primaryClinic,
        role: userRole,
        isPrimary: true,
      });
    }

    for (const uc of userClinicsResult) {
      if (!clinics.find((c) => c.id === uc.clinic.id)) {
        clinics.push({
          ...uc.clinic,
          role: uc.role,
          isPrimary: uc.isPrimary,
        });
      }
    }

    // PROVIDER FIX: If provider has no clinics from User/UserClinic, use ProviderClinic assignments
    // (e.g. gsiglemd@eonmedicalcenter.com when User exists but has no clinicId/UserClinic)
    if (userRole === 'provider' && clinics.length === 0) {
      let providerIdForClinics: number | null = null;
      if ('providerId' in user && user.providerId) {
        providerIdForClinics = user.providerId as number;
      } else if ('provider' in user && user.provider && typeof user.provider === 'object') {
        providerIdForClinics = (user.provider as { id: number }).id;
      } else {
        const providerByEmail = await basePrisma.provider.findFirst({
          where: { email: user.email.toLowerCase() },
          select: { id: true },
        });
        if (providerByEmail) providerIdForClinics = providerByEmail.id;
      }
      if (providerIdForClinics && basePrisma.providerClinic) {
        try {
          const assignments = await basePrisma.providerClinic.findMany({
            where: { providerId: providerIdForClinics, isActive: true },
            select: {
              isPrimary: true,
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
            orderBy: { isPrimary: 'desc' },
          });
          for (const a of assignments) {
            clinics.push({
              ...a.clinic,
              role: userRole,
              isPrimary: a.isPrimary,
            });
          }
          if (clinics.length > 0) {
            logger.info('[Login] Populated provider clinics from ProviderClinic', {
              providerId: providerIdForClinics,
              clinicCount: clinics.length,
            });
          }
        } catch (err) {
          logger.debug('[Login] ProviderClinic lookup for clinics failed', {
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    // Determine active clinic: subdomain wins when user is on a clinic subdomain (e.g. ot.eonpro.io), then body selectedClinicId, then fallback
    let activeClinicId: number | undefined = undefined;
    if (userRole !== 'super_admin') {
      const host = getRequestHost(req);
      const subdomain = extractSubdomain(host);

      // 1) When Host is a clinic subdomain and user has access, use that clinic (so "landed on ot.eonpro.io" always means OT)
      if (subdomain) {
        const subdomainClinic = await basePrisma.clinic.findFirst({
          where: { subdomain: { equals: subdomain, mode: 'insensitive' }, status: 'ACTIVE' },
          select: { id: true },
        });

        if (subdomainClinic) {
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
            const primaryOrFirst = clinics.find((c) => c.isPrimary) || clinics[0];
            const correctSubdomain = primaryOrFirst?.subdomain;
            const correctLoginUrl = correctSubdomain
              ? buildClinicLoginUrl(host, correctSubdomain)
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

      // 2) Else use body selectedClinicId if valid
      if (!activeClinicId && selectedClinicId && clinics.find((c) => c.id === selectedClinicId)) {
        activeClinicId = selectedClinicId;
      }

      // 3) Fallback to user's primary or first available
      if (!activeClinicId) {
        activeClinicId = user.clinicId || clinics[0]?.id;
      }

      // Require a clinic for non–super_admin so the session is usable (avoids "No clinic context" on every API call)
      if (activeClinicId == null && userRole !== 'super_admin') {
        logger.warn('[Login] No clinic assigned', {
          userId: user.id,
          role: userRole,
          emailPrefix: user.email?.substring(0, 3) + '***',
        });
        return NextResponse.json(
          {
            error:
              'No clinic is assigned to your account. Please contact your administrator to be assigned to a clinic.',
            code: 'NO_CLINIC_ASSIGNED',
          },
          { status: 403 }
        );
      }

      // Observability: clinic context for eonpro.io (no PHI) for production diagnosis
      if (host && host.includes('eonpro.io')) {
        logger.info('[Login] clinic context', {
          host,
          subdomain: subdomain ?? null,
          activeClinicId: activeClinicId ?? null,
        });
      }
    }

    // Create JWT token payload (populated below)
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
      sessionId?: string;
    } = {
      id: user.id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      role: userRole,
      clinicId: activeClinicId,
    };

    // Add providerId/patientId from the user record if already linked
    if ('providerId' in user && user.providerId) {
      tokenPayload.providerId = user.providerId as number;
    } else if ('provider' in user && user.provider && typeof user.provider === 'object') {
      const provider = user.provider as { id: number };
      tokenPayload.providerId = provider.id;
    }
    if ('patientId' in user && user.patientId) {
      tokenPayload.patientId = user.patientId;
    }

    // Determine if we need fallback DB lookups for provider/patient
    const needsProviderFallback =
      userRole === 'provider' && !tokenPayload.providerId;
    const needsPatientFallback =
      userRole === 'patient' && !tokenPayload.patientId;

    // Parallelize session creation with provider/patient fallback lookups
    // These are independent DB calls: session creation needs user/clinic info (already known),
    // provider/patient lookups only need user email (already known).
    const [{ sessionId }, providerFallback, patientFallback] = await Promise.all([
      // Create session record so production auth (validateSession) can find it
      createSessionRecord(
        String(user.id),
        userRole,
        activeClinicId ?? undefined,
        req
      ),
      // FALLBACK: Look up provider by email if not already linked
      // This handles cases where the User record exists but providerId wasn't set
      // Use basePrisma to bypass clinic filtering since providers can be shared
      needsProviderFallback
        ? basePrisma.provider.findFirst({
            where: { email: user.email.toLowerCase() },
            select: { id: true, clinicId: true },
          }).catch((error: unknown) => {
            logger.debug('[Login] Provider fallback lookup failed', {
              error: error instanceof Error ? error.message : 'Unknown error',
              email: user.email,
            });
            return null;
          })
        : Promise.resolve(null),
      // FALLBACK: Look up patient by email if not already linked
      needsPatientFallback
        ? prisma.patient.findFirst({
            where: {
              email: user.email.toLowerCase(),
              clinicId: activeClinicId,
            },
            select: { id: true },
          }).catch((error: unknown) => {
            logger.debug('[Login] Patient fallback lookup failed', {
              error: error instanceof Error ? error.message : 'Unknown error',
              email: user.email,
            });
            return null;
          })
        : Promise.resolve(null),
    ]);

    // Apply provider fallback result
    if (providerFallback) {
      tokenPayload.providerId = providerFallback.id;
      // Also set clinicId if not already set
      if (!tokenPayload.clinicId && providerFallback.clinicId) {
        tokenPayload.clinicId = providerFallback.clinicId;
      }
      logger.info('[Login] Found provider by email fallback', {
        userId: user.id,
        providerId: providerFallback.id,
        email: user.email,
      });
    }

    // Apply patient fallback result
    if (patientFallback) {
      tokenPayload.patientId = patientFallback.id;
      logger.info('[Login] Found patient by email fallback', {
        userId: user.id,
        patientId: patientFallback.id,
        email: user.email,
      });
    }

    // Add permissions and features if available
    if ('permissions' in user && user.permissions && Array.isArray(user.permissions)) {
      tokenPayload.permissions = user.permissions as string[];
    }
    if ('features' in user && user.features && Array.isArray(user.features)) {
      tokenPayload.features = user.features as string[];
    }

    tokenPayload.sessionId = sessionId;

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.access)
      .sign(JWT_SECRET);

    // Create refresh token (signed with dedicated refresh secret)
    const refreshToken = await new SignJWT({
      id: user.id,
      type: 'refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(AUTH_CONFIG.tokenExpiry.refresh)
      .sign(JWT_REFRESH_SECRET);

    // Log successful login
    logger.debug(`Successful login: ${email} (${role})`);

    // Run providerClinics fetch IN PARALLEL with post-auth writes (login speed: was sequential, now parallel)
    const loginTime = new Date();

    const providerClinicsPromise: Promise<
      Array<{
        id: number;
        clinicId: number;
        isPrimary: boolean;
        clinic: { id: number; name: string; subdomain: string | null };
      }>
    > =
      tokenPayload.providerId && prisma.providerClinic
        ? prisma.providerClinic
            .findMany({
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
            })
            .catch(() => {
              logger.debug('ProviderClinic fetch skipped - table may not exist');
              return [];
            })
        : Promise.resolve([]);

    const postAuthWritesPromise =
      user && 'lastLogin' in user
        ? (async () => {
            try {
              await Promise.all([
                prisma.user.update({
                  where: { id: user.id },
                  data: {
                    lastLogin: loginTime,
                    failedLoginAttempts: 0,
                    lockedUntil: null,
                  },
                }),
                tokenPayload.providerId
                  ? basePrisma.provider.update({
                      where: { id: tokenPayload.providerId },
                      data: { lastLogin: loginTime },
                    })
                  : Promise.resolve(),
                prisma.userAuditLog.create({
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
                      deviceFingerprint: deviceFingerprint || undefined,
                    },
                  },
                }),
                prisma.loginAudit.create({
                  data: createLoginAuditData(email, 'SUCCESS', {
                    ipAddress: clientIp,
                    userAgent: req.headers.get('user-agent') || undefined,
                    clinicId: activeClinicId ?? undefined,
                    deviceFingerprint: deviceFingerprint || undefined,
                    requestId,
                    userId: user.id,
                  }),
                }),
                prisma.userSession.create({
                  data: {
                    userId: user.id,
                    token: token.substring(0, 64),
                    refreshToken: refreshToken.substring(0, 64),
                    refreshTokenHash: hashRefreshToken(refreshToken),
                    ipAddress:
                      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
                    userAgent: req.headers.get('user-agent') || 'unknown',
                    deviceFingerprint: deviceFingerprint || undefined,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    lastActivity: loginTime,
                  },
                }),
              ]);
            } catch (err: unknown) {
              logger.warn('Post-auth writes failed (login succeeded)', {
                userId: user.id,
                error: err instanceof Error ? err.message : 'Unknown error',
              });
            }
          })()
        : Promise.resolve();

    const [providerClinics] = await Promise.all([
      providerClinicsPromise,
      postAuthWritesPromise,
    ]);

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

    // Share auth across *.eonpro.io so one login works on wellmedr, ot, eonmeds, app
    const host = getRequestHostWithUrlFallback(req);
    const cookieDomain = shouldUseEonproCookieDomain(host) ? '.eonpro.io' : undefined;

    if (cookieDomain) {
      // Clear existing auth cookies for this domain so new ones are used (must use same domain to clear)
      const authCookieNames = [
        'auth-token',
        'admin-token',
        'provider-token',
        'patient-token',
        'influencer-token',
        'super_admin-token',
        'staff-token',
        'support-token',
        'selected-clinic',
      ];
      for (const name of authCookieNames) {
        response.cookies.set({
          name,
          value: '',
          path: '/',
          maxAge: 0,
          expires: new Date(0),
          domain: cookieDomain,
        });
      }
    }

    response.cookies.set({
      name: `${userRole}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
      ...(cookieDomain && { domain: cookieDomain }),
    });

    response.cookies.set({
      name: 'auth-token',
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
      ...(cookieDomain && { domain: cookieDomain }),
    });

    // Set selected-clinic so middleware and client stay in sync with JWT clinic (critical for ot.eonpro.io and other clinic subdomains)
    if (activeClinicId != null) {
      response.cookies.set({
        name: 'selected-clinic',
        value: String(activeClinicId),
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: false, // Allow client to read for clinic switcher UI
        ...(cookieDomain && { domain: cookieDomain }),
      });
    }

    return response;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    const prismaError = (error as { code?: string })?.code;
    const duration = Date.now() - startTime;
    // P2024 = pool exhausted; P1002 = connection timeout; message check for pool/connection errors
    const isPoolExhausted =
      prismaError === 'P2024' ||
      prismaError === 'P1002' ||
      (typeof errorMessage === 'string' &&
        (errorMessage.toLowerCase().includes('connection pool') ||
          errorMessage.toLowerCase().includes('timed out fetching') ||
          errorMessage.toLowerCase().includes('connection refused')));

    logger.error('Login error', error instanceof Error ? error : new Error(errorMessage), {
      step: debugInfo?.step,
      prismaCode: prismaError,
      duration,
    });

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

    // P2024 = connection pool exhausted: return 503 so client can show "try again" and respect Retry-After
    if (isPoolExhausted) {
      return NextResponse.json(
        {
          error: 'Service is busy. Please try again in a moment.',
          code: 'SERVICE_UNAVAILABLE',
          retryAfter: 15,
        },
        {
          status: 503,
          headers: { 'Retry-After': '15' },
        }
      );
    }

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

// Export with global error wrapper - rate limiting handled inside
export const POST = withApiHandler(loginHandler);

/**
 * OPTIONS /api/auth/login
 * CORS preflight - allows browser to send POST from subdomains (e.g. wellmedr.eonpro.io).
 * Without this, some clients may get 405 Method Not Allowed on the preflight.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}
