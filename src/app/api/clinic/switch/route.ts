import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';

import { cookies } from 'next/headers';
import { prisma } from '@/lib/db';

/**
 * POST /api/clinic/switch
 * Switch to a different clinic
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinicId } = body;
    
    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }
    
    // Verify clinic exists and is active
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
      }
    });
    
    if (!clinic) {
      return NextResponse.json(
        { error: 'Clinic not found' },
        { status: 404 }
      );
    }
    
    if (!['ACTIVE', 'TRIAL'].includes(clinic.status)) {
      return NextResponse.json(
        { error: 'Clinic is not active' },
        { status: 403 }
      );
    }
    
    // TODO: Verify user has access to this clinic
    // For now, allow switching to any active clinic
    
    // Set cookie for selected clinic
    const cookieStore = await cookies();
    cookieStore.set('selected-clinic', clinicId.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });
    
    // Return the clinic data
    return NextResponse.json({
      ...clinic,
      requiresReload: false, // Set to true if you want to force a page reload
    });
  } catch (error) {
    logger.error('Error switching clinic:', error);
    return NextResponse.json(
      { error: 'Failed to switch clinic' },
      { status: 500 }
    );
  }
}
