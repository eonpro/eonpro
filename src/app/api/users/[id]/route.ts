/**
 * Individual User API
 * GET, PUT, DELETE for specific user
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { hasPermission, PERMISSIONS } from '@/lib/auth/permissions';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Update user schema
const updateUserSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN', 'PROVIDER', 'INFLUENCER', 'PATIENT', 'STAFF', 'SUPPORT']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'LOCKED']).optional(),
  clinicId: z.number().nullable().optional(),
  permissions: z.array(z.string()).optional(),
  features: z.array(z.string()).optional(),
  metadata: z.object({}).passthrough().optional(),
  password: z.string().min(8).optional(),
});

/**
 * GET /api/users/[id]
 * Get a specific user by ID
 */
async function getUserHandler(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.USER_READ)) {
      return NextResponse.json(
        { error: 'You do not have permission to view users' },
        { status: 403 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        clinicId: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        provider: {
          select: {
            id: true,
            npi: true,
            licenseNumber: true,
            licenseState: true,
            deaNumber: true,
          },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: targetUser });
  } catch (error: any) {
    logger.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

/**
 * PUT /api/users/[id]
 * Update a specific user
 */
async function updateUserHandler(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Check permission
    if (!hasPermission(user.role as any, PERMISSIONS.USER_UPDATE)) {
      return NextResponse.json(
        { error: 'You do not have permission to update users' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const validated = updateUserSchema.parse(body);

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Role hierarchy check
    const roleHierarchy: Record<string, number> = {
      SUPER_ADMIN: 7,
      super_admin: 7,
      ADMIN: 6,
      admin: 6,
      PROVIDER: 5,
      provider: 5,
      STAFF: 4,
      staff: 4,
      INFLUENCER: 3,
      influencer: 3,
      SUPPORT: 2,
      support: 2,
      PATIENT: 1,
      patient: 1,
    };

    const userRoleLevel = roleHierarchy[user.role] || 0;
    const targetRoleLevel = roleHierarchy[targetUser.role] || 0;

    // Can't modify users with higher or equal roles (except self or if super admin)
    if (targetRoleLevel >= userRoleLevel && targetUser.id !== user.id && userRoleLevel < 7) {
      return NextResponse.json(
        { error: 'You cannot modify users with equal or higher roles' },
        { status: 403 }
      );
    }

    // Prepare update data
    const updatePayload: any = {
      updatedAt: new Date(),
    };

    if (validated.firstName) updatePayload.firstName = validated.firstName;
    if (validated.lastName) updatePayload.lastName = validated.lastName;
    if (validated.role) updatePayload.role = validated.role;
    if (validated.status) updatePayload.status = validated.status;
    if (validated.clinicId !== undefined) updatePayload.clinicId = validated.clinicId;
    if (validated.permissions) updatePayload.permissions = validated.permissions;
    if (validated.features) updatePayload.features = validated.features;

    // Hash password if provided
    if (validated.password) {
      updatePayload.passwordHash = await bcrypt.hash(validated.password, 12);
      updatePayload.lastPasswordChange = new Date();
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        status: true,
        clinicId: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
        updatedAt: true,
      },
    });

    // Create audit log if the model exists
    try {
      await prisma.userAuditLog.create({
        data: {
          userId: userId,
          action: 'USER_UPDATED',
          details: {
            updatedBy: user.email,
            updatedByRole: user.role,
            changes: Object.keys(validated),
            passwordChanged: !!validated.password,
          },
          ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
          userAgent: req.headers.get('user-agent') || null,
        },
      });
    } catch (auditError) {
      // Audit log creation is non-critical
      logger.warn('Failed to create audit log:', auditError);
    }

    logger.info(`User ${targetUser.email} updated by ${user.email}`);

    return NextResponse.json({
      success: true,
      message: 'User updated successfully',
      user: updatedUser,
    });
  } catch (error: any) {
    logger.error('User update error:', error);

    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id]
 * Delete or suspend a user
 */
async function deleteUserHandler(
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    const userId = parseInt(id);

    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Only super_admin can delete users
    const isSuperAdmin = user.role === 'super_admin';
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Only Super Admins can delete users' },
        { status: 403 }
      );
    }

    // Prevent self-deletion
    if (userId === user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action') || 'suspend';

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (action === 'delete') {
      // Hard delete
      await prisma.user.delete({ where: { id: userId } });
      logger.warn(`User ${targetUser.email} permanently deleted by ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'User permanently deleted',
      });
    } else {
      // Soft delete (suspend)
      await prisma.user.update({
        where: { id: userId },
        data: {
          status: 'SUSPENDED',
          updatedAt: new Date(),
        },
      });

      logger.info(`User ${targetUser.email} suspended by ${user.email}`);

      return NextResponse.json({
        success: true,
        message: 'User suspended successfully',
      });
    }
  } catch (error: any) {
    logger.error('User deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

// Wrap handlers with auth
const wrappedGetHandler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  return withAuth((r: NextRequest, u: AuthUser) =>
    getUserHandler(r, u, context)
  )(req);
};

const wrappedPutHandler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  return withAuth((r: NextRequest, u: AuthUser) =>
    updateUserHandler(r, u, context)
  )(req);
};

const wrappedDeleteHandler = (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
  return withAuth((r: NextRequest, u: AuthUser) =>
    deleteUserHandler(r, u, context),
    { roles: ['super_admin'] }
  )(req);
};

export const GET = wrappedGetHandler as any;
export const PUT = wrappedPutHandler as any;
export const DELETE = wrappedDeleteHandler as any;
