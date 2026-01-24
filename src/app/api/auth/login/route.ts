/**
 * Login endpoint with rate limiting
 * Example of combining security features
 */

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { prisma } from '@/lib/db';
import { JWT_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { strictRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';
import { Patient, Provider, Order } from '@/types/models';

/**
 * POST /api/auth/login
 * Login endpoint with strict rate limiting
 * Supports multi-clinic users - returns clinics array for selection
 */
async function loginHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, role = 'patient', clinicId: selectedClinicId } = body;

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
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

    let passwordHash: string | null = null;

    if (user) {
      // User exists in unified system
      passwordHash = user.passwordHash;
    } else {
      // Fallback to legacy tables for backward compatibility
      switch (role) {
        case 'provider':
          const provider: any = await // @ts-ignore
    prisma.provider.findFirst({
            where: { email: email.toLowerCase() },
          });
          if (provider) {
            user = {
              id: provider.id,
              email: provider.email || '',
              firstName: provider.firstName,
              lastName: provider.lastName,
              role: "provider",
              status: 'ACTIVE',
            } as any;
            passwordHash = provider.passwordHash;
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
    // @ts-ignore - emailVerified is a new field
    if (user.role === 'PATIENT' && user.emailVerified === false) {
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
      role: string;
      isPrimary: boolean;
    }> = [];
    
    // Primary clinic from user record
    if (user.clinicId) {
      const primaryClinic = await prisma.clinic.findUnique({
        where: { id: user.clinicId },
        select: { id: true, name: true, subdomain: true, logoUrl: true },
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
            select: { id: true, name: true, subdomain: true, logoUrl: true },
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
    } catch {
      // UserClinic might not exist, continue with primary clinic
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
    const tokenPayload: any = {
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
    if (user && 'lastLogin' in user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { 
          lastLogin: new Date(),
          failedLoginAttempts: 0,
        },
      });
      
      // Create audit log
      await prisma.userAuditLog.create({ data: {
          userId: user.id,
          action: 'LOGIN',
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
          userAgent: req.headers.get('user-agent'),
        },
      }).catch((error: Error) => {
        logger.warn('Failed to create audit log:', error);
      });
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
        permissions: 'permissions' in user ? user.permissions : undefined,
        features: 'features' in user ? user.features : undefined,
      },
      clinics,
      activeClinicId,
      hasMultipleClinics: clinics.length > 1,
      // If multi-clinic and no clinic selected, client should show selection UI
      requiresClinicSelection: clinics.length > 1 && !selectedClinicId,
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
    
    // Log detailed error for debugging
    console.error('[LOGIN_ERROR]', {
      message: errorMessage,
      stack: errorStack,
      type: error?.constructor?.name,
      prismaCode: prismaError,
    });
    
    logger.error('Login error:', error instanceof Error ? error : new Error(errorMessage));
    
    // Return error details (safe to show in production for debugging login issues)
    return NextResponse.json(
      { 
        error: 'An error occurred during login',
        details: errorMessage,
        code: prismaError || 'UNKNOWN',
      },
      { status: 500 }
    );
  }
}

// Apply rate limiting to the handler
export const POST = strictRateLimit(loginHandler);
