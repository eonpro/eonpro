/**
 * Admin Affiliate Leaderboard API
 *
 * Returns ranked affiliates by various metrics:
 * - Most Conversions
 * - Highest Revenue
 * - Most Code Uses (Clicks)
 * - Best Conversion Rate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { suppressSmallNumber } from '@/services/affiliate/reportingConstants';

type LeaderboardMetric = 'conversions' | 'revenue' | 'clicks' | 'conversionRate';

interface LeaderboardEntry {
  rank: number;
  affiliateId: number;
  displayName: string;
  status: string;
  value: number;
  formattedValue: string;
  refCodes: string[];
  percentOfTotal: number;
}

interface LeaderboardResponse {
  metric: LeaderboardMetric;
  period: string;
  entries: LeaderboardEntry[];
  totals: {
    totalAffiliates: number;
    totalValue: number;
  };
}

async function handler(req: NextRequest, user: any): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;

  const metric = (searchParams.get('metric') || 'conversions') as LeaderboardMetric;
  const period = searchParams.get('period') || '30d';
  const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 50);

  // HIPAA audit: log admin access to affiliate leaderboard
  logger.security('[AffiliateAudit] Admin accessed affiliate leaderboard', {
    adminUserId: user.id,
    adminRole: user.role,
    route: req.nextUrl.pathname,
    clinicId: user.clinicId,
    metric,
  });

  try {
    // Determine clinic filter based on user role
    const clinicFilter = user.role === 'super_admin' ? {} : { clinicId: user.clinicId };

    // Calculate date range
    let dateFrom: Date = new Date();
    switch (period) {
      case '7d':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '30d':
        dateFrom.setDate(dateFrom.getDate() - 30);
        break;
      case '90d':
        dateFrom.setDate(dateFrom.getDate() - 90);
        break;
      case 'ytd':
        dateFrom = new Date(dateFrom.getFullYear(), 0, 1);
        break;
      case 'all':
        dateFrom = new Date(2020, 0, 1);
        break;
      default:
        dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get all affiliates with their ref codes
    const affiliates = await prisma.affiliate.findMany({
      where: {
        ...clinicFilter,
        status: 'ACTIVE',
      },
      include: {
        refCodes: {
          where: { isActive: true },
          select: { refCode: true },
        },
      },
      take: 100,
    });

    // Define affiliate type
    type AffiliateWithRefCodes = {
      id: number;
      displayName: string;
      status: string;
      refCodes: Array<{ refCode: string }>;
    };

    // Batch aggregation queries — eliminates N+1 pattern (3 queries total instead of 3*N)
    const affiliateIds = affiliates.map((a: AffiliateWithRefCodes) => a.id);

    const [clicksByAffiliate, conversionsByAffiliate, revenueByAffiliate] = await Promise.all([
      // Batch: clicks by affiliate (CLICK type only)
      prisma.affiliateTouch.groupBy({
        by: ['affiliateId'],
        where: {
          affiliateId: { in: affiliateIds },
          ...clinicFilter,
          touchType: 'CLICK',
          createdAt: { gte: dateFrom },
        },
        _count: true,
      }),
      // Batch: conversions by affiliate (convertedAt in range)
      prisma.affiliateTouch.groupBy({
        by: ['affiliateId'],
        where: {
          affiliateId: { in: affiliateIds },
          ...clinicFilter,
          convertedAt: { gte: dateFrom },
        },
        _count: true,
      }),
      // Batch: revenue by affiliate (use occurredAt for accurate period-based revenue)
      prisma.$queryRaw<
        Array<{ affiliateId: number; revenueCents: number }>
      >`
        SELECT
          "affiliateId",
          COALESCE(SUM("eventAmountCents"), 0)::int as "revenueCents"
        FROM "AffiliateCommissionEvent"
        WHERE "affiliateId" = ANY(${affiliateIds})
          AND "occurredAt" >= ${dateFrom}
          AND "status" IN ('PENDING', 'APPROVED', 'PAID')
          ${clinicFilter.clinicId ? prisma.$queryRaw`AND "clinicId" = ${clinicFilter.clinicId}` : prisma.$queryRaw``}
        GROUP BY "affiliateId"
      `,
    ]);

    // Build lookup maps for O(1) per-affiliate access
    const clicksMap = new Map(clicksByAffiliate.map((r) => [r.affiliateId, r._count]));
    const conversionsMap = new Map(conversionsByAffiliate.map((r) => [r.affiliateId, r._count]));
    const revenueMap = new Map((revenueByAffiliate || []).map((r) => [r.affiliateId, r.revenueCents]));

    const affiliateMetrics = affiliates.map((affiliate: AffiliateWithRefCodes) => {
      const refCodes = affiliate.refCodes.map((rc: { refCode: string }) => rc.refCode);
      const clicks = clicksMap.get(affiliate.id) || 0;
      const conversions = conversionsMap.get(affiliate.id) || 0;
      const revenue = revenueMap.get(affiliate.id) || 0;
      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

      // HIPAA: suppress small conversion counts
      const suppressedConversions = suppressSmallNumber(conversions);
      const isSuppressed = typeof suppressedConversions === 'string';

      return {
        affiliateId: affiliate.id,
        displayName: affiliate.displayName,
        status: affiliate.status,
        refCodes,
        clicks,
        conversions: suppressedConversions,
        revenue: isSuppressed ? null : revenue,
        conversionRate: isSuppressed ? null : conversionRate,
      };
    });

    // Sort by selected metric
    const sortedAffiliates = affiliateMetrics.sort((a, b) => {
      switch (metric) {
        case 'clicks':
          return b.clicks - a.clicks;
        case 'conversions':
          return b.conversions - a.conversions;
        case 'revenue':
          return b.revenue - a.revenue;
        case 'conversionRate':
          return b.conversionRate - a.conversionRate;
        default:
          return b.conversions - a.conversions;
      }
    });

    // Calculate totals
    const totalValue = sortedAffiliates.reduce((sum, a) => {
      switch (metric) {
        case 'clicks':
          return sum + a.clicks;
        case 'conversions':
          return sum + a.conversions;
        case 'revenue':
          return sum + a.revenue;
        case 'conversionRate':
          return sum + a.conversionRate;
        default:
          return sum + a.conversions;
      }
    }, 0);

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = sortedAffiliates.slice(0, limit).map((affiliate, index) => {
      let value: number;
      let formattedValue: string;

      switch (metric) {
        case 'clicks':
          value = affiliate.clicks;
          formattedValue = value.toLocaleString();
          break;
        case 'conversions':
          value = affiliate.conversions;
          formattedValue = value.toLocaleString();
          break;
        case 'revenue':
          value = affiliate.revenue;
          formattedValue = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
          }).format(value / 100);
          break;
        case 'conversionRate':
          value = affiliate.conversionRate;
          formattedValue = `${value.toFixed(1)}%`;
          break;
        default:
          value = affiliate.conversions;
          formattedValue = value.toLocaleString();
      }

      return {
        rank: index + 1,
        affiliateId: affiliate.affiliateId,
        displayName: affiliate.displayName,
        status: affiliate.status,
        value,
        formattedValue,
        refCodes: affiliate.refCodes,
        percentOfTotal: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    });

    const response: LeaderboardResponse = {
      metric,
      period,
      entries,
      totals: {
        totalAffiliates: affiliates.length,
        totalValue,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[Leaderboard] Failed to fetch leaderboard', {
      userId: user.id,
      metric,
      period,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to fetch leaderboard data' }, { status: 500 });
  }
}

export const GET = withAdminAuth(handler);
