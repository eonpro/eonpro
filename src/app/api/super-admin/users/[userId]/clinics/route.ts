// API route for managing user's clinic assignments (Super Admin only)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

// Helper to extract userId from URL path
function extractUserId(req: NextRequest): number | null {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  // Path is /api/super-admin/users/[userId]/clinics
  const userIdIndex = pathParts.findIndex(part => part === 'users') + 1;
  if (userIdIndex > 0 && userIdIndex < pathParts.length) {
    const userId = parseInt(pathParts[userIdIndex]);
    return isNaN(userId) ? null : userId;
  }
  return null;
}

// GET /api/super-admin/users/[userId]/clinics - Get all clinics a user belongs to
async function handleGet(req: NextRequest, user: AuthUser) {
  const userId = extractUserId(req);

  if (!userId) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'super_admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    // First, get the user's basic info
    const userData = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
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

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Try to get UserClinic records (may not exist if table not migrated)
    let userClinics: any[] = [];
    try {
      if (prisma.userClinic) {
        userClinics = await prisma.userClinic.findMany({
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
      }
    } catch (ucError) {
      console.warn('UserClinic table may not exist:', ucError);
      // Fall back to legacy clinic assignment
    }

    return NextResponse.json({
      user: {
        id: userData.id,
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        role: userData.role,
      },
      userClinics,
      legacyClinic: userData.clinic,
    });
  } catch (error: any) {
    console.error('Error fetching user clinics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch user clinics' },
      { status: 500 }
    );
  }
}

// POST /api/super-admin/users/[userId]/clinics - Add user to a clinic
async function handlePost(req: NextRequest, user: AuthUser) {
  const userId = extractUserId(req);

  if (!userId) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'super_admin') {
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

    // Check if UserClinic table exists
    if (!prisma.userClinic) {
      // Fallback: just update the user's clinicId
      await prisma.user.update({
        where: { id: userId },
        data: { clinicId },
      });
      
      return NextResponse.json({
        message: `User assigned to ${clinic.name}`,
        userClinic: null,
      });
    }

    // Check if assignment already exists
    let existingAssignment = null;
    try {
      existingAssignment = await prisma.userClinic.findUnique({
        where: {
          userId_clinicId: { userId, clinicId },
        },
      });
    } catch (e) {
      // Table might not exist, continue
    }

    if (existingAssignment) {
      return NextResponse.json(
        { error: 'User is already assigned to this clinic' },
        { status: 400 }
      );
    }

    // If setting as primary, unset other primaries
    if (isPrimary) {
      try {
        await prisma.userClinic.updateMany({
          where: { userId, isPrimary: true },
          data: { isPrimary: false },
        });
      } catch (e) {
        // Ignore if table doesn't exist
      }
    }

    // Create the assignment
    let userClinic = null;
    try {
      userClinic = await prisma.userClinic.create({
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
    } catch (e: any) {
      console.warn('Could not create UserClinic record:', e.message);
      // Fallback: update user's clinicId
      await prisma.user.update({
        where: { id: userId },
        data: { clinicId },
      });
    }

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
async function handleDelete(req: NextRequest, user: AuthUser) {
  const userId = extractUserId(req);

  if (!userId) {
    return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
  }

  // Check if requester is super admin
  if (user.role?.toUpperCase() !== 'super_admin') {
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
