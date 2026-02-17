import { NextRequest, NextResponse } from 'next/server';
import { basePrisma as prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import bcrypt from 'bcryptjs';
import { logger } from '@/lib/logger';

type RouteParams = { id: string; userId: string };

function withSuperAdminAuth(
  handler: (req: NextRequest, user: AuthUser, params: RouteParams) => Promise<Response>
) {
  return async (req: NextRequest, context: { params: Promise<RouteParams> }) => {
    const params = await context.params;
    return withAuth((req: NextRequest, user: AuthUser) => handler(req, user, params), {
      roles: ['super_admin', 'super_admin'],
    })(req);
  };
}

/**
 * PUT /api/super-admin/clinics/[id]/users/[userId]
 * Update a user (currently supports password reset)
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
        select: { id: true, email: true, firstName: true, lastName: true },
      });

      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found in this clinic' },
          { status: 404 }
        );
      }

      const body = await req.json();
      const { password } = body;

      if (!password || typeof password !== 'string') {
        return NextResponse.json(
          { error: 'Password is required' },
          { status: 400 }
        );
      }

      if (password.length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);

      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      logger.info('Password reset by super admin', {
        targetUserId: userId,
        clinicId,
        performedBy: user.id,
      });

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully',
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
