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

    // Delete all related records in a transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete sessions
      await tx.userSession.deleteMany({ where: { userId } });
      
      // 2. Delete audit logs
      await tx.userAuditLog.deleteMany({ where: { userId } });
      
      // 3. Delete password reset tokens
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      
      // 4. Delete email verification tokens
      await tx.emailVerificationToken.deleteMany({ where: { userId } });
      
      // 5. Delete user clinic assignments
      await tx.userClinic.deleteMany({ where: { userId } });
      
      // 6. Delete API keys and usage logs
      const apiKeys = await tx.apiKey.findMany({
        where: { userId },
        select: { id: true },
      });
      for (const key of apiKeys) {
        await tx.apiUsageLog.deleteMany({ where: { apiKeyId: key.id } });
      }
      await tx.apiKey.deleteMany({ where: { userId } });
      
      // 7. Update tickets to remove user references (set to null instead of delete)
      await tx.ticket.updateMany({
        where: { createdById: userId },
        data: { createdById: null as any },
      });
      await tx.ticket.updateMany({
        where: { assignedToId: userId },
        data: { assignedToId: null },
      });
      await tx.ticket.updateMany({
        where: { resolvedById: userId },
        data: { resolvedById: null },
      });
      await tx.ticket.updateMany({
        where: { ownerId: userId },
        data: { ownerId: null },
      });
      await tx.ticket.updateMany({
        where: { lastWorkedById: userId },
        data: { lastWorkedById: null },
      });
      
      // 8. Delete ticket-related records
      await tx.ticketAssignment.deleteMany({ where: { assignedById: userId } });
      await tx.ticketAssignment.deleteMany({ where: { assignedToId: userId } });
      await tx.ticketComment.deleteMany({ where: { userId } });
      await tx.ticketStatusHistory.deleteMany({ where: { changedById: userId } });
      await tx.ticketWorkLog.deleteMany({ where: { userId } });
      await tx.ticketEscalation.deleteMany({ where: { escalatedById: userId } });
      await tx.ticketEscalation.deleteMany({ where: { escalatedToId: userId } });
      
      // 9. Delete clinic audit logs
      await tx.clinicAuditLog.deleteMany({ where: { userId } });
      
      // 10. Update appointments to remove creator reference
      await tx.appointment.updateMany({
        where: { createdById: userId },
        data: { createdById: null },
      });
      
      // 11. Delete care plan progress
      await tx.carePlanProgress.deleteMany({ where: { recordedById: userId } });
      
      // 12. Delete internal messages
      await tx.internalMessage.deleteMany({ where: { senderId: userId } });
      await tx.internalMessage.deleteMany({ where: { recipientId: userId } });
      
      // 13. Delete associated provider record if exists
      await tx.provider.deleteMany({ where: { userId } });
      
      // 14. Update createdBy references to null for users created by this user
      await tx.user.updateMany({
        where: { createdById: userId },
        data: { createdById: null },
      });
      
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

