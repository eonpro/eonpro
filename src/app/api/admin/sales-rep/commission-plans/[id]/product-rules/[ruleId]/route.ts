/**
 * DELETE a product/package commission rule
 *
 * DELETE /api/admin/sales-rep/commission-plans/[id]/product-rules/[ruleId]
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string; ruleId: string }>;
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

export const DELETE = withAuth(
  async (req: NextRequest, user: AuthUser, context?: RouteContext) => {
    try {
      const { id, ruleId } = await context!.params;
      const planId = parseInt(id, 10);
      const rid = parseInt(ruleId, 10);
      if (isNaN(planId) || isNaN(rid)) {
        return NextResponse.json({ error: 'Invalid plan or rule ID' }, { status: 400 });
      }
      const { clinicId } = await getPlanAndClinic(planId, user);
      if (clinicId == null) {
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
      }

      const rule = await runWithClinicContext(clinicId, async () =>
        prisma.salesRepProductCommission.findFirst({
          where: { id: rid, planId },
        })
      );
      if (!rule) {
        return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
      }

      await runWithClinicContext(clinicId, async () =>
        prisma.salesRepProductCommission.delete({
          where: { id: rid },
        })
      );

      logger.info('[Sales Rep Product Rules] Deleted', { ruleId: rid, planId, deletedBy: user.id });
      return NextResponse.json({ success: true, message: 'Rule deleted' });
    } catch (error) {
      logger.error('[Sales Rep Product Rule DELETE]', error);
      return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }
  },
  { roles: ['super_admin', 'admin'] }
);
