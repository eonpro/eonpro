/**
 * Admin Clinic User Management API
 * 
 * Allows clinic admins to view, update, and deactivate users within their clinic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import bcrypt from 'bcryptjs';

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * GET /api/admin/clinic/users/[userId]
 * Get a specific user in the current admin's clinic
 */
export const GET = async (request: NextRequest, context: RouteContext) => {
  return withAuth(async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const { userId } = await context.params;
      const targetUserId = parseInt(userId);

      if (isNaN(targetUserId)) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
      }

      // Find user and verify they belong to this clinic
      const targetUser = await prisma.user.findFirst({
        where: {
          id: targetUserId,
          OR: [
            { clinicId: user.clinicId },
            { userClinics: { some: { clinicId: user.clinicId, isActive: true } } },
          ],
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
          provider: {
            select: {
              id: true,
              npi: true,
              licenseNumber: true,
              licenseState: true,
              specialty: true,
              dea: true,
            }
          },
        },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found in this clinic' },
          { status: 404 }
        );
      }

      return NextResponse.json({ user: targetUser });
    } catch (error) {
      logger.error('Error fetching clinic user:', error);
      return NextResponse.json(
        { error: 'Failed to fetch user' },
        { status: 500 }
      );
    }
  }, { roles: ['admin', 'super_admin'] })(request);
};

/**
 * PATCH /api/admin/clinic/users/[userId]
 * Update a user in the current admin's clinic
 */
export const PATCH = async (request: NextRequest, context: RouteContext) => {
  return withAuth(async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const { userId } = await context.params;
      const targetUserId = parseInt(userId);

      if (isNaN(targetUserId)) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
      }

      // Prevent self-modification of role
      if (targetUserId === user.id) {
        return NextResponse.json(
          { error: 'You cannot modify your own account through this endpoint' },
          { status: 403 }
        );
      }

      // Find user and verify they belong to this clinic
      const targetUser = await prisma.user.findFirst({
        where: {
          id: targetUserId,
          OR: [
            { clinicId: user.clinicId },
            { userClinics: { some: { clinicId: user.clinicId, isActive: true } } },
          ],
        },
        include: {
          provider: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found in this clinic' },
          { status: 404 }
        );
      }

      const body = await req.json();
      const { 
        firstName, lastName, phone, role, status, password,
        // Provider fields
        npi, deaNumber, licenseNumber, licenseState, specialty 
      } = body;

      // Build update data
      const updateData: any = {};
      if (firstName !== undefined) updateData.firstName = firstName;
      if (lastName !== undefined) updateData.lastName = lastName;
      if (phone !== undefined) updateData.phone = phone || null;
      if (role !== undefined) updateData.role = role.toUpperCase();
      if (status !== undefined) updateData.status = status;
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 12);
      }

      // Update the user
      const updatedUser = await prisma.user.update({
        where: { id: targetUserId },
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

      // Update UserClinic role if changed
      if (role !== undefined) {
        try {
          await prisma.userClinic.updateMany({
            where: {
              userId: targetUserId,
              clinicId: user.clinicId,
            },
            data: {
              role: role.toUpperCase(),
            },
          });
        } catch (ucError) {
          logger.warn('Failed to update UserClinic role');
        }
      }

      // Update provider record if applicable
      if (targetUser.provider && (npi || deaNumber || licenseNumber || licenseState || specialty)) {
        try {
          await prisma.provider.update({
            where: { id: targetUser.provider.id },
            data: {
              ...(npi && { npi }),
              ...(deaNumber !== undefined && { dea: deaNumber || null }),
              ...(licenseNumber && { licenseNumber }),
              ...(licenseState && { licenseState }),
              ...(specialty !== undefined && { titleLine: specialty || null }),
              ...(password && { passwordHash: await bcrypt.hash(password, 12) }),
            },
          });
        } catch (providerError) {
          logger.warn('Failed to update provider record');
        }
      }

      // Create audit log
      try {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: user.clinicId,
            action: 'UPDATE_USER',
            userId: user.id,
            details: {
              updatedBy: user.email,
              targetUser: {
                id: targetUserId,
                email: targetUser.email,
              },
              changes: body,
            },
          },
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log');
      }

      logger.info(`[CLINIC-USERS] Admin ${user.email} updated user ${targetUser.email}`);

      return NextResponse.json({
        user: updatedUser,
        message: 'User updated successfully',
      });
    } catch (error) {
      logger.error('Error updating clinic user:', error);
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }
  }, { roles: ['admin', 'super_admin'] })(request);
};

/**
 * DELETE /api/admin/clinic/users/[userId]
 * Deactivate (soft delete) a user from the clinic
 */
export const DELETE = async (request: NextRequest, context: RouteContext) => {
  return withAuth(async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.clinicId) {
        return NextResponse.json(
          { error: 'User is not associated with a clinic' },
          { status: 400 }
        );
      }

      const { userId } = await context.params;
      const targetUserId = parseInt(userId);

      if (isNaN(targetUserId)) {
        return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
      }

      // Prevent self-deletion
      if (targetUserId === user.id) {
        return NextResponse.json(
          { error: 'You cannot deactivate your own account' },
          { status: 403 }
        );
      }

      // Find user and verify they belong to this clinic
      const targetUser = await prisma.user.findFirst({
        where: {
          id: targetUserId,
          OR: [
            { clinicId: user.clinicId },
            { userClinics: { some: { clinicId: user.clinicId, isActive: true } } },
          ],
        },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found in this clinic' },
          { status: 404 }
        );
      }

      // Soft delete: deactivate the user
      await prisma.user.update({
        where: { id: targetUserId },
        data: { status: 'INACTIVE' },
      });

      // Deactivate UserClinic association
      await prisma.userClinic.updateMany({
        where: {
          userId: targetUserId,
          clinicId: user.clinicId,
        },
        data: {
          isActive: false,
        },
      });

      // Create audit log
      try {
        await prisma.clinicAuditLog.create({
          data: {
            clinicId: user.clinicId,
            action: 'DEACTIVATE_USER',
            userId: user.id,
            details: {
              deactivatedBy: user.email,
              targetUser: {
                id: targetUserId,
                email: targetUser.email,
              },
            },
          },
        });
      } catch (auditError) {
        logger.warn('Failed to create audit log');
      }

      logger.info(`[CLINIC-USERS] Admin ${user.email} deactivated user ${targetUser.email}`);

      return NextResponse.json({
        message: 'User deactivated successfully',
      });
    } catch (error) {
      logger.error('Error deactivating clinic user:', error);
      return NextResponse.json(
        { error: 'Failed to deactivate user' },
        { status: 500 }
      );
    }
  }, { roles: ['admin', 'super_admin'] })(request);
};
