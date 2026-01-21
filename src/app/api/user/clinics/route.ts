// API route for user's clinic management
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// GET /api/user/clinics - Get all clinics the user belongs to
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Get the user's primary clinic directly (simpler, more reliable approach)
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        clinicId: true,
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
            customDomain: true,
            logoUrl: true,
            primaryColor: true,
            status: true,
          },
        },
      },
    });

    // Build clinics array from user's clinic
    const clinics: Array<{ id: number; name: string; subdomain: string | null; customDomain: string | null; logoUrl: string | null; primaryColor: string | null; status: string | null; role: string; isPrimary: boolean }> = [];
    if (userData?.clinic) {
      clinics.push({
        ...userData.clinic,
        role: user.role,
        isPrimary: true,
      });
    }

    // Try to get additional clinics from userClinic table if it exists
    try {
      const userClinics = await prisma.userClinic.findMany({
        where: {
          userId: user.id,
          isActive: true,
        },
        include: {
          clinic: {
            select: {
              id: true,
              name: true,
              subdomain: true,
              customDomain: true,
              logoUrl: true,
              primaryColor: true,
              status: true,
            },
          },
        },
        orderBy: [
          { isPrimary: 'desc' },
          { createdAt: 'asc' },
        ],
      });

      // Add any additional clinics not already included
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
      // UserClinic table might not exist, that's ok
    }

    const activeClinicId = userData?.clinicId || clinics[0]?.id;

    return NextResponse.json({
      clinics,
      activeClinicId,
      hasMultipleClinics: clinics.length > 1,
    });
  } catch (error: any) {
    logger.error('Error fetching user clinics', { error: error.message, userId: user.id });
    return NextResponse.json(
      { error: 'Failed to fetch clinics' },
      { status: 500 }
    );
  }
}

// PUT /api/user/clinics - Switch active clinic
async function handlePut(req: NextRequest, user: AuthUser) {
  try {
    const body = await req.json();
    const { clinicId } = body;

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this clinic
    const hasAccess = await prisma.userClinic.findFirst({
      where: {
        userId: user.id,
        clinicId: clinicId,
        isActive: true,
      },
    });

    // Also check legacy clinicId
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clinicId: true },
    });

    if (!hasAccess && userData?.clinicId !== clinicId) {
      return NextResponse.json(
        { error: 'You do not have access to this clinic' },
        { status: 403 }
      );
    }

    // Update user's active clinic
    await prisma.user.update({
      where: { id: user.id },
      data: { activeClinicId: clinicId },
    });

    // Get the clinic details
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        subdomain: true,
        customDomain: true,
        logoUrl: true,
        primaryColor: true,
        status: true,
      },
    });

    return NextResponse.json({
      success: true,
      activeClinic: clinic,
      message: `Switched to ${clinic?.name}`,
    });
  } catch (error: any) {
    console.error('Error switching clinic:', error);
    return NextResponse.json(
      { error: 'Failed to switch clinic' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGet);
export const PUT = withAuth(handlePut);

