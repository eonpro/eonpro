/**
 * Affiliate Ref Codes Stats API
 *
 * Returns detailed performance metrics for each ref code:
 * - Clicks, conversions, revenue, commission per code
 * - Conversion rate and performance trends
 *
 * Optimized: uses batch aggregation queries (GROUP BY refCode)
 * instead of per-code queries to avoid N+1 query patterns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { suppressSmallNumber } from '@/services/affiliate/reportingConstants';

async function handler(req: NextRequest, user: AuthUser): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;
  const from = searchParams.get('from');
  const to = searchParams.get('to');

  if (!user.affiliateId) {
    return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
  }

  const affiliateId = user.affiliateId;

  try {
    // Calculate date range
    const dateFrom = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = to ? new Date(to) : new Date();
    dateTo.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Get all ref codes for this affiliate
    const refCodes = await prisma.affiliateRefCode.findMany({
      where: {
        affiliateId,
        isActive: true,
      },
      select: {
        id: true,
        refCode: true,
        description: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (refCodes.length === 0) {
      return NextResponse.json({
        refCodes: [],
        totals: {
          totalCodes: 0,
          totalClicks: 0,
          totalImpressions: 0,
          totalUniqueVisitors: 0,
          totalConversions: 0,
          totalRevenueCents: 0,
          totalCommissionCents: 0,
          avgConversionRate: 0,
          avgClickThroughRate: 0,
        },
        period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      });
    }

    const codeList = refCodes.map((c) => c.refCode);

    // Run all batch aggregation queries in parallel
    const [
      clicksByCode,
      impressionsByCode,
      conversionsByCode,
      commissionsByCode,
      uniqueVisitorsByCode,
      prevPeriodClicksByCode,
      dailyBreakdown,
    ] = await Promise.all([
      // Batch: total clicks per code in date range (CLICK type only)
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          affiliateId,
          refCode: { in: codeList },
          touchType: 'CLICK',
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        _count: true,
      }),

      // Batch: impression count per code
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          affiliateId,
          refCode: { in: codeList },
          touchType: 'IMPRESSION',
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        _count: true,
      }),

      // Batch: conversions per code (convertedAt in range)
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          affiliateId,
          refCode: { in: codeList },
          convertedAt: { gte: dateFrom, lte: dateTo },
        },
        _count: true,
      }),

      // Batch: revenue and commission per code (via raw SQL for JSONB metadata filtering)
      prisma.$queryRaw<
        Array<{ refCode: string; revenueCents: number; commissionCents: number }>
      >`
        SELECT
          metadata->>'refCode' as "refCode",
          COALESCE(SUM("eventAmountCents"), 0)::int as "revenueCents",
          COALESCE(SUM("commissionAmountCents"), 0)::int as "commissionCents"
        FROM "AffiliateCommissionEvent"
        WHERE "affiliateId" = ${affiliateId}
          AND "occurredAt" >= ${dateFrom}
          AND "occurredAt" <= ${dateTo}
          AND "status" IN ('PENDING', 'APPROVED', 'PAID')
          AND metadata->>'refCode' = ANY(${codeList})
        GROUP BY metadata->>'refCode'
      `,

      // Batch: unique visitors per code (raw SQL COUNT DISTINCT)
      prisma.$queryRaw<
        Array<{ refCode: string; uniqueVisitors: number }>
      >`
        SELECT
          "refCode",
          COUNT(DISTINCT "visitorFingerprint")::int as "uniqueVisitors"
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "refCode" = ANY(${codeList})
          AND "createdAt" >= ${dateFrom}
          AND "createdAt" <= ${dateTo}
          AND "visitorFingerprint" IS NOT NULL
        GROUP BY "refCode"
      `,

      // Batch: previous period clicks for trend calculation
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          affiliateId,
          refCode: { in: codeList },
          createdAt: { gte: fourteenDaysAgo, lt: sevenDaysAgo },
        },
        _count: true,
      }),

      // Batch: daily click breakdown per code
      prisma.$queryRaw<
        Array<{ refCode: string; date: Date; clicks: number }>
      >`
        SELECT
          "refCode",
          DATE("createdAt") as date,
          COUNT(*)::int as clicks
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "refCode" = ANY(${codeList})
          AND "createdAt" >= ${dateFrom}
          AND "createdAt" <= ${dateTo}
        GROUP BY "refCode", DATE("createdAt")
        ORDER BY "refCode", date ASC
      `,
    ]);

    // Build lookup maps for O(1) per-code access
    const clicksMap = new Map(clicksByCode.map((r) => [r.refCode, r._count]));
    const impressionsMap = new Map(impressionsByCode.map((r) => [r.refCode, r._count]));
    const conversionsMap = new Map(conversionsByCode.map((r) => [r.refCode, r._count]));
    const commissionsMap = new Map(
      (commissionsByCode || []).map((r) => [r.refCode, { revenueCents: r.revenueCents, commissionCents: r.commissionCents }])
    );
    const uniqueVisitorsMap = new Map(
      (uniqueVisitorsByCode || []).map((r) => [r.refCode, r.uniqueVisitors])
    );
    const prevClicksMap = new Map(prevPeriodClicksByCode.map((r) => [r.refCode, r._count]));

    // Group daily breakdown by refCode
    const dailyMap = new Map<string, Array<{ date: string; clicks: number }>>();
    for (const row of dailyBreakdown || []) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      if (!dailyMap.has(row.refCode)) {
        dailyMap.set(row.refCode, []);
      }
      dailyMap.get(row.refCode)!.push({ date: dateStr, clicks: row.clicks });
    }

    // Assemble per-code stats from pre-aggregated data
    const refCodeStats = refCodes.map((code) => {
      const clicks = clicksMap.get(code.refCode) || 0;
      const impressions = impressionsMap.get(code.refCode) || 0;
      const uniqueVisitors = uniqueVisitorsMap.get(code.refCode) || 0;
      const conversions = conversionsMap.get(code.refCode) || 0;
      const commission = commissionsMap.get(code.refCode) || { revenueCents: 0, commissionCents: 0 };
      const prevPeriodClicks = prevClicksMap.get(code.refCode) || 0;

      const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;
      const clickThroughRate = impressions > 0
        ? ((clicks - impressions) / impressions) * 100
        : 0;

      const trend =
        prevPeriodClicks > 0
          ? ((clicks - prevPeriodClicks) / prevPeriodClicks) * 100
          : clicks > 0
            ? 100
            : 0;

      // HIPAA: suppress small conversion counts to prevent patient re-identification
      const suppressedConversions = suppressSmallNumber(conversions);
      const isSuppressed = typeof suppressedConversions === 'string';

      return {
        refCode: code.refCode,
        description: code.description,
        createdAt: code.createdAt.toISOString(),
        clicks,
        impressions,
        uniqueVisitors,
        conversions: suppressedConversions,
        conversionRate: isSuppressed ? null : conversionRate,
        clickThroughRate,
        revenueCents: isSuppressed ? null : commission.revenueCents,
        commissionCents: isSuppressed ? null : commission.commissionCents,
        trend,
        isNew: new Date(code.createdAt) > sevenDaysAgo,
        dailyBreakdown: dailyMap.get(code.refCode) || [],
      };
    });

    // Sort by conversions (highest first)
    refCodeStats.sort((a, b) => b.conversions - a.conversions);

    // Calculate totals with weighted average conversion rate
    const totalClicks = refCodeStats.reduce((sum, c) => sum + c.clicks, 0);
    const totalImpressions = refCodeStats.reduce((sum, c) => sum + c.impressions, 0);
    const totalUniqueVisitors = refCodeStats.reduce((sum, c) => sum + c.uniqueVisitors, 0);
    const totalConversions = refCodeStats.reduce((sum, c) => sum + c.conversions, 0);
    const totals = {
      totalCodes: refCodeStats.length,
      totalClicks,
      totalImpressions,
      totalUniqueVisitors,
      totalConversions,
      totalRevenueCents: refCodeStats.reduce((sum, c) => sum + c.revenueCents, 0),
      totalCommissionCents: refCodeStats.reduce((sum, c) => sum + c.commissionCents, 0),
      avgConversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
      avgClickThroughRate: totalImpressions > 0 ? ((totalClicks - totalImpressions) / totalImpressions) * 100 : 0,
    };

    return NextResponse.json({
      refCodes: refCodeStats,
      totals,
      period: {
        from: dateFrom.toISOString(),
        to: dateTo.toISOString(),
      },
    });
  } catch (error) {
    logger.error('[AffiliateRefCodeStats] Failed to fetch ref code stats', {
      affiliateId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json({ error: 'Failed to fetch ref code stats' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handler);
