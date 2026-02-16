/**
 * Affiliate Portal Trends API
 *
 * GET /api/affiliate/trends?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week
 *
 * Returns aggregated time-series data for the authenticated affiliate.
 * Affiliates view their own business metrics — no small-number suppression.
 *
 * @security Affiliate role only (derived from auth session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface TrendData {
  date: string;
  clicks: number;
  intakes: number;
  conversions: number;
  revenueCents: number;
  commissionCents: number;
}

export const GET = withAffiliateAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Get affiliate from user
      const affiliate = await prisma.affiliate.findUnique({
        where: { userId: user.id },
        select: { id: true, clinicId: true, status: true },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
      }

      if (affiliate.status !== 'ACTIVE') {
        return NextResponse.json({ error: 'Affiliate account is not active' }, { status: 403 });
      }

      // Parse parameters
      const { searchParams } = new URL(req.url);
      const fromStr = searchParams.get('from');
      const toStr = searchParams.get('to');
      const granularity = searchParams.get('granularity') || 'day';

      // Default to last 30 days if no dates provided
      const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : new Date();
      const fromDate = fromStr
        ? new Date(fromStr)
        : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Determine truncation function based on granularity
      const truncateInterval = granularity === 'week' ? 'week' : 'day';

      // Run all three trend queries in parallel
      const [rawClickTrends, rawIntakeTrends, rawCommissionTrends] = await Promise.all([
        // Clicks per period (touchType = CLICK only)
        prisma.$queryRaw<Array<{ period: Date; count: bigint }>>`
          SELECT
            DATE_TRUNC(${truncateInterval}, "createdAt") as period,
            COUNT(*) as count
          FROM "AffiliateTouch"
          WHERE "affiliateId" = ${affiliate.id}
            AND "touchType" = 'CLICK'
            AND "createdAt" >= ${fromDate}
            AND "createdAt" <= ${toDate}
          GROUP BY DATE_TRUNC(${truncateInterval}, "createdAt")
          ORDER BY period ASC
        `,

        // Intakes per period (patients attributed to this affiliate)
        prisma.$queryRaw<Array<{ period: Date; count: bigint }>>`
          SELECT
            DATE_TRUNC(${truncateInterval}, "createdAt") as period,
            COUNT(*) as count
          FROM "Patient"
          WHERE "attributionAffiliateId" = ${affiliate.id}
            AND "clinicId" = ${affiliate.clinicId}
            AND "createdAt" >= ${fromDate}
            AND "createdAt" <= ${toDate}
          GROUP BY DATE_TRUNC(${truncateInterval}, "createdAt")
          ORDER BY period ASC
        `,

        // Commission events per period (revenue / commissions)
        prisma.$queryRaw<
          Array<{
            period: Date;
            conversions: bigint;
            revenue_cents: bigint | null;
            commission_cents: bigint | null;
          }>
        >`
          SELECT
            DATE_TRUNC(${truncateInterval}, "occurredAt") as period,
            COUNT(*) as conversions,
            SUM("eventAmountCents") as revenue_cents,
            SUM("commissionAmountCents") as commission_cents
          FROM "AffiliateCommissionEvent"
          WHERE "affiliateId" = ${affiliate.id}
            AND "clinicId" = ${affiliate.clinicId}
            AND "status" != 'REVERSED'
            AND "occurredAt" >= ${fromDate}
            AND "occurredAt" <= ${toDate}
          GROUP BY DATE_TRUNC(${truncateInterval}, "occurredAt")
          ORDER BY period ASC
        `,
      ]);

      // Index results by date string for efficient merging
      const clickMap = new Map(
        rawClickTrends.map((r) => [r.period.toISOString().split('T')[0], Number(r.count)])
      );
      const intakeMap = new Map(
        rawIntakeTrends.map((r) => [r.period.toISOString().split('T')[0], Number(r.count)])
      );
      const commissionMap = new Map(
        rawCommissionTrends.map((r) => [
          r.period.toISOString().split('T')[0],
          {
            conversions: Number(r.conversions),
            revenueCents: Number(r.revenue_cents) || 0,
            commissionCents: Number(r.commission_cents) || 0,
          },
        ])
      );

      // Collect all unique dates from all three datasets
      const allDates = new Set<string>();
      clickMap.forEach((_, d) => allDates.add(d));
      intakeMap.forEach((_, d) => allDates.add(d));
      commissionMap.forEach((_, d) => allDates.add(d));

      // Merge into unified trend data
      const mergedTrends: TrendData[] = Array.from(allDates)
        .sort()
        .map((date) => {
          const commission = commissionMap.get(date);
          return {
            date,
            clicks: clickMap.get(date) || 0,
            intakes: intakeMap.get(date) || 0,
            conversions: commission?.conversions || 0,
            revenueCents: commission?.revenueCents || 0,
            commissionCents: commission?.commissionCents || 0,
          };
        });

      // Fill in missing dates with zeros (only for daily granularity)
      const filledTrends: TrendData[] = [];
      if (granularity === 'day') {
        const trendMap = new Map(mergedTrends.map((t) => [t.date, t]));
        const currentDate = new Date(fromDate);

        while (currentDate <= toDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          filledTrends.push(
            trendMap.get(dateStr) || {
              date: dateStr,
              clicks: 0,
              intakes: 0,
              conversions: 0,
              revenueCents: 0,
              commissionCents: 0,
            }
          );
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        filledTrends.push(...mergedTrends);
      }

      const finalTrends = granularity === 'day' ? filledTrends : mergedTrends;

      const totals = finalTrends.reduce(
        (acc, t) => ({
          clicks: acc.clicks + t.clicks,
          intakes: acc.intakes + t.intakes,
          conversions: acc.conversions + t.conversions,
          revenueCents: acc.revenueCents + t.revenueCents,
          commissionCents: acc.commissionCents + t.commissionCents,
        }),
        { clicks: 0, intakes: 0, conversions: 0, revenueCents: 0, commissionCents: 0 }
      );

      return NextResponse.json({
        trends: finalTrends,
        totals,
        granularity,
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
      });
    } catch (error) {
      logger.error('[Affiliate Trends] Error fetching trends', error);
      return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
    }
  }
);
