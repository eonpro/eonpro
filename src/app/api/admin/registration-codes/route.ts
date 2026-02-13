/**
 * Admin API - Clinic Registration Codes Management
 *
 * Allows clinic admins to create, view, update, and manage registration codes
 * for patient self-registration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import {
  handleApiError,
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  InternalError,
} from '@/domains/shared/errors';

// Validation schemas
const createCodeSchema = z.object({
  code: z.string().min(4).max(20).optional(), // Auto-generate if not provided
  description: z.string().max(200).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const updateCodeSchema = z.object({
  id: z.number().int().positive(),
  description: z.string().max(200).optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * Generate a random registration code
 */
function generateCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0, O, 1, I)
  let code = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += chars[randomBytes[i] % chars.length];
  }
  return code;
}

/**
 * GET /api/admin/registration-codes
 * Get all registration codes for the admin's clinic
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Admin and super_admin can access
    if (!['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenError('Unauthorized');
    }

    const clinicId = user.clinicId;

    // Super admin can view all codes or filter by clinic
    const searchParams = req.nextUrl.searchParams;
    const filterClinicId = searchParams.get('clinicId');

    const whereClause =
      user.role === 'super_admin' && filterClinicId
        ? { clinicId: parseInt(filterClinicId) }
        : user.role === 'super_admin'
          ? {}
          : { clinicId };

    if (!clinicId && user.role !== 'super_admin') {
      throw new BadRequestError('No clinic associated with user');
    }

    const codes = await prisma.clinicInviteCode.findMany({
      where: whereClause,
      include: {
        clinic: {
          select: {
            id: true,
            name: true,
            subdomain: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Get usage stats
    const codesWithStats = codes.map((code: (typeof codes)[number]) => ({
      ...code,
      remainingUses: code.usageLimit ? code.usageLimit - code.usageCount : null,
      isExpired: code.expiresAt ? new Date() > code.expiresAt : false,
      isLimitReached: code.usageLimit ? code.usageCount >= code.usageLimit : false,
    }));

    return NextResponse.json({ codes: codesWithStats });
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/registration-codes' });
  }
});

/**
 * POST /api/admin/registration-codes
 * Create a new registration code
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenError('Unauthorized');
    }

    const body = await req.json();
    const parsed = createCodeSchema.safeParse(body);

    if (!parsed.success) {
      throw parsed.error;
    }

    // Determine clinic ID
    let clinicId = user.clinicId;
    if (user.role === 'super_admin' && body.clinicId) {
      clinicId = body.clinicId;
    }

    if (!clinicId) {
      throw new BadRequestError('No clinic specified');
    }

    // Generate or use provided code
    let code = parsed.data.code?.toUpperCase().replace(/[^A-Z0-9]/g, '');

    if (!code) {
      // Generate unique code
      let attempts = 0;
      do {
        code = generateCode();
        const existing = await prisma.clinicInviteCode.findUnique({ where: { code } });
        if (!existing) break;
        attempts++;
      } while (attempts < 10);

      if (attempts >= 10) {
        throw new InternalError('Failed to generate unique code after 10 attempts');
      }
    } else {
      // Check if code already exists
      const existing = await prisma.clinicInviteCode.findUnique({ where: { code } });
      if (existing) {
        throw new ConflictError('Code already exists');
      }
    }

    const newCode = await prisma.clinicInviteCode.create({
      data: {
        clinicId,
        code,
        description: parsed.data.description,
        usageLimit: parsed.data.usageLimit ?? null,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        isActive: parsed.data.isActive ?? true,
        createdById: user.id,
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

    logger.info('Registration code created', {
      codeId: newCode.id,
      code: newCode.code,
      clinicId,
      createdBy: user.id,
    });

    return NextResponse.json({ code: newCode }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { route: 'POST /api/admin/registration-codes' });
  }
});

/**
 * PATCH /api/admin/registration-codes
 * Update an existing registration code
 */
export const PATCH = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenError('Unauthorized');
    }

    const body = await req.json();
    const parsed = updateCodeSchema.safeParse(body);

    if (!parsed.success) {
      throw parsed.error;
    }

    // Verify ownership
    const existingCode = await prisma.clinicInviteCode.findUnique({
      where: { id: parsed.data.id },
    });

    if (!existingCode) {
      throw new NotFoundError('Code not found');
    }

    if (user.role !== 'super_admin' && existingCode.clinicId !== user.clinicId) {
      throw new ForbiddenError('Unauthorized');
    }

    const updatedCode = await prisma.clinicInviteCode.update({
      where: { id: parsed.data.id },
      data: {
        description: parsed.data.description,
        usageLimit: parsed.data.usageLimit,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        isActive: parsed.data.isActive,
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

    logger.info('Registration code updated', {
      codeId: updatedCode.id,
      updatedBy: user.id,
    });

    return NextResponse.json({ code: updatedCode });
  } catch (error) {
    return handleApiError(error, { route: 'PATCH /api/admin/registration-codes' });
  }
});

/**
 * DELETE /api/admin/registration-codes
 * Delete a registration code
 */
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      throw new ForbiddenError('Unauthorized');
    }

    const searchParams = req.nextUrl.searchParams;
    const codeId = searchParams.get('id');

    if (!codeId) {
      throw new BadRequestError('Code ID is required');
    }

    // Verify ownership
    const existingCode = await prisma.clinicInviteCode.findUnique({
      where: { id: parseInt(codeId) },
    });

    if (!existingCode) {
      throw new NotFoundError('Code not found');
    }

    if (user.role !== 'super_admin' && existingCode.clinicId !== user.clinicId) {
      throw new ForbiddenError('Unauthorized');
    }

    await prisma.clinicInviteCode.delete({
      where: { id: parseInt(codeId) },
    });

    logger.info('Registration code deleted', {
      codeId: parseInt(codeId),
      deletedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, { route: 'DELETE /api/admin/registration-codes' });
  }
});
