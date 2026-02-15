import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

/**
 * GET /api/clinic/list
 * Get list of clinics the current user has access to
 *
 * Access Control:
 * - super_admin: All active clinics
 * - admin/provider: Only their assigned clinic
 */
export const GET = withAuth(
  async (request: NextRequest, user: AuthUser) => {
    try {
      // Build where clause based on user role
      const isSuperAdmin = user.role === 'super_admin';

      // Super admin sees all clinics, others only see their assigned clinic
      const whereClause: Prisma.ClinicWhereInput = isSuperAdmin
        ? { status: { in: ['ACTIVE', 'TRIAL'] } }
        : {
            id: user.clinicId!,
            status: { in: ['ACTIVE', 'TRIAL'] },
          };

      // Non-super-admin must have a clinic assignment
      if (!isSuperAdmin && !user.clinicId) {
        logger.warn('User without clinic attempted to list clinics', {
          userId: user.id,
          role: user.role,
        });
        return NextResponse.json({ error: 'No clinic assigned' }, { status: 403 });
      }

      const clinics = await prisma.clinic.findMany({
        where: whereClause,
        take: 100,
        select: {
          id: true,
          name: true,
          subdomain: true,
          logoUrl: true,
          iconUrl: true,
          faviconUrl: true,
          status: true,
          billingPlan: true,
          _count: {
            select: {
              patients: true,
            },
          },
        },
        orderBy: {
          name: 'asc',
        },
      });

      // Count providers per clinic from both User table (role PROVIDER) and Provider table
      type ClinicEntry = (typeof clinics)[number];
      const transformedClinics = await Promise.all(
        clinics.map(async (clinic: ClinicEntry) => {
          const [userProviderCount, providerTableCount] = await Promise.all([
            prisma.user.count({
              where: {
                clinicId: clinic.id,
                role: 'PROVIDER',
              },
            }),
            prisma.provider.count({
              where: {
                clinicId: clinic.id,
              },
            }),
          ]);
          // Use the higher count (some providers may be in both tables)
          const providerCount = Math.max(userProviderCount, providerTableCount);
          return {
            id: clinic.id,
            name: clinic.name,
            subdomain: clinic.subdomain,
            logoUrl: clinic.logoUrl,
            iconUrl: clinic.iconUrl,
            faviconUrl: clinic.faviconUrl,
            status: clinic.status,
            billingPlan: clinic.billingPlan,
            patientCount: (clinic as any)._count?.patients ?? 0,
            providerCount: providerCount,
          };
        })
      );

      logger.info('Clinic list retrieved', {
        userId: user.id,
        role: user.role,
        clinicCount: transformedClinics.length,
      });

      return NextResponse.json(transformedClinics);
    } catch (error) {
      logger.error('Error fetching clinics:', error);
      return NextResponse.json({ error: 'Failed to fetch clinics' }, { status: 500 });
    }
  },
  { roles: ['admin', 'super_admin', 'provider'] }
);
