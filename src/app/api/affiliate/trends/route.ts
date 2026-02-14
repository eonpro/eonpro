/**
 * Affiliate Portal Trends API
 *
 * GET /api/affiliate/trends?from=YYYY-MM-DD&to=YYYY-MM-DD&granularity=day|week
 *
 * Returns aggregated time-series data for the authenticated affiliate.
 * HIPAA-COMPLIANT: Applies small-number suppression (< 5 = "<5")
 *
 * @security Affiliate role only (derived from auth session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

// Small number threshold for HIPAA compliance
const SMALL_NUMBER_THRESHOLD = 5;

interface TrendData {
  date: string;
  conversions: number | string;
  revenueCents: number | null;
  commissionCents: number | null;
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

      // Get aggregated trends using raw query for date truncation
      const rawTrends = await prisma.$queryRaw<
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
    `;

      // Apply small-number suppression for HIPAA compliance
      const trends: TrendData[] = rawTrends.map(
        (row: {
          period: Date;
          conversions: bigint;
          revenue_cents: bigint | null;
          commission_cents: bigint | null;
        }) => {
          const conversionCount = Number(row.conversions);
          const isSuppressed = conversionCount < SMALL_NUMBER_THRESHOLD && conversionCount > 0;

          return {
            date: row.period.toISOString().split('T')[0],
            conversions: isSuppressed ? '<5' : conversionCount,
            revenueCents: isSuppressed ? null : Number(row.revenue_cents) || 0,
            commissionCents: isSuppressed ? null : Number(row.commission_cents) || 0,
          };
        }
      );

      // Fill in missing dates with zeros (only for daily granularity)
      const filledTrends: TrendData[] = [];
      if (granularity === 'day') {
        const trendMap = new Map(trends.map((t) => [t.date, t]));
        const currentDate = new Date(fromDate);

        while (currentDate <= toDate) {
          const dateStr = currentDate.toISOString().split('T')[0];
          filledTrends.push(
            trendMap.get(dateStr) || {
              date: dateStr,
              conversions: 0,
              revenueCents: 0,
              commissionCents: 0,
            }
          );
          currentDate.setDate(currentDate.getDate() + 1);
        }
      } else {
        filledTrends.push(...trends);
      }

      // Calculate totals (excluding suppressed values)
      const totals = trends.reduce(
        (acc, t) => {
          if (typeof t.conversions === 'number') {
            acc.conversions += t.conversions;
            acc.revenueCents += t.revenueCents || 0;
            acc.commissionCents += t.commissionCents || 0;
          }
          return acc;
        },
        { conversions: 0, revenueCents: 0, commissionCents: 0 }
      );

      return NextResponse.json({
        trends: granularity === 'day' ? filledTrends : trends,
        totals,
        granularity,
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        },
        suppressionNote:
          'Values with fewer than 5 conversions are displayed as "<5" for privacy protection.',
      });
    } catch (error) {
      logger.error('[Affiliate Trends] Error fetching trends', error);
      return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
    }
  }
);
