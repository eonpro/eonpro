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

  try {
    // Determine clinic filter based on user role
    const clinicFilter = user.role === 'super_admin'
      ? {}
      : user.clinicId
        ? { clinicId: user.clinicId }
        : {};

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
        dateFrom = new Date(dateTo.getFullYear(), 0, 1); // Jan 1 of current year
        break;
      default: // 30d
        dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get affiliate counts from modern system
    const [totalAffiliates, activeAffiliates] = await Promise.all([
      prisma.affiliate.count({ where: clinicFilter }),
      prisma.affiliate.count({ where: { ...clinicFilter, status: 'ACTIVE' } }),
    ]);

    // Get legacy influencer counts
    const [legacyTotal, legacyActive] = await Promise.all([
      prisma.influencer.count({ where: clinicFilter }),
      prisma.influencer.count({ where: { ...clinicFilter, status: 'ACTIVE' } }),
    ]);

    // Combine counts
    const combinedTotalAffiliates = totalAffiliates + legacyTotal;
    const combinedActiveAffiliates = activeAffiliates + legacyActive;

    // Get conversion data from modern system (AffiliateTouch with convertedAt)
    const modernConversions = await prisma.affiliateTouch.count({
      where: {
        ...clinicFilter,
        convertedAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
    });

    // Get conversion data from legacy system (ReferralTracking)
    const legacyConversions = await prisma.referralTracking.count({
      where: {
        ...clinicFilter,
        createdAt: {
          gte: dateFrom,
          lte: dateTo,
        },
      },
    });

    const totalConversions = modernConversions + legacyConversions;

    // Get revenue and commission from modern system
    const commissionAgg = await prisma.affiliateCommissionEvent.aggregate({
      where: {
        ...clinicFilter,
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

    // Get top affiliates from modern system
    const topModernAffiliates = await prisma.affiliate.findMany({
      where: { ...clinicFilter, status: 'ACTIVE' },
      include: {
        commissionEvents: {
          where: {
            createdAt: { gte: dateFrom, lte: dateTo },
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
        },
        _count: {
          select: { commissionEvents: true },
        },
      },
      take: 10,
    });

    // Get top affiliates from legacy system
    const topLegacyInfluencers = await prisma.influencer.findMany({
      where: { ...clinicFilter, status: 'ACTIVE' },
      include: {
        referrals: {
          where: {
            createdAt: { gte: dateFrom, lte: dateTo },
          },
        },
      },
      take: 10,
    });

    // Combine and sort top affiliates
    type TopAffiliate = {
      id: number;
      name: string;
      conversions: number;
      revenueCents: number;
      commissionCents: number;
    };

    type ModernAffiliate = typeof topModernAffiliates[number];
    type ModernCommissionEvent = ModernAffiliate['commissionEvents'][number];
    type LegacyInfluencer = typeof topLegacyInfluencers[number];

    const allTopAffiliates: TopAffiliate[] = [
      ...topModernAffiliates.map((a: ModernAffiliate) => ({
        id: a.id,
        name: a.displayName,
        conversions: a.commissionEvents.length,
        revenueCents: a.commissionEvents.reduce((sum: number, e: ModernCommissionEvent) => sum + (e.eventAmountCents || 0), 0),
        commissionCents: a.commissionEvents.reduce((sum: number, e: ModernCommissionEvent) => sum + (e.commissionAmountCents || 0), 0),
      })),
      ...topLegacyInfluencers.map((i: LegacyInfluencer) => ({
        id: i.id + 100000, // Offset to avoid ID collision
        name: i.name,
        conversions: i.referrals.length,
        revenueCents: 0, // Legacy system doesn't track revenue
        commissionCents: 0,
      })),
    ];

    // Sort by conversions and take top 5
    const topAffiliates = allTopAffiliates
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 5);

    // Get daily trends
    const trends: ReportData['trends'] = [];
    const daysInPeriod = Math.ceil((dateTo.getTime() - dateFrom.getTime()) / (24 * 60 * 60 * 1000));
    const trendDays = Math.min(daysInPeriod, 14); // Max 14 days of trends

    for (let i = trendDays - 1; i >= 0; i--) {
      const dayStart = new Date(dateTo);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);

      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      // Count conversions for this day
      const [modernDayConversions, legacyDayConversions] = await Promise.all([
        prisma.affiliateTouch.count({
          where: {
            ...clinicFilter,
            convertedAt: { gte: dayStart, lte: dayEnd },
          },
        }),
        prisma.referralTracking.count({
          where: {
            ...clinicFilter,
            createdAt: { gte: dayStart, lte: dayEnd },
          },
        }),
      ]);

      // Get commission data for this day
      const dayCommissions = await prisma.affiliateCommissionEvent.aggregate({
        where: {
          ...clinicFilter,
          createdAt: { gte: dayStart, lte: dayEnd },
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
        _sum: {
          eventAmountCents: true,
          commissionAmountCents: true,
        },
      });

      trends.push({
        date: dayStart.toISOString(),
        conversions: modernDayConversions + legacyDayConversions,
        revenueCents: dayCommissions._sum.eventAmountCents || 0,
        commissionCents: dayCommissions._sum.commissionAmountCents || 0,
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

      type FraudAlert = typeof fraudAlerts[number];
      fraudData.openAlerts = fraudAlerts.reduce((sum: number, a: FraudAlert) => sum + a._count, 0);
      fraudData.criticalAlerts = fraudAlerts
        .filter((a: FraudAlert) => a.severity === 'CRITICAL')
        .reduce((sum: number, a: FraudAlert) => sum + a._count, 0);
    } catch {
      // Fraud table may not exist - ignore
    }

    const response: ReportData = {
      overview: {
        totalAffiliates: combinedTotalAffiliates,
        activeAffiliates: combinedActiveAffiliates,
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

    return NextResponse.json(
      { error: 'Failed to fetch affiliate reports' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handler);
