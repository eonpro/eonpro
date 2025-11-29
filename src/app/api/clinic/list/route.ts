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
            providers: true,
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    
    // Transform the data
    const transformedClinics = clinics.map(clinic => ({
      id: clinic.id,
      name: clinic.name,
      subdomain: clinic.subdomain,
      logoUrl: clinic.logoUrl,
      status: clinic.status,
      billingPlan: clinic.billingPlan,
      patientCount: clinic._count.patients,
      providerCount: clinic._count.providers,
    }));
    
    return NextResponse.json(transformedClinics);
  } catch (error) {
    logger.error('Error fetching clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
}
