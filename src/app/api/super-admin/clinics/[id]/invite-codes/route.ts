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
    context: { params: Promise<{ id: string }> }
  ) => Promise<Response>
) {
  return withAuth(
    (req: NextRequest, user: AuthUser, context?: { params: Promise<{ id: string }> }) =>
      handler(req, user, context!),
    { roles: ['super_admin'] }
  );
}

// Schema for creating invite code
const createInviteCodeSchema = z.object({
  code: z
    .string()
    .min(3, 'Code must be at least 3 characters')
    .max(20, 'Code must be at most 20 characters')
    .regex(/^[A-Z0-9]+$/, 'Code must be uppercase alphanumeric'),
  description: z.string().optional().nullable(),
  usageLimit: z.number().int().positive().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * GET /api/super-admin/clinics/[id]/invite-codes
 * List all invite codes for a clinic
 */
export const GET = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const clinicId = parseInt(id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      // Check clinic exists
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Get invite codes
      const inviteCodes = await prisma.clinicInviteCode.findMany({
        where: { clinicId },
        orderBy: { createdAt: 'desc' },
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

      logger.info('[SUPER-ADMIN/INVITE-CODES] Listed invite codes', {
        clinicId,
        count: inviteCodes.length,
        userEmail: user.email,
      });

      return NextResponse.json({
        clinic: { id: clinic.id, name: clinic.name },
        inviteCodes,
      });
    } catch (error: any) {
      logger.error('[SUPER-ADMIN/INVITE-CODES] Error listing invite codes:', error);
      return NextResponse.json(
        { error: 'Failed to list invite codes', details: error.message },
        { status: 500 }
      );
    }
  }
);

/**
 * POST /api/super-admin/clinics/[id]/invite-codes
 * Create a new invite code for a clinic
 */
export const POST = withSuperAdminAuth(
  async (req: NextRequest, user: AuthUser, context: { params: Promise<{ id: string }> }) => {
    try {
      const { id } = await context.params;
      const clinicId = parseInt(id);

      if (isNaN(clinicId)) {
        return NextResponse.json({ error: 'Invalid clinic ID' }, { status: 400 });
      }

      const body = await req.json();

      // Normalize code to uppercase
      if (body.code) {
        body.code = body.code.trim().toUpperCase();
      }

      const validated = createInviteCodeSchema.safeParse(body);
      if (!validated.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validated.error.issues },
          { status: 400 }
        );
      }

      const { code, description, usageLimit, expiresAt } = validated.data;

      // Check clinic exists
      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { id: true, name: true },
      });

      if (!clinic) {
        return NextResponse.json({ error: 'Clinic not found' }, { status: 404 });
      }

      // Check if code already exists (globally unique)
      const existing = await prisma.clinicInviteCode.findUnique({
        where: { code },
      });

      if (existing) {
        return NextResponse.json(
          { error: 'This code is already in use. Please choose a different code.' },
          { status: 409 }
        );
      }

      // Create invite code
      const inviteCode = await prisma.clinicInviteCode.create({
        data: {
          clinicId,
          code,
          description: description || null,
          usageLimit: usageLimit ?? null,
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          isActive: true,
          createdById: user.id,
        },
      });

      logger.info('[SUPER-ADMIN/INVITE-CODES] Created invite code', {
        clinicId,
        code,
        inviteCodeId: inviteCode.id,
        userEmail: user.email,
      });

      return NextResponse.json({
        message: 'Invite code created successfully',
        inviteCode: {
          id: inviteCode.id,
          code: inviteCode.code,
          description: inviteCode.description,
          usageLimit: inviteCode.usageLimit,
          usageCount: inviteCode.usageCount,
          expiresAt: inviteCode.expiresAt,
          isActive: inviteCode.isActive,
          createdAt: inviteCode.createdAt,
        },
      });
    } catch (error: any) {
      logger.error('[SUPER-ADMIN/INVITE-CODES] Error creating invite code:', error);
      return NextResponse.json(
        { error: 'Failed to create invite code', details: error.message },
        { status: 500 }
      );
    }
  }
);
