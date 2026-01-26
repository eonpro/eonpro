import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
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
        phone: true,
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
    const { firstName, lastName, role, status, password, phone } = body;

    // Build update data
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) updateData.status = status;
    if (phone !== undefined) updateData.phone = phone || null; // Allow clearing phone

    // Handle password reset
    if (password) {
      if (password.length < 12) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }
      updateData.passwordHash = await bcrypt.hash(password, 12);
      updateData.lastPasswordChange = new Date();
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        phone: true,
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

    // Check if user is connected via UserClinic (multi-clinic) or primary clinicId
    const userClinicLink = await prisma.userClinic.findFirst({
      where: {
        userId,
        clinicId,
      },
    });

    const existingUser = await prisma.user.findFirst({
      where: {
        id: userId,
        OR: [
          { clinicId }, // Primary clinic
          { userClinics: { some: { clinicId, isActive: true } } }, // Multi-clinic
        ],
      },
      include: { provider: true },
    });

    if (!existingUser) {
      return NextResponse.json(
        { error: 'User not found in this clinic' },
        { status: 404 }
      );
    }

    // If user has multiple clinics, just remove from this clinic (don't delete user)
    const userClinicCount = await prisma.userClinic.count({
      where: { userId, isActive: true },
    });

    const isPrimaryClinic = existingUser.clinicId === clinicId;

    // If user belongs to multiple clinics and this isn't their only/primary clinic,
    // just remove the clinic association instead of deleting the user
    if (userClinicLink && (userClinicCount > 1 || !isPrimaryClinic)) {
      await prisma.userClinic.delete({
        where: { id: userClinicLink.id },
      });

      return NextResponse.json({
        message: 'User removed from clinic successfully',
      });
    }

    // Helper function to safely delete from a model
    const safeDeleteMany = async (tx: any, modelName: string, where: any) => {
      try {
        if (tx[modelName] && typeof tx[modelName].deleteMany === 'function') {
          await tx[modelName].deleteMany({ where });
        }
      } catch (e: any) {
        console.warn(`Could not delete from ${modelName}:`, e.message);
      }
    };

    // Helper function to safely update a model
    const safeUpdateMany = async (tx: any, modelName: string, where: any, data: any) => {
      try {
        if (tx[modelName] && typeof tx[modelName].updateMany === 'function') {
          await tx[modelName].updateMany({ where, data });
        }
      } catch (e: any) {
        console.warn(`Could not update ${modelName}:`, e.message);
      }
    };

    // Delete all related records in a transaction
    await prisma.$transaction(async (tx: any) => {
      // 1. Delete sessions
      await safeDeleteMany(tx, 'userSession', { userId });
      
      // 2. Delete audit logs
      await safeDeleteMany(tx, 'userAuditLog', { userId });
      
      // 3. Delete password reset tokens
      await safeDeleteMany(tx, 'passwordResetToken', { userId });
      
      // 4. Delete email verification tokens
      await safeDeleteMany(tx, 'emailVerificationToken', { userId });
      
      // 5. Delete user clinic assignments
      await safeDeleteMany(tx, 'userClinic', { userId });
      
      // 6. Delete API keys and usage logs
      try {
        const apiKeys = await tx.apiKey?.findMany?.({
          where: { userId },
          select: { id: true },
        }) || [];
        for (const key of apiKeys) {
          await safeDeleteMany(tx, 'apiUsageLog', { apiKeyId: key.id });
        }
        await safeDeleteMany(tx, 'apiKey', { userId });
      } catch (e: any) {
        console.warn('Could not delete API keys:', e.message);
      }
      
      // 7. Update tickets to remove user references (set to null instead of delete)
      await safeUpdateMany(tx, 'ticket', { createdById: userId }, { createdById: null });
      await safeUpdateMany(tx, 'ticket', { assignedToId: userId }, { assignedToId: null });
      await safeUpdateMany(tx, 'ticket', { resolvedById: userId }, { resolvedById: null });
      await safeUpdateMany(tx, 'ticket', { ownerId: userId }, { ownerId: null });
      await safeUpdateMany(tx, 'ticket', { lastWorkedById: userId }, { lastWorkedById: null });
      
      // 8. Delete ticket-related records
      await safeDeleteMany(tx, 'ticketAssignment', { assignedById: userId });
      await safeDeleteMany(tx, 'ticketAssignment', { assignedToId: userId });
      await safeDeleteMany(tx, 'ticketComment', { userId });
      await safeDeleteMany(tx, 'ticketStatusHistory', { changedById: userId });
      await safeDeleteMany(tx, 'ticketWorkLog', { userId });
      await safeDeleteMany(tx, 'ticketEscalation', { escalatedById: userId });
      await safeDeleteMany(tx, 'ticketEscalation', { escalatedToId: userId });
      
      // 9. Delete clinic audit logs
      await safeDeleteMany(tx, 'clinicAuditLog', { userId });
      
      // 10. Update appointments to remove creator reference
      await safeUpdateMany(tx, 'appointment', { createdById: userId }, { createdById: null });
      
      // 11. Delete care plan progress
      await safeDeleteMany(tx, 'carePlanProgress', { recordedById: userId });
      
      // 12. Delete internal messages
      await safeDeleteMany(tx, 'internalMessage', { senderId: userId });
      await safeDeleteMany(tx, 'internalMessage', { recipientId: userId });
      
      // 13. Handle provider relationship (Provider doesn't have userId - User has providerId)
      // First unlink the provider from the user, then optionally delete the provider
      if (existingUser.providerId) {
        // Unlink provider from user first
        await tx.user.update({
          where: { id: userId },
          data: { providerId: null },
        });

        // Note: We keep the Provider record for audit/historical purposes
        // If you want to delete it, uncomment the following:
        // await safeDeleteMany(tx, 'providerAudit', { providerId: existingUser.providerId });
        // await tx.provider.delete({ where: { id: existingUser.providerId } });
      }
      
      // 14. Update createdBy references to null for users created by this user
      await safeUpdateMany(tx, 'user', { createdById: userId }, { createdById: null });
      
      // Finally delete the user
      await tx.user.delete({ where: { id: userId } });
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

