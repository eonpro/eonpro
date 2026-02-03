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
    });

    // Define affiliate type
    type AffiliateWithRefCodes = {
      id: number;
      displayName: string;
      status: string;
      refCodes: Array<{ refCode: string }>;
    };

    // Get performance metrics for each affiliate
    const affiliateMetrics = await Promise.all(
      affiliates.map(async (affiliate: AffiliateWithRefCodes) => {
        const refCodes = affiliate.refCodes.map((rc: { refCode: string }) => rc.refCode);

        // Get clicks
        const clicksResult = await prisma.affiliateTouch.aggregate({
          where: {
            affiliateId: affiliate.id,
            ...clinicFilter,
            createdAt: { gte: dateFrom },
          },
          _count: true,
        });

        // Get conversions
        const conversionsResult = await prisma.affiliateTouch.aggregate({
          where: {
            affiliateId: affiliate.id,
            ...clinicFilter,
            convertedAt: { gte: dateFrom },
          },
          _count: true,
        });

        // Get revenue
        const revenueResult = await prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId: affiliate.id,
            ...clinicFilter,
            createdAt: { gte: dateFrom },
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
          _sum: {
            eventAmountCents: true,
          },
        });

        const clicks = clicksResult._count;
        const conversions = conversionsResult._count;
        const revenue = revenueResult._sum.eventAmountCents || 0;
        const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

        return {
          affiliateId: affiliate.id,
          displayName: affiliate.displayName,
          status: affiliate.status,
          refCodes,
          clicks,
          conversions,
          revenue,
          conversionRate,
        };
      })
    );

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

    return NextResponse.json(
      { error: 'Failed to fetch leaderboard data' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handler);
