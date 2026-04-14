/**
 * Switch Clinic API
 * Issues a new JWT with updated clinicId for multi-clinic users
 */

import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { JWT_SECRET, JWT_REFRESH_SECRET, AUTH_CONFIG } from '@/lib/auth/config';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { createSessionRecord } from '@/lib/auth/session-manager';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

/**
 * POST /api/auth/switch-clinic
 * Switch to a different clinic and get a new JWT
 */
async function switchClinicHandler(req: NextRequest, user: AuthUser) {
  return withoutClinicFilter(async () => {
    try {
      const body = await req.json();
      const { clinicId } = body;

      if (!clinicId) {
        return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
      }

      // Super admins can switch to any clinic
      if (user.role === 'super_admin') {
        // Verify clinic exists
        const clinic = await prisma.clinic.findUnique({
          where: { id: clinicId },
          select: { id: true, name: true, subdomain: true, status: true },
        });

        if (!clinic) {
          return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
        }

        // Issue new token without clinicId (super admin can access all)
        return await issueNewToken(req, user, undefined, [clinic]);
      }

      // For other users, verify they have access to this clinic
      // First check user's primary clinic
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: { clinicId: true },
      });

      let hasAccess = userData?.clinicId === clinicId;

      // Check UserClinic table for additional clinic access
      if (!hasAccess) {
        const userClinic = await prisma.userClinic.findFirst({
          where: {
            userId: user.id,
            clinicId: clinicId,
            isActive: true,
          },
        });
        hasAccess = !!userClinic;
      }

      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You do not have access to this clinic' },
          { status: 403 }
        );
      }

      // Get clinic details
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true, subdomain: true, logoUrl: true, status: true },
      });

      if (!clinic || !['ACTIVE', 'TRIAL'].includes(clinic.status || '')) {
        return NextResponse.json({ error: 'Clinic is not active' }, { status: 403 });
      }

      // Get all user's clinics for the response
      const userClinics = await getUserClinics(user.id, userData?.clinicId);

      // Issue new token with the new clinicId
      return await issueNewToken(req, user, clinicId, userClinics);
    } catch (error: unknown) {
      logger.error('Error switching clinic:', error);
      return NextResponse.json({ error: 'Failed to switch clinic' }, { status: 500 });
    }
  }); // end withoutClinicFilter
}

async function getUserClinics(userId: number, primaryClinicId?: number | null) {
  return withoutClinicFilter(async () => {
    const clinics: Array<{
      id: number;
      name: string;
      subdomain: string | null;
      logoUrl: string | null;
      role: string;
      isPrimary: boolean;
    }> = [];

    // Get primary clinic
    if (primaryClinicId) {
      const primaryClinic = await prisma.clinic.findUnique({
        where: { id: primaryClinicId },
        select: { id: true, name: true, subdomain: true, logoUrl: true },
      });
      if (primaryClinic) {
        clinics.push({
          ...primaryClinic,
          role: 'primary',
          isPrimary: true,
        });
      }
    }

    // Get additional clinics from UserClinic
    try {
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId,
          isActive: true,
        },
        include: {
          clinic: {
            select: { id: true, name: true, subdomain: true, logoUrl: true },
          },
        },
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
      // UserClinic might not exist
      logger.warn('[Switch Clinic] UserClinic lookup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
    }

    return clinics;
  }); // end withoutClinicFilter
}

async function issueNewToken(
  req: NextRequest,
  user: AuthUser,
  clinicId: number | undefined,
  clinics: any[]
) {
  return withoutClinicFilter(async () => {
    const tokenPayload: Record<string, unknown> = {
      id: user.id,
      email: user.email,
      name: user.email,
      role: user.role,
      clinicId: clinicId,
    };

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        firstName: true,
        lastName: true,
        providerId: true,
        provider: { select: { id: true } },
      },
    });
    if (userData) {
      tokenPayload.name =
        `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || user.email;

      const providerId = user.providerId || userData.providerId || userData.provider?.id;
      if (providerId) {
        tokenPayload.providerId = providerId;
      }
    } else if (user.providerId) {
      tokenPayload.providerId = user.providerId;
    }

    // Create a session record so the auth middleware can validate this token
    const { sessionId } = await createSessionRecord(String(user.id), user.role, clinicId, req);
    tokenPayload.sessionId = sessionId;

    const tokenExpiry =
      user.role === 'patient'
        ? AUTH_CONFIG.tokenExpiry.patient
        : user.role === 'provider'
          ? AUTH_CONFIG.tokenExpiry.provider
          : AUTH_CONFIG.tokenExpiry.access;

    const token = await new SignJWT(tokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(tokenExpiry)
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

    // Get the active clinic details
    const activeClinic = clinics.find((c) => c.id === clinicId) || clinics[0];

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

    // Build response
    const response = NextResponse.json({
      success: true,
      token,
      refreshToken,
      activeClinicId: clinicId,
      activeClinic,
      clinics,
      providerClinics,
      hasMultipleProviderClinics: providerClinics.length > 1,
      user: {
        id: user.id,
        email: user.email,
        name: tokenPayload.name,
        role: user.role,
        clinicId,
        providerId: tokenPayload.providerId,
      },
    });

    // Update cookies
    response.cookies.set({
      name: 'auth-token',
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    response.cookies.set({
      name: `${user.role}-token`,
      value: token,
      ...AUTH_CONFIG.cookie,
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  }); // end withoutClinicFilter
}

export const POST = standardRateLimit(withAuth(switchClinicHandler));
