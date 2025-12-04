import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';

import { prisma } from '@/lib/db';

/**
 * GET /api/clinic/list
 * Get list of clinics the current user has access to
 */
export async function GET(request: NextRequest) {
  try {
    // TODO: Add user authentication and filter clinics based on user access
    // For now, return all active clinics
    
    const clinics = await prisma.clinic.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] }
      },
      select: {
        id: true,
        name: true,
        subdomain: true,
        logoUrl: true,
        status: true,
        billingPlan: true,
        _count: {
          select: {
            patients: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    // Count providers per clinic from both User table (role PROVIDER) and Provider table
    const transformedClinics = await Promise.all(
      clinics.map(async (clinic) => {
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
          status: clinic.status,
          billingPlan: clinic.billingPlan,
          patientCount: clinic._count.patients,
          providerCount: providerCount,
        };
      })
    );
    
    return NextResponse.json(transformedClinics);
  } catch (error) {
    logger.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
}
