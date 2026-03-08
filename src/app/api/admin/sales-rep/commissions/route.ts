/**
 * Sales Rep Commission Events API
 *
 * GET  — List commission events for a sales rep (with date range, status filter)
 * POST — Manually create a commission event (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { handleApiError } from '@/domains/shared/errors';

const createSchema = z.object({
  salesRepId: z.number().positive(),
  eventAmountCents: z.number().min(0),
  commissionAmountCents: z.number().min(0),
  occurredAt: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
  patientId: z.number().positive().optional(),
});

async function handleGet(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const salesRepId = searchParams.get('salesRepId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const clinicId = user.role === 'super_admin' ? undefined : user.clinicId;

    const where: Record<string, any> = {};
    if (clinicId) where.clinicId = clinicId;
    if (salesRepId) where.salesRepId = parseInt(salesRepId, 10);
    if (status) where.status = status;
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate);
      if (endDate) where.occurredAt.lte = new Date(endDate);
    }

    const [events, total] = await Promise.all([
      prisma.salesRepCommissionEvent.findMany({
        where,
        orderBy: { occurredAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          salesRep: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      prisma.salesRepCommissionEvent.count({ where }),
    ]);

    const summary = await prisma.salesRepCommissionEvent.aggregate({
      where: { ...where, status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
      _sum: { commissionAmountCents: true, eventAmountCents: true },
      _count: true,
    });

    return NextResponse.json({
      events: events.map((e: any) => ({
        ...e,
        salesRepName: `${e.salesRep?.firstName || ''} ${e.salesRep?.lastName || ''}`.trim() || e.salesRep?.email,
      })),
      total,
      summary: {
        totalEvents: summary._count,
        totalCommissionCents: summary._sum.commissionAmountCents || 0,
        totalEventAmountCents: summary._sum.eventAmountCents || 0,
      },
      pagination: { limit, offset, total, hasMore: offset + limit < total },
    });
  } catch (error) {
    return handleApiError(error, { context: { route: 'GET /api/admin/sales-rep/commissions' } });
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

    const { salesRepId, eventAmountCents, commissionAmountCents, occurredAt, notes, patientId } =
      parsed.data;

    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 403 });
    }

    const rep = await prisma.user.findFirst({
      where: { id: salesRepId, role: 'SALES_REP' },
      select: { id: true, clinicId: true },
    });

    if (!rep) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    const targetClinicId = clinicId || rep.clinicId;
    if (!targetClinicId) {
      return NextResponse.json({ error: 'Unable to determine clinic' }, { status: 400 });
    }

    const event = await prisma.salesRepCommissionEvent.create({
      data: {
        clinicId: targetClinicId,
        salesRepId,
        eventAmountCents,
        commissionAmountCents,
        baseCommissionCents: commissionAmountCents,
        occurredAt: occurredAt ? new Date(occurredAt) : new Date(),
        status: 'APPROVED',
        isManual: true,
        notes,
        patientId,
        metadata: { createdBy: user.id, source: 'manual_entry' },
      },
    });

    logger.info('[SalesRepCommission] Manual commission created', {
      commissionEventId: event.id,
      salesRepId,
      clinicId: targetClinicId,
      commissionAmountCents,
      createdBy: user.id,
    });

    return NextResponse.json({ success: true, event }, { status: 201 });
  } catch (error) {
    return handleApiError(error, { context: { route: 'POST /api/admin/sales-rep/commissions' } });
  }
}

export const GET = withAuth(handleGet, { roles: ['super_admin', 'admin'] });
export const POST = withAuth(handlePost, { roles: ['super_admin', 'admin'] });
