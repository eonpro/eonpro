// API route for managing user's clinic assignments (Super Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// GET /api/super-admin/users/[userId]/clinics - Get all clinics a user belongs to
async function handleGet(
  req: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam);

  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const userClinics = await prisma.userClinic.findMany({
      where: { userId },
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

    // Also get legacy clinic assignment
    const userData = await prisma.user.findUnique({
      where: { id: userId },
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

    return NextResponse.json({
      userClinics,
      legacyClinic: userData?.clinic,
    });
  } catch (error: any) {
    console.error('Error fetching user clinics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user clinics' },
      { status: 500 }
    );
  }
}

// POST /api/super-admin/users/[userId]/clinics - Add user to a clinic
async function handlePost(
  req: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam);

  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { clinicId, role, isPrimary } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if clinic exists
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
    });

    if (!clinic) {
      return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
    }

    // Check if assignment already exists
    const existingAssignment = await prisma.userClinic.findUnique({
      where: {
        userId_clinicId: { userId, clinicId },
      },
    });

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'User is already assigned to this clinic' },
        { status: 400 }
      );
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      await prisma.userClinic.updateMany({
        where: { userId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    // Create the assignment
    const userClinic = await prisma.userClinic.create({
      data: {
        userId,
        clinicId,
        role: role || targetUser.role,
        isPrimary: isPrimary || false,
        isActive: true,
      },
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

    return NextResponse.json({
      userClinic,
      message: `User added to ${clinic.name}`,
    });
  } catch (error: any) {
    console.error('Error adding user to clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to add user to clinic' },
      { status: 500 }
    );
  }
}

// DELETE /api/super-admin/users/[userId]/clinics - Remove user from a clinic
async function handleDelete(
  req: NextRequest,
  user: AuthUser,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId: userIdParam } = await params;
  const userId = parseInt(userIdParam);

  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const clinicId = parseInt(searchParams.get('clinicId') || '');

    if (isNaN(clinicId)) {
      return NextResponse.json({ error: 'Clinic ID is required' }, { status: 400 });
    }

    // Check if assignment exists
    const assignment = await prisma.userClinic.findUnique({
      where: {
        userId_clinicId: { userId, clinicId },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: 'User is not assigned to this clinic' },
        { status: 404 }
      );
    }

    // Delete the assignment
    await prisma.userClinic.delete({
      where: {
        userId_clinicId: { userId, clinicId },
      },
    });

    return NextResponse.json({
      success: true,
      message: 'User removed from clinic',
    });
  } catch (error: any) {
    console.error('Error removing user from clinic:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove user from clinic' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handleGet);
export const POST = withAuth(handlePost);
export const DELETE = withAuth(handleDelete);

