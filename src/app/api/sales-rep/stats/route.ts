/**
 * Sales Rep Stats API
 *
 * GET - Returns stats for the current sales rep: assigned patient count,
 * commissions earned, and attributed revenue (from commission events).
 * Used by the home dashboard so reps see only their own performance metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, runWithClinicContext } from '@/lib/db';
import { withAuth, type AuthUser } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';

export const dynamic = 'force-dynamic';

export const GET = withAuth(
  async (_req: NextRequest, user: AuthUser) => {
    if (user.role !== 'sales_rep' || user.clinicId == null) {
      return NextResponse.json({ error: 'Sales rep clinic context required' }, { status: 403 });
    }

    try {
      const clinicId = user.clinicId;
      const salesRepId = user.id;

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const activeStatuses = {
        in: ['PENDING', 'APPROVED', 'PAID'] as ('PENDING' | 'APPROVED' | 'PAID')[],
      };

      const result = await runWithClinicContext(clinicId, async () => {
        const [
          assignedPatientCount,
          commissionAgg,
          revenueAgg7d,
          revenueAgg30d,
          overrideAgg,
          subordinateCount,
        ] = await Promise.all([
          prisma.patientSalesRepAssignment.count({
            where: { salesRepId, clinicId, isActive: true },
          }),
          prisma.salesRepCommissionEvent
            .aggregate({
              where: { salesRepId, clinicId, status: activeStatuses },
              _sum: { commissionAmountCents: true, eventAmountCents: true },
            })
            .catch(() => ({ _sum: { commissionAmountCents: null, eventAmountCents: null } })),
          prisma.salesRepCommissionEvent
            .aggregate({
              where: {
                salesRepId,
                clinicId,
                status: activeStatuses,
                occurredAt: { gte: sevenDaysAgo },
              },
              _sum: { eventAmountCents: true, commissionAmountCents: true },
            })
            .catch(() => ({ _sum: { eventAmountCents: null, commissionAmountCents: null } })),
          prisma.salesRepCommissionEvent
            .aggregate({
              where: {
                salesRepId,
                clinicId,
                status: activeStatuses,
                occurredAt: { gte: thirtyDaysAgo },
              },
              _sum: { eventAmountCents: true, commissionAmountCents: true },
            })
            .catch(() => ({ _sum: { eventAmountCents: null, commissionAmountCents: null } })),
          prisma.salesRepOverrideCommissionEvent
            .aggregate({
              where: { overrideRepId: salesRepId, clinicId, status: activeStatuses },
              _sum: { commissionAmountCents: true, eventAmountCents: true },
            })
            .catch(() => ({ _sum: { commissionAmountCents: null, eventAmountCents: null } })),
          prisma.salesRepOverrideAssignment.count({
            where: { overrideRepId: salesRepId, clinicId, isActive: true },
          }),
        ]);

        const directCommissionCents = commissionAgg._sum.commissionAmountCents || 0;
        const overrideCommissionCents = overrideAgg._sum.commissionAmountCents || 0;
        const totalRevenueCents = commissionAgg._sum.eventAmountCents || 0;
        const revenue7dCents = revenueAgg7d._sum.eventAmountCents || 0;
        const revenue30dCents = revenueAgg30d._sum.eventAmountCents || 0;

        return {
          assignedPatientCount,
          commissionsEarnedCents: directCommissionCents,
          overrideCommissionsEarnedCents: overrideCommissionCents,
          totalEarningsCents: directCommissionCents + overrideCommissionCents,
          subordinateRepCount: subordinateCount,
          revenueGeneratedCents: totalRevenueCents,
          revenueGenerated7dCents: revenue7dCents,
          revenueGenerated30dCents: revenue30dCents,
          commissions7dCents: revenueAgg7d._sum.commissionAmountCents || 0,
          commissions30dCents: revenueAgg30d._sum.commissionAmountCents || 0,
        };
      });

      return NextResponse.json(result);
    } catch (error) {
      return handleApiError(error, { context: { route: 'GET /api/sales-rep/stats' } });
    }
  },
  { roles: ['sales_rep'] }
);
