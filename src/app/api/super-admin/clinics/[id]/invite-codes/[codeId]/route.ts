import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * Middleware to check for Super Admin role
 */
function withSuperAdminAuth(
  handler: (
    req: NextRequest,
    user: AuthUser,
    context: { params: Promise<{ id: string; codeId: string }> }
  ) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string; codeId: string }> }) =>
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

// Schema for updating invite code
const updateInviteCodeSchema = z.object({
  description: z.string().optional(),
  usageLimit: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/super-admin/clinics/[id]/invite-codes/[codeId]
 * Get a specific invite code
 */
export const GET = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string; codeId: string }> }
) => {
  try {
    const { id, codeId } = await context.params;
    const clinicId = parseInt(id);
    const inviteCodeId = parseInt(codeId);

    if (isNaN(clinicId) || isNaN(inviteCodeId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const inviteCode = await prisma.clinicInviteCode.findFirst({
      where: {
        id: inviteCodeId,
        clinicId,
      },
      select: {
        id: true,
        code: true,
        description: true,
        usageLimit: true,
        usageCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        clinic: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!inviteCode) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    return NextResponse.json({ inviteCode });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/INVITE-CODES] Error getting invite code:', error);
    return NextResponse.json(
      { error: 'Failed to get invite code', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * PATCH /api/super-admin/clinics/[id]/invite-codes/[codeId]
 * Update an invite code
 */
export const PATCH = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string; codeId: string }> }
) => {
  try {
    const { id, codeId } = await context.params;
    const clinicId = parseInt(id);
    const inviteCodeId = parseInt(codeId);

    if (isNaN(clinicId) || isNaN(inviteCodeId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    const body = await req.json();
    const validated = updateInviteCodeSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validated.error.issues },
        { status: 400 }
      );
    }

    // Check invite code exists
    const existing = await prisma.clinicInviteCode.findFirst({
      where: {
        id: inviteCodeId,
        clinicId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    const { description, usageLimit, expiresAt, isActive } = validated.data;

    // Update invite code
    const updated = await prisma.clinicInviteCode.update({
      where: { id: inviteCodeId },
      data: {
        ...(description !== undefined && { description }),
        ...(usageLimit !== undefined && { usageLimit }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
        ...(isActive !== undefined && { isActive }),
      },
      select: {
        id: true,
        code: true,
        description: true,
        usageLimit: true,
        usageCount: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    logger.info('[SUPER-ADMIN/INVITE-CODES] Updated invite code', {
      clinicId,
      inviteCodeId,
      code: updated.code,
      changes: Object.keys(validated.data),
      userEmail: user.email,
    });

    return NextResponse.json({
      message: 'Invite code updated successfully',
      inviteCode: updated,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/INVITE-CODES] Error updating invite code:', error);
    return NextResponse.json(
      { error: 'Failed to update invite code', details: error.message },
      { status: 500 }
    );
  }
});

/**
 * DELETE /api/super-admin/clinics/[id]/invite-codes/[codeId]
 * Delete an invite code
 */
export const DELETE = withSuperAdminAuth(async (
  req: NextRequest,
  user: AuthUser,
  context: { params: Promise<{ id: string; codeId: string }> }
) => {
  try {
    const { id, codeId } = await context.params;
    const clinicId = parseInt(id);
    const inviteCodeId = parseInt(codeId);

    if (isNaN(clinicId) || isNaN(inviteCodeId)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }

    // Check invite code exists
    const existing = await prisma.clinicInviteCode.findFirst({
      where: {
        id: inviteCodeId,
        clinicId,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invite code not found' }, { status: 404 });
    }

    // Delete invite code
    await prisma.clinicInviteCode.delete({
      where: { id: inviteCodeId },
    });

    logger.info('[SUPER-ADMIN/INVITE-CODES] Deleted invite code', {
      clinicId,
      inviteCodeId,
      code: existing.code,
      userEmail: user.email,
    });

    return NextResponse.json({
      message: 'Invite code deleted successfully',
      deletedCode: existing.code,
    });
  } catch (error: any) {
    logger.error('[SUPER-ADMIN/INVITE-CODES] Error deleting invite code:', error);
    return NextResponse.json(
      { error: 'Failed to delete invite code', details: error.message },
      { status: 500 }
    );
  }
});
