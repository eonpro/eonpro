/**
 * Super Admin Sales Rep Detail API
 *
 * Returns detailed performance data for a single sales rep (User with SALES_REP role)
 * with daily breakdown and per-ref-code performance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, withoutClinicFilter } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { serverError } from '@/lib/api/error-response';

function withSalesRepAuth(
  handler: (req: NextRequest, user: AuthUser, params: { id: string }) => Promise<Response>
) {
  return (req: NextRequest, context: { params: Promise<{ id: string }> }) => {
    return withAuth(
      async (request: NextRequest, authUser: AuthUser) => {
        const params = await context.params;
        return handler(request, authUser, params);
      },
      { roles: ['super_admin'] }
    )(req);
  };
}

function parseDateRange(req: NextRequest): { startDate: Date; endDate: Date } {
  const params = req.nextUrl.searchParams;
  const preset = params.get('preset');
  const customStart = params.get('startDate');
  const customEnd = params.get('endDate');

  const now = new Date();
  let startDate = new Date();
  let endDate = new Date();

  if (customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
    return { startDate, endDate };
  }

  switch (preset) {
    case 'today':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'yesterday':
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'this-week':
      startDate.setDate(now.getDate() - now.getDay());
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'last-week': {
      const dow = now.getDay();
      startDate.setDate(now.getDate() - dow - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - dow - 1);
      endDate.setHours(23, 59, 59, 999);
      break;
    }
    case 'last7':
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-month':
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'last-month':
      startDate.setMonth(now.getMonth() - 1);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(0);
      endDate.setHours(23, 59, 59, 999);
      break;
    case 'last30':
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'this-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case 'last-quarter': {
      const q = Math.floor(now.getMonth() / 3);
      startDate = new Date(now.getFullYear(), (q - 1) * 3, 1);
      endDate = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      break;
    }
    case 'this-semester':
      startDate = new Date(now.getFullYear(), now.getMonth() < 6 ? 0 : 6, 1);
      break;
    case 'last-semester':
      if (now.getMonth() < 6) {
        startDate = new Date(now.getFullYear() - 1, 6, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      } else {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 5, 30, 23, 59, 59, 999);
      }
      break;
    case 'this-year':
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case 'last-year':
      startDate = new Date(now.getFullYear() - 1, 0, 1);
      endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
      break;
    case 'all-time':
      startDate = new Date(2020, 0, 1);
      break;
    default:
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}

async function handler(
  req: NextRequest,
  _user: AuthUser,
  params: { id: string }
): Promise<Response> {
  const userId = parseInt(params.id, 10);
  if (isNaN(userId)) {
    return NextResponse.json({ error: 'Invalid sales rep ID' }, { status: 400 });
  }

  const { startDate, endDate } = parseDateRange(req);

  logger.security('[SalesReps] Super admin viewed sales rep detail', {
    action: 'SALES_REP_DETAIL_VIEWED',
    salesRepId: userId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  try {
    return await withoutClinicFilter(async () => {
    const days = Math.min(
      Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
      90
    );

    // Round 1: all independent queries in parallel
    const [
      rep,
      totalClicks,
      totalConversions,
      totalPatientsAssigned,
      commissionAgg,
      dailyClicks,
      dailyConversions,
    ] = await Promise.all([
      prisma.user.findFirst({
        where: { id: userId, role: 'SALES_REP' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          clinicId: true,
          createdAt: true,
          lastLogin: true,
          clinic: { select: { id: true, name: true } },
          salesRepRefCodes: {
            select: { id: true, refCode: true, isActive: true, createdAt: true },
          },
          salesRepPlanAssignments: {
            where: { effectiveTo: null },
            include: { commissionPlan: { select: { name: true, planType: true } } },
            take: 1,
            orderBy: { effectiveFrom: 'desc' },
          },
        },
      }),
      prisma.salesRepTouch.count({
        where: {
          salesRepId: userId,
          touchType: 'CLICK',
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.salesRepTouch.count({
        where: {
          salesRepId: userId,
          convertedAt: { not: null, gte: startDate, lte: endDate },
        },
      }),
      prisma.patientSalesRepAssignment.count({
        where: {
          salesRepId: userId,
          isActive: true,
          assignedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.salesRepCommissionEvent.aggregate({
        where: {
          salesRepId: userId,
          occurredAt: { gte: startDate, lte: endDate },
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
        _sum: { commissionAmountCents: true, eventAmountCents: true },
        _count: true,
      }),
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "SalesRepTouch"
        WHERE "salesRepId" = ${userId}
          AND "touchType" = 'CLICK'
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("convertedAt") as date, COUNT(*)::int as count
        FROM "SalesRepTouch"
        WHERE "salesRepId" = ${userId}
          AND "convertedAt" IS NOT NULL
          AND "convertedAt" >= ${startDate}
          AND "convertedAt" <= ${endDate}
        GROUP BY DATE("convertedAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
    ]);

    if (!rep) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    // Round 2: per-ref-code breakdown (needs rep.salesRepRefCodes)
    const refCodeStrings = rep.salesRepRefCodes.map((r) => r.refCode);
    const [clicksByCode, conversionsByCode] = await Promise.all([
      prisma.salesRepTouch.groupBy({
        by: ['refCode'],
        where: {
          refCode: { in: refCodeStrings },
          touchType: 'CLICK',
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.salesRepTouch.groupBy({
        by: ['refCode'],
        where: {
          refCode: { in: refCodeStrings },
          convertedAt: { not: null, gte: startDate, lte: endDate },
        },
        _count: true,
      }),
    ]);

    // Build daily breakdown
    const clickMap = new Map(
      dailyClicks.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
    );
    const convMap = new Map(
      dailyConversions.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
    );

    const dailyBreakdown: Array<{ date: string; clicks: number; conversions: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      dailyBreakdown.push({
        date: d.toISOString(),
        clicks: clickMap.get(key) || 0,
        conversions: convMap.get(key) || 0,
      });
    }

    // Build code performance
    const codeClickMap = new Map(clicksByCode.map((r) => [r.refCode, r._count]));
    const codeConvMap = new Map(conversionsByCode.map((r) => [r.refCode, r._count]));

    const codePerformance = rep.salesRepRefCodes.map((rc) => {
      const clicks = codeClickMap.get(rc.refCode) || 0;
      const conversions = codeConvMap.get(rc.refCode) || 0;
      return {
        id: rc.id,
        refCode: rc.refCode,
        isActive: rc.isActive,
        clicks,
        conversions,
        conversionRate: clicks > 0 ? (conversions / clicks) * 100 : 0,
      };
    });

    return NextResponse.json({
      rep: {
        id: rep.id,
        name: `${rep.firstName || ''} ${rep.lastName || ''}`.trim() || rep.email,
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        status: rep.status,
        clinicId: rep.clinicId,
        clinicName: rep.clinic?.name || null,
        createdAt: rep.createdAt,
        lastLogin: rep.lastLogin,
        currentPlan: rep.salesRepPlanAssignments[0]?.commissionPlan?.name || null,
      },
      stats: {
        totalClicks,
        totalConversions,
        patientsAssigned: totalPatientsAssigned,
        commissionEarnedCents: commissionAgg._sum.commissionAmountCents || 0,
        revenueCents: commissionAgg._sum.eventAmountCents || 0,
        commissionEvents: commissionAgg._count,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      },
      dailyBreakdown,
      codePerformance,
      dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
    }); // end withoutClinicFilter
  } catch (error) {
    logger.error('[SalesReps] Failed to fetch sales rep detail', {
      salesRepId: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to fetch sales rep detail');
  }
}

export const GET = withSalesRepAuth(handler);
