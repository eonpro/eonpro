import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../../../../lib/logger';
import { basePrisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

/**
 * GET /api/clinic/current
 * Get the current clinic context for the authenticated user
 *
 * Requires authentication - returns clinic info for the user's current clinic
 */
async function handler(request: NextRequest, user: AuthUser) {
  try {
    // Use the user's clinicId from their JWT token
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'No clinic context available' }, { status: 404 });
    }

    // Use basePrisma since we're explicitly selecting the clinic
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
        // Only include counts for admin+ roles
        ...(user.role === 'super_admin' || user.role === 'admin'
          ? {
              _count: {
                select: {
                  patients: true,
                  providers: true,
                  users: true,
                },
              },
            }
          : {}),
      },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Allow TRIAL status clinics too
    if (!['ACTIVE', 'TRIAL'].includes(clinic.status)) {
      return NextResponse.json({ error: 'Clinic is not active' }, { status: 403 });
    }

    return NextResponse.json(clinic);
  } catch (error) {
    logger.error('Error fetching current clinic:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId: user.id,
    });
    return NextResponse.json({ error: 'Failed to fetch clinic information' }, { status: 500 });
  }
}

export const GET = withAuth(handler);
