import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/auth/middleware-with-params';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

type RouteParams = { id: string; userId: string };
type RouteContext = { params: Promise<RouteParams> };

function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: RouteParams) => Promise<Response>
) {
  return withAuthParams<RouteContext>(
    async (req, user, context) => {
      const params = await context.params;
      return handler(req, user, params);
    },
    { roles: ['super_admin'] }
  );
}

const VALID_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'PROVIDER', 'INFLUENCER',
  'AFFILIATE', 'PATIENT', 'STAFF', 'SUPPORT', 'SALES_REP',
] as const;

const VALID_STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

/**
 * PUT /api/super-admin/clinics/[id]/users/[userId]
 * Update a user's profile fields and/or reset password
 */
export const PUT = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: RouteParams) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      const targetUser = await prisma.user.findFirst({
        where: {
          id: userId,
          OR: [
            { clinicId },
            { userClinics: { some: { clinicId, isActive: true } } },
          ],
        },
        select: { id: true, email: true, firstName: true, lastName: true, role: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found in this clinic' },
          { status: 404 }
        );
      }

      const body = await req.json();
      const { password, firstName, lastName, phone, role, status } = body;

      const userData: Record<string, unknown> = {};
      const changes: string[] = [];

      if (firstName && typeof firstName === 'string') {
        userData.firstName = firstName.trim();
        changes.push('firstName');
      }
      if (lastName && typeof lastName === 'string') {
        userData.lastName = lastName.trim();
        changes.push('lastName');
      }
      if (phone !== undefined) {
        userData.phone = typeof phone === 'string' && phone.trim() ? phone.trim() : null;
        changes.push('phone');
      }
      if (role && typeof role === 'string') {
        const upperRole = role.toUpperCase();
        if (!VALID_ROLES.includes(upperRole as (typeof VALID_ROLES)[number])) {
          return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });
        }
        userData.role = upperRole;
        changes.push('role');
      }
      if (status && typeof status === 'string') {
        const upperStatus = status.toUpperCase();
        if (!VALID_STATUSES.includes(upperStatus as (typeof VALID_STATUSES)[number])) {
          return NextResponse.json({ error: `Invalid status: ${status}` }, { status: 400 });
        }
        userData.status = upperStatus;
        changes.push('status');
      }

      if (password && typeof password === 'string') {
        if (password.length < 8) {
          return NextResponse.json(
            { error: 'Password must be at least 8 characters' },
            { status: 400 }
          );
        }
        userData.passwordHash = await bcrypt.hash(password, 12);
        changes.push('password');
      }

      if (changes.length === 0) {
        return NextResponse.json(
          { error: 'No valid fields to update' },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: userData,
        });

        if (userData.role) {
          await tx.userClinic.updateMany({
            where: { userId, clinicId },
            data: { role: userData.role as string },
          });
        }
      });

      logger.info('User updated by super admin', {
        targetUserId: userId,
        clinicId,
        performedBy: user.id,
        fieldsChanged: changes,
      });

      return NextResponse.json({
        success: true,
        message: 'User updated successfully',
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error updating user', { error: message });
      return NextResponse.json(
        { error: 'Failed to update user' },
        { status: 500 }
      );
    }
  }
);

/**
 * DELETE /api/super-admin/clinics/[id]/users/[userId]
 * Remove a user from a clinic (super admin only)
 */
export const DELETE = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, params: RouteParams) => {
    try {
      const clinicId = parseInt(params.id);
      const userId = parseInt(params.userId);

      if (isNaN(clinicId) || isNaN(userId)) {
        return NextResponse.json({ error: 'Invalid clinic or user ID' }, { status: 400 });
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Find the target user
      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, clinicId: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Remove UserClinic association and update legacy clinicId in a transaction
      await prisma.$transaction(async (tx) => {
        // Try to remove UserClinic record if it exists
        try {
          await tx.userClinic.delete({
            where: {
              userId_clinicId: { userId, clinicId },
            },
          });
        } catch (ucError: unknown) {
          // UserClinic record may not exist — that's okay, continue
          logger.warn('UserClinic record not found or could not be deleted', {
            userId,
            clinicId,
            error: ucError instanceof Error ? ucError.message : String(ucError),
          });
        }

        // If the user's primary clinicId matches, clear it
        if (targetUser.clinicId === clinicId) {
          // Check if user has another clinic assignment to fall back to
          let fallbackClinicId: number | null = null;
          try {
            const otherClinic = await tx.userClinic.findFirst({
              where: {
                userId,
                clinicId: { not: clinicId },
                isActive: true,
              },
              orderBy: { isPrimary: 'desc' },
              select: { clinicId: true },
            });
            fallbackClinicId = otherClinic?.clinicId ?? null;
          } catch {
            // UserClinic table may not be available
          }

          await tx.user.update({
            where: { id: userId },
            data: { clinicId: fallbackClinicId },
          });
        }
      }, { timeout: 15000 });

      logger.info('User removed from clinic by super admin', {
        targetUserId: userId,
        clinicId,
        clinicName: clinic.name,
        performedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        message: `User removed from ${clinic.name}`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Error removing user from clinic', {
        error: message,
        params: { clinicId: params.id, userId: params.userId },
      });
      return NextResponse.json(
        { error: 'Failed to remove user from clinic' },
        { status: 500 }
      );
    }
  }
);
