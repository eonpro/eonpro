/**
 * Super Admin Sales Rep Detail API
 *
 * Returns detailed performance data for a single affiliate/sales rep
 * with daily breakdown for the selected period.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { ACTIVE_COMMISSION_STATUSES, CLICK_FILTER } from '@/services/affiliate/reportingConstants';
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
      const dayOfWeek = now.getDay();
      startDate.setDate(now.getDate() - dayOfWeek - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate.setDate(now.getDate() - dayOfWeek - 1);
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
  const affiliateId = parseInt(params.id, 10);

  if (isNaN(affiliateId)) {
    return NextResponse.json({ error: 'Invalid affiliate ID' }, { status: 400 });
  }

  const { startDate, endDate } = parseDateRange(req);

  logger.security('[SalesReps] Super admin viewed sales rep detail', {
    action: 'SALES_REP_DETAIL_VIEWED',
    affiliateId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });

  try {
    // Round 1: affiliate lookup + all aggregate stats + daily breakdown in parallel.
    // Only the per-ref-code breakdown needs affiliate.refCodes from the lookup,
    // so everything else can fire concurrently.
    const days = Math.min(
      Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
      90
    );

    const [
      affiliate,
      totalClicks,
      totalConversions,
      commissionAgg,
      dailyClicks,
      dailyConversions,
      dailyCommissions,
    ] = await Promise.all([
      prisma.affiliate.findUnique({
        where: { id: affiliateId },
        select: {
          id: true,
          displayName: true,
          status: true,
          createdAt: true,
          clinicId: true,
          clinic: { select: { id: true, name: true } },
          user: { select: { email: true, firstName: true, lastName: true, lastLogin: true } },
          refCodes: {
            select: { id: true, refCode: true, isActive: true, createdAt: true },
          },
          planAssignments: {
            where: { isActive: true },
            include: { plan: { select: { name: true, planType: true } } },
            take: 1,
          },
        },
      }),
      prisma.affiliateTouch.count({
        where: {
          affiliateId,
          ...CLICK_FILTER,
          createdAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.affiliateTouch.count({
        where: {
          affiliateId,
          convertedAt: { gte: startDate, lte: endDate },
        },
      }),
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          occurredAt: { gte: startDate, lte: endDate },
          status: { in: ACTIVE_COMMISSION_STATUSES as any },
        },
        _sum: { eventAmountCents: true, commissionAmountCents: true },
        _count: true,
      }),
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("createdAt") as date, COUNT(*)::int as count
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "touchType" = 'CLICK'
          AND "createdAt" >= ${startDate}
          AND "createdAt" <= ${endDate}
        GROUP BY DATE("createdAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("convertedAt") as date, COUNT(*)::int as count
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "convertedAt" IS NOT NULL
          AND "convertedAt" >= ${startDate}
          AND "convertedAt" <= ${endDate}
        GROUP BY DATE("convertedAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
      prisma.$queryRaw<Array<{ date: Date; revenue: number; commission: number }>>`
        SELECT
          DATE("occurredAt") as date,
          COALESCE(SUM("eventAmountCents"), 0)::int as revenue,
          COALESCE(SUM("commissionAmountCents"), 0)::int as commission
        FROM "AffiliateCommissionEvent"
        WHERE "affiliateId" = ${affiliateId}
          AND "occurredAt" >= ${startDate}
          AND "occurredAt" <= ${endDate}
          AND status IN ('PENDING', 'APPROVED', 'PAID')
        GROUP BY DATE("occurredAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; revenue: number; commission: number }>),
    ]);

    if (!affiliate) {
      return NextResponse.json({ error: 'Sales rep not found' }, { status: 404 });
    }

    const clickMap = new Map(
      dailyClicks.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
    );
    const convMap = new Map(
      dailyConversions.map((r) => [new Date(r.date).toISOString().slice(0, 10), r.count])
    );
    const commMap = new Map(
      dailyCommissions.map((r) => [
        new Date(r.date).toISOString().slice(0, 10),
        { revenue: r.revenue, commission: r.commission },
      ])
    );

    const dailyBreakdown: Array<{
      date: string;
      clicks: number;
      conversions: number;
      revenueCents: number;
      commissionCents: number;
    }> = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const cm = commMap.get(key);
      dailyBreakdown.push({
        date: d.toISOString(),
        clicks: clickMap.get(key) || 0,
        conversions: convMap.get(key) || 0,
        revenueCents: cm?.revenue || 0,
        commissionCents: cm?.commission || 0,
      });
    }

    // Round 2: per-ref-code breakdown (needs affiliate.refCodes from round 1)
    const refCodeStrings = affiliate.refCodes.map((r) => r.refCode);
    const [clicksByCode, conversionsByCode] = await Promise.all([
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          refCode: { in: refCodeStrings },
          ...CLICK_FILTER,
          createdAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          refCode: { in: refCodeStrings },
          convertedAt: { gte: startDate, lte: endDate },
        },
        _count: true,
      }),
    ]);

    const codeClickMap = new Map(clicksByCode.map((r) => [r.refCode, r._count]));
    const codeConvMap = new Map(conversionsByCode.map((r) => [r.refCode, r._count]));

    const codePerformance = affiliate.refCodes.map((rc) => {
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
      affiliate: {
        id: affiliate.id,
        displayName: affiliate.displayName,
        status: affiliate.status,
        createdAt: affiliate.createdAt,
        clinicId: affiliate.clinicId,
        clinicName: affiliate.clinic.name,
        email: affiliate.user.email,
        firstName: affiliate.user.firstName,
        lastName: affiliate.user.lastName,
        lastLogin: affiliate.user.lastLogin,
        currentPlan: affiliate.planAssignments[0]?.plan?.name || null,
      },
      stats: {
        totalClicks,
        totalConversions,
        totalRevenueCents: commissionAgg._sum.eventAmountCents || 0,
        totalCommissionCents: commissionAgg._sum.commissionAmountCents || 0,
        conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      },
      dailyBreakdown,
      codePerformance,
      dateRange: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
    });
  } catch (error) {
    logger.error('[SalesReps] Failed to fetch sales rep detail', {
      affiliateId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return serverError('Failed to fetch sales rep detail');
  }
}

export const GET = withSalesRepAuth(handler);
