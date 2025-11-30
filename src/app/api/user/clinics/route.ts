// API route for user's clinic management
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// GET /api/user/clinics - Get all clinics the user belongs to
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    // Get user's clinic assignments
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

    // Also get the user's primary clinic if they have one
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        clinicId: true,
        activeClinicId: true,
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

    // Combine clinics from both sources (legacy clinicId and new userClinics)
    const clinicsMap = new Map();
    
    // Add from userClinics
    for (const uc of userClinics) {
      clinicsMap.set(uc.clinic.id, {
        ...uc.clinic,
        role: uc.role,
        isPrimary: uc.isPrimary,
      });
    }
    
    // Add legacy clinic if not already included
    if (userData?.clinic && !clinicsMap.has(userData.clinic.id)) {
      clinicsMap.set(userData.clinic.id, {
        ...userData.clinic,
        role: user.role,
        isPrimary: true,
      });
    }

    const clinics = Array.from(clinicsMap.values());
    const activeClinicId = userData?.activeClinicId || userData?.clinicId || clinics[0]?.id;

    return NextResponse.json({
      clinics,
      activeClinicId,
      hasMultipleClinics: clinics.length > 1,
    });
  } catch (error: any) {
    console.error('Error fetching user clinics:', error);
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

