/**
 * Plan assignments: list and create (assign rep to plan with optional hourly rate)
 *
 * GET  /api/admin/sales-rep/commission-plans/[id]/assignments
 * POST /api/admin/sales-rep/commission-plans/[id]/assignments
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function getPlanAndClinic(planId: number, user: AuthUser) {
  const { basePrisma } = await import('@/lib/db');
  const plan = await basePrisma.salesRepCommissionPlan.findUnique({
    where: { id: planId },
  });
  if (!plan) return { plan: null as never, clinicId: null };
  if (user.role !== 'super_admin' && plan.clinicId !== user.clinicId) {
    return { plan: null as never, clinicId: null };
  }
  return { plan, clinicId: plan.clinicId };
}

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }
      const { plan, clinicId } = await getPlanAndClinic(planId, user);
      if (!plan || clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const assignments = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.findMany({
          where: { commissionPlanId: planId, effectiveTo: null },
          include: {
            salesRep: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      );

      return NextResponse.json({
        assignments: assignments.map((a) => ({
          id: a.id,
          salesRepId: a.salesRepId,
          salesRep: a.salesRep,
          effectiveFrom: a.effectiveFrom,
          hourlyRateCents: a.hourlyRateCents,
        })),
      });
    } catch (error) {
      logger.error('[Sales Rep Plan Assignments GET]', error);
      return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const POST = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id } = await context!.params;
      const planId = parseInt(id, 10);
      if (isNaN(planId)) {
        return NextResponse.json({ error: 'Invalid plan ID' }, { status: 400 });
      }
      const { plan, clinicId } = await getPlanAndClinic(planId, user);
      if (!plan || clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const body = await req.json();
      const { salesRepId, hourlyRateCents } = body;
      if (salesRepId == null) {
        return NextResponse.json(
          { error: 'salesRepId is required', code: 'MISSING_SALES_REP_ID' },
          { status: 400 }
        );
      }
      const repId = Number(salesRepId);
      if (!Number.isInteger(repId)) {
        return NextResponse.json({ error: 'Invalid salesRepId' }, { status: 400 });
      }
      if (hourlyRateCents !== undefined && hourlyRateCents !== null) {
        if (!Number.isInteger(Number(hourlyRateCents)) || Number(hourlyRateCents) < 0) {
          return NextResponse.json(
            { error: 'hourlyRateCents must be a non-negative integer' },
            { status: 400 }
          );
        }
      }

      // Verify rep belongs to clinic and is SALES_REP
      const rep = await runWithClinicContext(clinicId, async () =>
        prisma.user.findFirst({
          where: { id: repId, role: 'SALES_REP', clinicId },
        })
      );
      if (!rep) {
        return NextResponse.json(
          { error: 'Sales rep not found or not in this clinic', code: 'REP_NOT_FOUND' },
          { status: 400 }
        );
      }

      // End any current assignment for this rep in this clinic
      await runWithClinicContext(clinicId, async () => {
        await prisma.salesRepPlanAssignment.updateMany({
          where: { salesRepId: repId, effectiveTo: null },
          data: { effectiveTo: new Date() },
        });
      });

      const assignment = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.create({
          data: {
            clinicId,
            salesRepId: repId,
            commissionPlanId: planId,
            hourlyRateCents:
              hourlyRateCents !== undefined && hourlyRateCents !== null
                ? Number(hourlyRateCents)
                : null,
          },
          include: {
            salesRep: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        })
      );

      logger.info('[Sales Rep Plan Assignments] Created', {
        assignmentId: assignment.id,
        planId,
        salesRepId: repId,
        clinicId,
        createdBy: user.id,
      });

      return NextResponse.json({
        success: true,
        assignment: {
          id: assignment.id,
          salesRepId: assignment.salesRepId,
          salesRep: assignment.salesRep,
          effectiveFrom: assignment.effectiveFrom,
          hourlyRateCents: assignment.hourlyRateCents,
        },
      });
    } catch (error) {
      logger.error('[Sales Rep Plan Assignments POST]', error);
      return NextResponse.json({ error: 'Failed to create assignment' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
