import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { cookies } from 'next/headers';
import { prisma, basePrisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { z } from 'zod';

const switchClinicSchema = z.object({
  clinicId: z.number().positive('Clinic ID must be a positive number'),
});

/**
 * POST /api/clinic/switch
 * Switch to a different clinic
 * Requires authentication and verifies user has access to the target clinic
 */
async function handler(request: NextRequest, user: AuthUser) {
  try {
    const body = await request.json();
    
    // Validate input
    const parseResult = switchClinicSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parseResult.error.flatten() },
        { status: 400 }
      );
    }
    
    const { clinicId } = parseResult.data;
    
    // Verify user has access to this clinic (unless super_admin)
    if (user.role !== 'super_admin') {
      const userClinic = await basePrisma.userClinic.findFirst({
        where: {
          userId: user.id,
          clinicId: clinicId,
          isActive: true,
        },
      });
      
      if (!userClinic) {
        logger.security('Unauthorized clinic switch attempt', {
          userId: user.id,
          targetClinicId: clinicId,
          userClinicId: user.clinicId,
        });
        return NextResponse.json(
          { error: 'Access denied. You do not have access to this clinic.' },
          { status: 403 }
        );
      }
    }
    
    // Verify clinic exists and is active
    const clinic = await basePrisma.clinic.findUnique({
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
    
    // Set cookie for selected clinic
    const cookieStore = await cookies();
    cookieStore.set('selected-clinic', clinicId.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });
    
    logger.info('Clinic switched successfully', {
      userId: user.id,
      clinicId: clinic.id,
      clinicName: clinic.name,
    });
    
    // Return the clinic data
    return NextResponse.json({
      ...clinic,
      requiresReload: false,
    });
  } catch (error) {
    logger.error('Error switching clinic:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to switch clinic' },
      { status: 500 }
    );
  }
}

export const POST = withAuth(handler);
