/**
 * Sales Rep Override Assignment Detail API
 *
 * PATCH  — Update override percentage or notes.
 * DELETE — Soft-deactivate the override assignment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const patchSchema = z.object({
  overridePercentBps: z.number().int().min(1).max(10000).optional(),
  notes: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  effectiveTo: z.string().datetime().optional(),
});

function withOverrideAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin', 'admin'] }
    )(req);
  };
}

async function handlePatch(
  req: NextRequest,
  user: AuthUser,
  params: { id: string }
): Promise<Response> {
  try {
    const assignmentId = parseInt(params.id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updateData: Record<string, any> = {};
    if (parsed.data.overridePercentBps !== undefined) {
      updateData.overridePercentBps = parsed.data.overridePercentBps;
    }
    if (parsed.data.notes !== undefined) {
      updateData.notes = parsed.data.notes;
    }
    if (parsed.data.isActive !== undefined) {
      updateData.isActive = parsed.data.isActive;
      if (!parsed.data.isActive) {
        updateData.effectiveTo = new Date();
      }
    }
    if (parsed.data.effectiveTo !== undefined) {
      updateData.effectiveTo = new Date(parsed.data.effectiveTo);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const runUpdate = async () => {
      const existing = await prisma.salesRepOverrideAssignment.findUnique({
        where: { id: assignmentId },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Override assignment not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && existing.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      const updated = await prisma.salesRepOverrideAssignment.update({
        where: { id: assignmentId },
        data: updateData,
        include: {
          overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          subordinateRep: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      logger.info('[SalesRepOverride] Override assignment updated', {
        assignmentId,
        changes: updateData,
        updatedBy: user.id,
      });

      return NextResponse.json({ success: true, assignment: updated });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runUpdate);
    }
    return await runWithClinicContext(user.clinicId!, runUpdate);
  } catch (error) {
    return handleApiError(error, { context: { route: `PATCH /api/admin/sales-rep/overrides/${params.id}` } });
  }
}

async function handleDelete(
  _req: NextRequest,
  user: AuthUser,
  params: { id: string }
): Promise<Response> {
  try {
    const assignmentId = parseInt(params.id, 10);
    if (isNaN(assignmentId)) {
      return NextResponse.json({ error: 'Invalid assignment ID' }, { status: 400 });
    }

    const runDelete = async () => {
      const existing = await prisma.salesRepOverrideAssignment.findUnique({
        where: { id: assignmentId },
      });

      if (!existing) {
        return NextResponse.json({ error: 'Override assignment not found' }, { status: 404 });
      }

      if (user.role !== 'super_admin' && existing.clinicId !== user.clinicId) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      await prisma.salesRepOverrideAssignment.update({
        where: { id: assignmentId },
        data: {
          isActive: false,
          effectiveTo: new Date(),
        },
      });

      logger.info('[SalesRepOverride] Override assignment deactivated', {
        assignmentId,
        deactivatedBy: user.id,
      });

      return NextResponse.json({ success: true });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runDelete);
    }
    return await runWithClinicContext(user.clinicId!, runDelete);
  } catch (error) {
    return handleApiError(error, { context: { route: `DELETE /api/admin/sales-rep/overrides/${params.id}` } });
  }
}

export const PATCH = withOverrideAuth(handlePatch);
export const DELETE = withOverrideAuth(handleDelete);
