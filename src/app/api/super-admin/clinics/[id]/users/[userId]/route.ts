import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import bcrypt from 'bcryptjs';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<{ id: string; userId: string }> }) => {
    const params = await context.params;
    return withAuth(
      (req: NextRequest, user: AuthUser) => handler(req, user, params),
      { roles: ['super_admin', 'super_admin'] }
    )(req);
  };
}

/**
 * GET /api/super-admin/clinics/[id]/users/[userId]
 * Get a specific user
 */
export const GET = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
  try {
    const clinicId = parseInt(params.id);
    const userId = parseInt(params.userId);

    if (isNaN(clinicId) || isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid clinic or user ID' },
        { status: 400 }
      );
    }

    const clinicUser = await prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    if (!clinicUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ user: clinicUser });
  } catch (error: any) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/super-admin/clinics/[id]/users/[userId]
 * Update a user (including password reset)
 */
export const PUT = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
  try {
    const clinicId = parseInt(params.id);
    const userId = parseInt(params.userId);

    if (isNaN(clinicId) || isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid clinic or user ID' },
        { status: 400 }
      );
    }

    // Verify user belongs to this clinic
    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
      },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { firstName, lastName, role, status, password } = body;

    // Build update data
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (role) updateData.role = role;
    if (status) updateData.status = status;

    // Handle password reset
    if (password) {
      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }
      updateData.passwordHash = await bcrypt.hash(password, 10);
      updateData.lastPasswordChange = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    return NextResponse.json({
      user: updatedUser,
      message: password ? 'User updated and password reset successfully' : 'User updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update user' },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/clinics/[id]/users/[userId]
 * Remove a user from a clinic
 */
export const DELETE = withSuperAdminAuth(async (req: NextRequest, user: AuthUser, params: { id: string; userId: string }) => {
  try {
    const clinicId = parseInt(params.id);
    const userId = parseInt(params.userId);

    if (isNaN(clinicId) || isNaN(userId)) {
      return NextResponse.json(
        { error: 'Invalid clinic or user ID' },
        { status: 400 }
      );
    }

    // Verify user belongs to this clinic
    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        clinicId,
      },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete associated provider record if exists
    await prisma.provider.deleteMany({
      where: { userId },
    });

    // Delete the user
    await prisma.user.delete({
      where: { id: userId },
    });

    return NextResponse.json({
      message: 'User removed successfully',
    });
  } catch (error: any) {
    console.error('Error removing user:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove user' },
      { status: 500 }
    );
  }
});

