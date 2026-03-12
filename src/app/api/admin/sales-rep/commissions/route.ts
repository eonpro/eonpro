/**
 * Sales Rep Commission Events API
 *
 * GET  — List commission events for a sales rep (with date range, status filter)
 * POST — Manually create a commission event (admin-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter, runWithClinicContext } from '@/lib/db';
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
    const clinicFilter = searchParams.get('clinicId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const clinicId = user.role === 'super_admin'
      ? (clinicFilter ? parseInt(clinicFilter, 10) : undefined)
      : user.clinicId;

    const where: Record<string, any> = {};
    if (clinicId) where.clinicId = clinicId;
    if (salesRepId) where.salesRepId = parseInt(salesRepId, 10);
    if (status) where.status = status;
    if (startDate || endDate) {
      where.occurredAt = {};
      if (startDate) where.occurredAt.gte = new Date(startDate);
      if (endDate) {
        const ed = new Date(endDate);
        ed.setHours(23, 59, 59, 999);
        where.occurredAt.lte = ed;
      }
    }

    const runQuery = async () => {
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

      const activeWhere = { ...where };
      if (!status) {
        activeWhere.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
      }

      const summary = await prisma.salesRepCommissionEvent.aggregate({
        where: activeWhere,
        _sum: {
          commissionAmountCents: true,
          eventAmountCents: true,
          baseCommissionCents: true,
          volumeTierBonusCents: true,
          productBonusCents: true,
          multiItemBonusCents: true,
        },
        _count: true,
      });

      // Override commission events for the same filters
      const overrideWhere: Record<string, any> = {};
      if (clinicId) overrideWhere.clinicId = clinicId;
      if (salesRepId) overrideWhere.overrideRepId = parseInt(salesRepId, 10);
      if (status) overrideWhere.status = status;
      if (where.occurredAt) overrideWhere.occurredAt = where.occurredAt;

      const overrideActiveWhere = { ...overrideWhere };
      if (!status) {
        overrideActiveWhere.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
      }

      const [overrideEvents, overrideSummary] = await Promise.all([
        prisma.salesRepOverrideCommissionEvent.findMany({
          where: overrideWhere,
          orderBy: { occurredAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            overrideRep: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        }),
        prisma.salesRepOverrideCommissionEvent.aggregate({
          where: overrideActiveWhere,
          _sum: { commissionAmountCents: true, eventAmountCents: true },
          _count: true,
        }),
      ]);

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
          baseCommissionCents: summary._sum.baseCommissionCents || 0,
          volumeTierBonusCents: summary._sum.volumeTierBonusCents || 0,
          productBonusCents: summary._sum.productBonusCents || 0,
          multiItemBonusCents: summary._sum.multiItemBonusCents || 0,
        },
        overrideEvents: overrideEvents.map((e: any) => ({
          ...e,
          overrideRepName: `${e.overrideRep?.firstName || ''} ${e.overrideRep?.lastName || ''}`.trim() || e.overrideRep?.email,
          overridePercentDisplay: `${(e.overridePercentBps / 100).toFixed(2)}%`,
        })),
        overrideSummary: {
          totalEvents: overrideSummary._count,
          totalOverrideCommissionCents: overrideSummary._sum.commissionAmountCents || 0,
          totalOverrideRevenueCents: overrideSummary._sum.eventAmountCents || 0,
        },
        pagination: { limit, offset, total, hasMore: offset + limit < total },
      });
    };

    if (user.role === 'super_admin') {
      return await withoutClinicFilter(runQuery);
    }
    return await runWithClinicContext(user.clinicId!, runQuery);
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

    const createFn = async () =>
      prisma.salesRepCommissionEvent.create({
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

    const event = user.role === 'super_admin'
      ? await withoutClinicFilter(createFn)
      : await runWithClinicContext(targetClinicId, createFn);

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
