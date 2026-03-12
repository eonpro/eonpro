/**
 * Sales Rep Override Assignments API
 *
 * GET  — List override assignments (manager -> subordinate mappings) for the clinic.
 * POST — Create a new override assignment.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const createSchema = z.object({
  overrideRepId: z.number().positive(),
  subordinateRepId: z.number().positive(),
  overridePercentBps: z.number().int().min(1).max(10000),
  effectiveFrom: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

async function handleGet(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const overrideRepId = searchParams.get('overrideRepId');
    const subordinateRepId = searchParams.get('subordinateRepId');
    const activeOnly = searchParams.get('activeOnly') !== 'false';
    const clinicFilter = searchParams.get('clinicId');

    const clinicId = user.role === 'super_admin'
      ? (clinicFilter ? parseInt(clinicFilter, 10) : undefined)
      : user.clinicId;

    const where: Record<string, any> = {};
    if (clinicId) where.clinicId = clinicId;
    if (overrideRepId) where.overrideRepId = parseInt(overrideRepId, 10);
    if (subordinateRepId) where.subordinateRepId = parseInt(subordinateRepId, 10);
    if (activeOnly) where.isActive = true;

    const runQuery = async () => {
      const assignments = await prisma.salesRepOverrideAssignment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          subordinateRep: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

      return NextResponse.json({
        assignments: assignments.map((a) => ({
          ...a,
          overrideRepName: `${a.overrideRep?.firstName || ''} ${a.overrideRep?.lastName || ''}`.trim() || a.overrideRep?.email,
          subordinateRepName: `${a.subordinateRep?.firstName || ''} ${a.subordinateRep?.lastName || ''}`.trim() || a.subordinateRep?.email,
          overridePercentDisplay: `${(a.overridePercentBps / 100).toFixed(2)}%`,
        })),
        total: assignments.length,
      });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runQuery);
    }
    return await runWithClinicContext(user.clinicId!, runQuery);
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/admin/sales-rep/overrides' } });
  }
}

async function handlePost(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { overrideRepId, subordinateRepId, overridePercentBps, effectiveFrom, notes } =
      parsed.data;

    if (overrideRepId === subordinateRepId) {
      return NextResponse.json(
        { error: 'A rep cannot be their own override manager' },
        { status: 400 }
      );
    }

    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
    }

    const [overrideRep, subordinateRep] = await Promise.all([
      prisma.user.findFirst({
        where: { id: overrideRepId, role: { in: ['SALES_REP', 'ADMIN'] }, status: 'ACTIVE' },
        select: { id: true, clinicId: true },
      }),
      prisma.user.findFirst({
        where: { id: subordinateRepId, role: 'SALES_REP', status: 'ACTIVE' },
        select: { id: true, clinicId: true },
      }),
    ]);

    if (!overrideRep) {
      return NextResponse.json({ error: 'Override manager not found or not active' }, { status: 404 });
    }
    if (!subordinateRep) {
      return NextResponse.json({ error: 'Subordinate rep not found or not active' }, { status: 404 });
    }

    const targetClinicId = clinicId || overrideRep.clinicId;
    if (!targetClinicId) {
      return NextResponse.json({ error: 'Unable to determine clinic' }, { status: 400 });
    }

    // Prevent circular override: subordinate should not already be an override manager of overrideRepId
    const circular = await prisma.salesRepOverrideAssignment.findFirst({
      where: {
        clinicId: targetClinicId,
        overrideRepId: subordinateRepId,
        subordinateRepId: overrideRepId,
        isActive: true,
      },
    });

    if (circular) {
      return NextResponse.json(
        { error: 'Circular override detected: subordinate is already a manager of the override rep' },
        { status: 400 }
      );
    }

    const createFn = async () =>
      prisma.salesRepOverrideAssignment.create({
        data: {
          clinicId: targetClinicId,
          overrideRepId,
          subordinateRepId,
          overridePercentBps,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : new Date(),
          assignedById: user.id,
          notes,
        },
        include: {
          overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          subordinateRep: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      });

    let assignment;
    try {
      assignment = user.role === 'super_admin'
        ? await withoutClinicFilter(createFn)
        : await runWithClinicContext(targetClinicId, createFn);
    } catch (err: unknown) {
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        return NextResponse.json(
          { error: 'This override assignment already exists' },
          { status: 409 }
        );
      }
      throw err;
    }

    logger.info('[SalesRepOverride] Override assignment created', {
      assignmentId: assignment.id,
      overrideRepId,
      subordinateRepId,
      overridePercentBps,
      clinicId: targetClinicId,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, assignment }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/admin/sales-rep/overrides' } });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
