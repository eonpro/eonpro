import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';

import { prisma } from '@/lib/db';
import { getClinicIdFromRequest } from '@/lib/clinic/utils';

/**
 * GET /api/clinic/current
 * Get the current clinic context
 */
export async function GET(request: NextRequest) {
  try {
    const clinicId = await getClinicIdFromRequest(request);
    
    if (!clinicId) {
      return NextResponse.json(
        { error: 'No clinic context available' },
        { status: 404 }
      );
    }
    
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        status: true,
        logoUrl: true,
        faviconUrl: true,
        primaryColor: true,
        secondaryColor: true,
        settings: true,
        features: true,
        billingPlan: true,
        timezone: true,
        _count: {
          select: {
            patients: true,
            providers: true,
            users: true,
          }
        }
      }
    });
    
    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }
    
    if (clinic.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: 'Clinic is not active' },
        { status: 403 }
      );
    }
    
    return NextResponse.json(clinic);
  } catch (error) {
    logger.error('Error fetching current clinic:', error);
    return NextResponse.json(
      { error: 'Failed to fetch clinic information' },
      { status: 500 }
    );
  }
}
