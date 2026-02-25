/**
 * PATCH assignment (hourly rate), DELETE (end assignment)
 *
 * PATCH  /api/admin/sales-rep/commission-plans/[id]/assignments/[assignmentId]
 * DELETE /api/admin/sales-rep/commission-plans/[id]/assignments/[assignmentId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string; assignmentId: string }>;
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

export const PATCH = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id, assignmentId } = await context!.params;
      const planId = parseInt(id, 10);
      const aid = parseInt(assignmentId, 10);
      if (isNaN(planId) || isNaN(aid)) {
        return NextResponse.json({ error: 'Invalid plan or assignment ID' }, { status: 400 });
      }
      const { clinicId } = await getPlanAndClinic(planId, user);
      if (clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const body = await req.json();
      const { hourlyRateCents } = body;
      if (hourlyRateCents !== undefined && hourlyRateCents !== null) {
        if (!Number.isInteger(Number(hourlyRateCents)) || Number(hourlyRateCents) < 0) {
          return NextResponse.json(
            { error: 'hourlyRateCents must be a non-negative integer' },
            { status: 400 }
          );
        }
      }

      const assignment = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.findFirst({
          where: { id: aid, commissionPlanId: planId, effectiveTo: null },
        })
      );
      if (!assignment) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }

      const updated = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.update({
          where: { id: aid },
          data: { hourlyRateCents: hourlyRateCents ?? undefined },
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

      return NextResponse.json({
        success: true,
        assignment: {
          id: updated.id,
          salesRepId: updated.salesRepId,
          salesRep: updated.salesRep,
          effectiveFrom: updated.effectiveFrom,
          hourlyRateCents: updated.hourlyRateCents,
        },
      });
    } catch (error) {
      logger.error('[Sales Rep Plan Assignment PATCH]', error);
      return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);

export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id, assignmentId } = await context!.params;
      const planId = parseInt(id, 10);
      const aid = parseInt(assignmentId, 10);
      if (isNaN(planId) || isNaN(aid)) {
        return NextResponse.json({ error: 'Invalid plan or assignment ID' }, { status: 400 });
      }
      const { clinicId } = await getPlanAndClinic(planId, user);
      if (clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const assignment = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.findFirst({
          where: { id: aid, commissionPlanId: planId, effectiveTo: null },
        })
      );
      if (!assignment) {
        return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
      }

      await runWithClinicContext(clinicId, async () =>
        prisma.salesRepPlanAssignment.update({
          where: { id: aid },
          data: { effectiveTo: new Date() },
        })
      );

      logger.info('[Sales Rep Plan Assignment] Ended', {
        assignmentId: aid,
        planId,
        endedBy: user.id,
      });

      return NextResponse.json({ success: true, message: 'Assignment ended' });
    } catch (error) {
      logger.error('[Sales Rep Plan Assignment DELETE]', error);
      return NextResponse.json({ error: 'Failed to end assignment' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
