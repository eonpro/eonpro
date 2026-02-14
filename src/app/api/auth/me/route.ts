/**
 * Auth Me Route
 * =============
 *
 * GET /api/auth/me
 * Returns the current authenticated user's profile information.
 *
 * Used by frontend components to get user details and role.
 *
 * @module api/auth/me
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { basePrisma as prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Fetch additional user details from database
      const userData = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          clinicId: true,
          activeClinicId: true,
          phone: true,
          providerId: true,
          patientId: true,
          status: true,
          emailVerified: true,
          twoFactorEnabled: true,
          lastLogin: true,
          createdAt: true,
          avatarUrl: true, // Profile picture URL
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
            },
          },
          provider: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              npi: true,
              titleLine: true,
            },
          },
        },
      });

      if (!userData) {
        // User might be from legacy provider table or token-only auth
        return NextResponse.json({
          user: {
            id: user.id,
            email: user.email,
            role: user.role,
            clinicId: user.clinicId,
            providerId: user.providerId,
          },
        });
      }

      // Get list of clinics user has access to (for multi-clinic users)
      let clinics: any[] = [];
      try {
        const userClinics = await prisma.userClinic.findMany({
          where: { userId: user.id, isActive: true },
          include: {
            clinic: {
              select: {
                id: true,
                name: true,
                subdomain: true,
              },
            },
          },
        });
        clinics = userClinics.map((uc) => ({
          ...uc.clinic,
          role: uc.role,
          isPrimary: uc.isPrimary,
        }));

        // Add primary clinic if not in list
        if (userData.clinic && !clinics.find((c) => c.id === userData.clinic?.id)) {
          clinics.unshift({
            ...userData.clinic,
            role: userData.role,
            isPrimary: true,
          });
        }
      } catch (error: unknown) {
        // UserClinic table might not have entries
        logger.warn('[Auth/Me] UserClinic lookup failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          userId: user.id,
        });
        if (userData.clinic) {
          clinics = [
            {
              ...userData.clinic,
              role: userData.role,
              isPrimary: true,
            },
          ];
        }
      }

      return NextResponse.json({
        user: {
          id: userData.id,
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          name: `${userData.firstName} ${userData.lastName}`.trim(),
          role: userData.role?.toLowerCase(),
          clinicId: userData.activeClinicId || userData.clinicId,
          primaryClinicId: userData.clinicId,
          phone: userData.phone,
          providerId: userData.providerId,
          patientId: userData.patientId,
          affiliateId: userData.affiliateId,
          avatarUrl: userData.avatarUrl,
          status: userData.status,
          emailVerified: userData.emailVerified,
          twoFactorEnabled: userData.twoFactorEnabled,
          lastLogin: userData.lastLogin,
          createdAt: userData.createdAt,
          clinic: userData.clinic,
          provider: userData.provider,
          clinics,
        },
      });
    } catch (error) {
      logger.error('[Auth/Me] Error fetching user', { error, userId: user.id });

      // Return basic info from token if database lookup fails
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          clinicId: user.clinicId,
          providerId: user.providerId,
        },
      });
    }
  },
  // All authenticated users can access their own profile
  {
    roles: [
      'super_admin',
      'admin',
      'provider',
      'affiliate',
      'patient',
      'staff',
      'support',
      'sales_rep',
    ],
  }
);
