/**
 * Affiliate Ref Codes Stats API
 *
 * Returns detailed performance metrics for each ref code:
 * - Clicks, conversions, revenue, commission per code
 * - Conversion rate and performance trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, type AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

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
    });

    // Get stats for each ref code
    const refCodeStats = await Promise.all(
      refCodes.map(async (code: { id: number; refCode: string; description: string | null; createdAt: Date }) => {
        // Get clicks (touches) in date range
        const clicksResult = await prisma.affiliateTouch.aggregate({
          where: {
            refCode: code.refCode,
            affiliateId,
            createdAt: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          _count: true,
        });

        // Get conversions (touches that converted) in date range
        const conversionsResult = await prisma.affiliateTouch.aggregate({
          where: {
            refCode: code.refCode,
            affiliateId,
            convertedAt: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          _count: true,
        });

        // Get revenue and commission from commission events
        const commissionResult = await prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId,
            createdAt: {
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

        // Get daily trend for this code (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Calculate trend (comparing last 7 days to previous 7 days)
        const prevPeriodClicks = await prisma.affiliateTouch.count({
          where: {
            refCode: code.refCode,
            affiliateId,
            createdAt: {
              gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
              lt: sevenDaysAgo,
            },
          },
        });

        const recentClicks = clicksResult._count;
        const trend = prevPeriodClicks > 0
          ? ((recentClicks - prevPeriodClicks) / prevPeriodClicks) * 100
          : recentClicks > 0 ? 100 : 0;

        const clicks = clicksResult._count;
        const conversions = conversionsResult._count;
        const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

        return {
          refCode: code.refCode,
          description: code.description,
          createdAt: code.createdAt.toISOString(),
          clicks,
          conversions,
          conversionRate,
          revenueCents: commissionResult._sum.eventAmountCents || 0,
          commissionCents: commissionResult._sum.commissionAmountCents || 0,
          trend,
          isNew: new Date(code.createdAt) > sevenDaysAgo,
        };
      })
    );

    // Sort by conversions (highest first)
    refCodeStats.sort((a, b) => b.conversions - a.conversions);

    // Calculate totals
    const totals = {
      totalCodes: refCodeStats.length,
      totalClicks: refCodeStats.reduce((sum, c) => sum + c.clicks, 0),
      totalConversions: refCodeStats.reduce((sum, c) => sum + c.conversions, 0),
      totalRevenueCents: refCodeStats.reduce((sum, c) => sum + c.revenueCents, 0),
      totalCommissionCents: refCodeStats.reduce((sum, c) => sum + c.commissionCents, 0),
      avgConversionRate: refCodeStats.length > 0
        ? refCodeStats.reduce((sum, c) => sum + c.conversionRate, 0) / refCodeStats.length
        : 0,
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

    return NextResponse.json(
      { error: 'Failed to fetch ref code stats' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handler);
