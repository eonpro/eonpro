/**
 * Admin Affiliate Reports API
 *
 * Returns aggregate affiliate performance data:
 * - Overview stats (total affiliates, conversions, revenue, commissions)
 * - Top performing affiliates
 * - Daily trends
 * - Fraud alerts summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface ReportData {
  overview: {
    totalAffiliates: number;
    activeAffiliates: number;
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    pendingPayoutCents: number;
  };
  topAffiliates: Array<{
    id: number;
    name: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  trends: Array<{
    date: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  fraud: {
    openAlerts: number;
    criticalAlerts: number;
    confirmedFraudCents: number;
  };
}

async function handler(req: NextRequest, user: any): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;
  const period = searchParams.get('period') || '30d';

  // HIPAA audit: log admin access to affiliate data
  logger.security('[AffiliateAudit] Admin accessed affiliate reports', {
    adminUserId: user.id,
    adminRole: user.role,
    route: req.nextUrl.pathname,
    clinicId: user.clinicId,
    period,
  });

  try {
    // Determine clinic filter based on user role
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    // Calculate date range
    let dateFrom: Date;
    const dateTo = new Date();

    switch (period) {
      case '7d':
        dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '90d':
        dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 90);
        break;
      case 'ytd':
        dateFrom = new Date(dateTo.getFullYear(), 0, 1);
        break;
      default: // 30d
        dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get affiliate counts
    const [totalAffiliates, activeAffiliates] = await Promise.all([
      prisma.affiliate.count({ where: clinicFilter }),
      prisma.affiliate.count({ where: { ...clinicFilter, status: 'ACTIVE' } }),
    ]);

    // Get conversion data from AffiliateTouch
    const totalConversions = await prisma.affiliateTouch.count({
      where: {
        ...clinicFilter,
        convertedAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
    });

    // Get revenue and commission from modern system
    // Use occurredAt for date alignment with conversions (convertedAt)
    const commissionAgg = await prisma.affiliateCommissionEvent.aggregate({
      where: {
        ...clinicFilter,
        occurredAt: {
          gte: dateFrom,
          lte: dateTo,
        },
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      },
      _sum: {
        eventAmountCents: true,
        commissionAmountCents: true,
      },
    });

    // Get pending payouts
    const pendingPayouts = await prisma.affiliateCommissionEvent.aggregate({
      where: {
        ...clinicFilter,
        status: 'APPROVED',
      },
      _sum: {
        commissionAmountCents: true,
      },
    });

    // Get top affiliates with their commission events in the period
    const topModernAffiliates = await prisma.affiliate.findMany({
      where: { ...clinicFilter, status: 'ACTIVE' },
      include: {
        commissionEvents: {
          where: {
            occurredAt: { gte: dateFrom, lte: dateTo },
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
        },
        _count: {
          select: { commissionEvents: true },
        },
      },
      take: 10,
    });

    type ModernAffiliate = (typeof topModernAffiliates)[number];
    type ModernCommissionEvent = ModernAffiliate['commissionEvents'][number];

    const topAffiliates = topModernAffiliates
      .map((a: ModernAffiliate) => ({
        id: a.id,
        name: a.displayName,
        conversions: a.commissionEvents.length,
        revenueCents: a.commissionEvents.reduce(
          (sum: number, e: ModernCommissionEvent) => sum + (e.eventAmountCents || 0),
          0
        ),
        commissionCents: a.commissionEvents.reduce(
          (sum: number, e: ModernCommissionEvent) => sum + (e.commissionAmountCents || 0),
          0
        ),
      }))
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 5);

    // Get daily trends using a single batch query instead of sequential loop
    const daysInPeriod = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000));
    const trendDays = Math.min(daysInPeriod, 14);
    const trendStart = new Date(dateTo);
    trendStart.setDate(trendStart.getDate() - (trendDays - 1));
    trendStart.setHours(0, 0, 0, 0);

    const [conversionTrends, commissionTrends] = await Promise.all([
      // Batch conversions by day
      prisma.$queryRaw`
        SELECT
          DATE("convertedAt") as date,
          COUNT(*)::int as conversions
        FROM "AffiliateTouch"
        WHERE "convertedAt" >= ${trendStart}
          AND "convertedAt" <= ${dateTo}
          ${user.role !== 'super_admin' && user.clinicId ? prisma.$queryRaw`AND "clinicId" = ${user.clinicId}` : prisma.$queryRaw``}
        GROUP BY DATE("convertedAt")
        ORDER BY date ASC
      ` as Promise<Array<{ date: Date; conversions: number }>>,

      // Batch commissions by day
      prisma.$queryRaw`
        SELECT
          DATE("occurredAt") as date,
          COALESCE(SUM("eventAmountCents"), 0)::int as "revenueCents",
          COALESCE(SUM("commissionAmountCents"), 0)::int as "commissionCents"
        FROM "AffiliateCommissionEvent"
        WHERE "occurredAt" >= ${trendStart}
          AND "occurredAt" <= ${dateTo}
          AND "status" IN ('PENDING', 'APPROVED', 'PAID')
          ${user.role !== 'super_admin' && user.clinicId ? prisma.$queryRaw`AND "clinicId" = ${user.clinicId}` : prisma.$queryRaw``}
        GROUP BY DATE("occurredAt")
        ORDER BY date ASC
      ` as Promise<Array<{ date: Date; revenueCents: number; commissionCents: number }>>,
    ]);

    // Build trends array with all days filled in
    const conversionMap = new Map<string, number>();
    for (const row of conversionTrends || []) {
      const key = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      conversionMap.set(key, row.conversions);
    }

    const commissionMap = new Map<string, { revenueCents: number; commissionCents: number }>();
    for (const row of commissionTrends || []) {
      const key = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      commissionMap.set(key, { revenueCents: row.revenueCents, commissionCents: row.commissionCents });
    }

    const trends: ReportData['trends'] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const day = new Date(dateTo);
      day.setDate(day.getDate() - i);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString().split('T')[0];

      trends.push({
        date: day.toISOString(),
        conversions: conversionMap.get(key) || 0,
        revenueCents: commissionMap.get(key)?.revenueCents || 0,
        commissionCents: commissionMap.get(key)?.commissionCents || 0,
      });
    }

    // Get fraud alerts (if fraud detection table exists)
    let fraudData = {
      openAlerts: 0,
      criticalAlerts: 0,
      confirmedFraudCents: 0,
    };

    try {
      const fraudAlerts = await prisma.affiliateFraudAlert.groupBy({
        by: ['status', 'severity'],
        where: {
          ...clinicFilter,
          status: { in: ['OPEN', 'INVESTIGATING'] },
        },
        _count: true,
      });

      type FraudAlert = (typeof fraudAlerts)[number];
      fraudData.openAlerts = fraudAlerts.reduce((sum: number, a: FraudAlert) => sum + a._count, 0);
      fraudData.criticalAlerts = fraudAlerts
        .filter((a: FraudAlert) => a.severity === 'CRITICAL')
        .reduce((sum: number, a: FraudAlert) => sum + a._count, 0);
    } catch {
      // Fraud table may not exist - ignore
    }

    const response: ReportData = {
      overview: {
        totalAffiliates,
        activeAffiliates,
        totalConversions,
        totalRevenueCents: commissionAgg._sum.eventAmountCents || 0,
        totalCommissionCents: commissionAgg._sum.commissionAmountCents || 0,
        pendingPayoutCents: pendingPayouts._sum.commissionAmountCents || 0,
      },
      topAffiliates,
      trends,
      fraud: fraudData,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[AffiliateReports] Failed to fetch reports', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to fetch affiliate reports' }, { status: 500 });
  }
}

export const GET = withAdminAuth(handler);
