/**
 * Login endpoint with rate limiting
 * Example of combining security features
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

// Zod schema for login request validation
const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['patient', 'provider', 'admin', 'super_admin', 'influencer', 'staff', 'support']).default('patient'),
  clinicId: z.number().nullable().optional(), // Accept null, undefined, or number
});

/**
 * POST /api/auth/login
 * Login endpoint with strict rate limiting
 * Supports multi-clinic users - returns clinics array for selection
 */
async function loginHandler(req: NextRequest) {
  const startTime = Date.now();
  let debugInfo: Record<string, unknown> = { step: 'start' };

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

    const { email, password, role, clinicId: selectedClinicId } = validationResult.data;

    // Debug info only in development
    if (process.env.NODE_ENV === 'development') {
      debugInfo = { step: 'parsed_body', email, role, hasPassword: !!password };
      logger.debug('[Login] Starting login', debugInfo);
    }

    // Find user from unified User table first
    let user = await prisma.user.findUnique({
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
          // Legacy provider lookup - provider table may have different schema
          const provider = await prisma.provider.findFirst({
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
              firstName: providerData.firstName || providerData.name?.split(' ')[0] || '',
              lastName: providerData.lastName || providerData.name?.split(' ').slice(1).join(' ') || '',
              role: "provider",
              status: 'ACTIVE',
              providerId: providerData.id,
              clinicId: providerData.clinicId,
            } as typeof user;
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
              role: "influencer",
              status: 'ACTIVE',
            } as any;
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
              user = patientUser;
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
              role: { in: ['ADMIN', 'SUPER_ADMIN'] }
            },
            include: {
              provider: true,
            },
          });
          if (adminUser) {
            user = adminUser;
            passwordHash = adminUser.passwordHash;
          }
          break;

        case 'staff':
        case 'support':
          // Staff and support users
          const staffUser = await prisma.user.findFirst({
            where: {
              email: email.toLowerCase(),
              role: { in: ['STAFF', 'SUPPORT'] }
            },
          });
          if (staffUser) {
            user = staffUser;
            passwordHash = staffUser.passwordHash;
          }
          break;

        default:
          // For any unrecognized role, try to find user by email only
          // This provides fallback compatibility
          break;
      }
    }

    // Check if user exists
    if (!user) {
      // Log failed attempt
      logger.warn(`Failed login attempt for ${email} (${role})`);
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password (if passwordHash exists)
    if (passwordHash) {
      const isValid = await bcrypt.compare(password, passwordHash);
      if (!isValid) {
        logger.warn(`Invalid password for ${email} (${role})`);
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }
    }

    // Check if email is verified for patients
    const userWithEmail = user as typeof user & { emailVerified?: boolean };
    if (user.role === 'PATIENT' && userWithEmail.emailVerified === false) {
      logger.warn(`Unverified email login attempt for ${email}`);
      return NextResponse.json(
        {
          error: 'Please verify your email before logging in.',
          code: 'EMAIL_NOT_VERIFIED',
          email: user.email,
        },
        { status: 403 }
      );
    }

    // Normalize role to lowercase for consistency
    const userRole = (user.role || role).toLowerCase();

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
        select: { id: true, name: true, subdomain: true, logoUrl: true, iconUrl: true, faviconUrl: true },
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
            select: { id: true, name: true, subdomain: true, logoUrl: true, iconUrl: true, faviconUrl: true },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

      for (const uc of userClinics) {
        if (!clinics.find(c => c.id === uc.clinic.id)) {
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
        userId: user.id
      });
    }

    // Determine active clinic - use selected, primary, or first available
    let activeClinicId: number | undefined = undefined;
    if (userRole !== 'super_admin') {
      if (selectedClinicId && clinics.find(c => c.id === selectedClinicId)) {
        activeClinicId = selectedClinicId;
      } else {
        activeClinicId = user.clinicId || clinics[0]?.id;
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
      tokenPayload.providerId = user.providerId;
    } else if ('provider' in user && user.provider) {
      tokenPayload.providerId = user.provider.id;
    } else if (userRole === 'provider') {
      // FALLBACK: Look up provider by email if not already linked
      // This handles cases where the User record exists but providerId wasn't set
      try {
        const providerByEmail = await prisma.provider.findFirst({
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
          email: user.email
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
          email: user.email
        });
      }
    }

    // Add permissions and features if available
    if ('permissions' in user && user.permissions) {
      tokenPayload.permissions = user.permissions;
    }
    if ('features' in user && user.features) {
      tokenPayload.features = user.features;
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

    // Update last login if it's a User model
    const loginTime = new Date();
    if (user && 'lastLogin' in user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: loginTime,
          failedLoginAttempts: 0,
        },
      });

      // Also update Provider.lastLogin if user has a linked provider
      if (tokenPayload.providerId) {
        await prisma.provider.update({
          where: { id: tokenPayload.providerId },
          data: { lastLogin: loginTime },
        }).catch((error: Error) => {
          logger.warn('Failed to update provider lastLogin:', error);
        });
      }

      // Create audit log with session details
      await prisma.userAuditLog.create({ data: {
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
      }).catch((error: Error) => {
        logger.warn('Failed to create audit log:', error);
      });

      // Create/update user session for online tracking
      try {
        await prisma.userSession.create({
          data: {
            userId: user.id,
            token: token.substring(0, 64), // Store truncated token for lookup
            refreshToken: refreshToken.substring(0, 64),
            ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
            userAgent: req.headers.get('user-agent') || 'unknown',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            lastActivity: loginTime,
          },
        });
      } catch (sessionError) {
        logger.warn('Failed to create user session:', { error: sessionError instanceof Error ? sessionError.message : 'Unknown error' });
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

// Apply rate limiting to the handler
export const POST = strictRateLimit(loginHandler);
