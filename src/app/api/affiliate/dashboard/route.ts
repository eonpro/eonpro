/**
 * Affiliate Dashboard Data API
 *
 * Returns all data needed for the affiliate dashboard:
 * - Balance summary
 * - Performance metrics
 * - Recent activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;

    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get affiliate with tier info
    const now = new Date();
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      include: {
        currentTier: true,
        planAssignments: {
          where: {
            effectiveFrom: { lte: now },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
          },
          include: {
            commissionPlan: {
              include: {
                tiers: {
                  orderBy: { level: 'asc' },
                },
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Calculate date ranges
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get commission summaries
    const [
      availableCommissions,
      pendingCommissions,
      thisMonthEarnings,
      lastMonthEarnings,
      monthlyClicks,
      monthlyConversions,
      recentCommissions,
      recentPayouts,
      lifetimeCommissions,
    ] = await Promise.all([
      // Available balance (approved, not yet paid)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: 'APPROVED',
          payoutId: null,
        },
        _sum: { commissionAmountCents: true },
      }),

      // Pending balance (still in hold period)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: 'PENDING',
        },
        _sum: { commissionAmountCents: true },
      }),

      // This month earnings (from commission events — use occurredAt for when payment actually happened)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          occurredAt: { gte: startOfMonth },
        },
        _sum: { commissionAmountCents: true },
      }),

      // Last month earnings (use occurredAt for accurate period-based revenue)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          occurredAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
        _sum: { commissionAmountCents: true },
      }),

      // This month clicks (from AffiliateTouch, CLICK type only)
      prisma.affiliateTouch.count({
        where: {
          affiliateId,
          touchType: 'CLICK',
          createdAt: { gte: startOfMonth },
        },
      }),

      // This month intakes completed (patients attributed to this affiliate this month)
      prisma.patient.count({
        where: {
          attributionAffiliateId: affiliateId,
          createdAt: { gte: startOfMonth },
        },
      }),

      // Recent commissions
      prisma.affiliateCommissionEvent.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          commissionAmountCents: true,
          status: true,
        },
      }),

      // Recent payouts
      prisma.affiliatePayout.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          createdAt: true,
          netAmountCents: true,
          status: true,
        },
      }),

      // Lifetime commissions earned (PENDING + APPROVED + PAID, NOT revenue)
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
        _sum: { commissionAmountCents: true },
      }),
    ]);

    // Enhanced traffic metrics (run in parallel for performance)
    const thirtyDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);

    const [
      lifetimeClicks,
      uniqueVisitorsThisMonth,
      taggedProfilesCount,
      topCodesByClicks,
      dailyClickTrend,
    ] = await Promise.all([
      // Total lifetime clicks (CLICK type only — impressions and postbacks are separate)
      prisma.affiliateTouch.count({
        where: { affiliateId, touchType: 'CLICK' },
      }),

      // Unique visitors this month (COUNT DISTINCT via raw SQL - avoids loading all fingerprints into memory)
      prisma.$queryRaw<[{ count: number }]>`
        SELECT COUNT(DISTINCT "visitorFingerprint")::int as count
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "createdAt" >= ${startOfMonth}
          AND "visitorFingerprint" IS NOT NULL
      `.then((rows) => rows[0]?.count || 0),

      // Tagged profiles (patients attributed to this affiliate)
      prisma.patient.count({
        where: { attributionAffiliateId: affiliateId },
      }),

      // Top performing codes by clicks (CLICK type only, even with zero conversions)
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          affiliateId,
          touchType: 'CLICK',
          createdAt: { gte: startOfMonth },
        },
        _count: true,
        orderBy: { _count: { refCode: 'desc' } },
        take: 5,
      }),

      // Daily click trend (last 30 days, CLICK type only) - raw SQL for date grouping
      prisma.$queryRaw`
        SELECT
          DATE("createdAt") as date,
          COUNT(*)::int as clicks
        FROM "AffiliateTouch"
        WHERE "affiliateId" = ${affiliateId}
          AND "touchType" = 'CLICK'
          AND "createdAt" >= ${thirtyDaysAgo}
        GROUP BY DATE("createdAt")
        ORDER BY date ASC
      ` as Promise<Array<{ date: Date; clicks: number }>>,
    ]);

    // Calculate metrics
    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;
    const pendingBalance = pendingCommissions._sum.commissionAmountCents || 0;
    const thisMonth = thisMonthEarnings._sum.commissionAmountCents || 0;
    const lastMonth = lastMonthEarnings._sum.commissionAmountCents || 0;
    // Intakes completed: patients attributed to this affiliate this month
    // No HIPAA suppression needed — affiliates view their own business metrics
    const intakesThisMonth = monthlyConversions;

    const monthOverMonthChange =
      lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : thisMonth > 0 ? 100 : 0;

    const intakeRate = monthlyClicks > 0 ? (intakesThisMonth / monthlyClicks) * 100 : 0;

    // Calculate tier progress
    let tierProgress = 0;
    const currentPlan = affiliate.planAssignments[0]?.commissionPlan;
    if (currentPlan && affiliate.currentTier) {
      const tiers = currentPlan.tiers;
      const currentTierIndex = tiers.findIndex(
        (t: (typeof tiers)[number]) => t.id === affiliate.currentTierId
      );
      const nextTier = tiers[currentTierIndex + 1];

      if (nextTier) {
        const currentRevenue = affiliate.lifetimeRevenueCents;
        const progressToNext = nextTier.minRevenueCents
          ? (currentRevenue / nextTier.minRevenueCents) * 100
          : (affiliate.lifetimeConversions / (nextTier.minConversions || 1)) * 100;
        tierProgress = Math.min(progressToNext, 100);
      } else {
        tierProgress = 100; // Max tier
      }
    }

    // Build recent activity feed
    const recentActivity = [
      ...recentCommissions.map((c: (typeof recentCommissions)[number]) => ({
        id: `comm-${c.id}`,
        type: 'conversion' as const,
        amount: c.commissionAmountCents,
        createdAt: c.createdAt.toISOString(),
        description: c.status === 'PENDING' ? 'Pending commission' : 'New conversion',
      })),
      ...recentPayouts.map((p: (typeof recentPayouts)[number]) => ({
        id: `payout-${p.id}`,
        type: 'payout' as const,
        amount: p.netAmountCents,
        createdAt: p.createdAt.toISOString(),
        description: p.status === 'COMPLETED' ? 'Payout completed' : 'Payout processing',
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    // Format top codes for response
    const topCodesFormatted = topCodesByClicks.map((tc: any) => ({
      refCode: tc.refCode,
      clicks: tc._count,
    }));

    // Format daily trend
    const dailyTrendFormatted = (dailyClickTrend || []).map((d: any) => ({
      date: d.date instanceof Date ? d.date.toISOString().split('T')[0] : String(d.date),
      clicks: d.clicks,
    }));

    return NextResponse.json({
      affiliate: {
        displayName: affiliate.displayName,
        tier: affiliate.currentTier?.name || 'Standard',
        tierProgress,
      },
      earnings: {
        availableBalance,
        pendingBalance,
        lifetimeEarnings: lifetimeCommissions._sum.commissionAmountCents || 0,
        thisMonth,
        lastMonth,
        monthOverMonthChange,
      },
      performance: {
        clicks: monthlyClicks,
        intakes: intakesThisMonth,
        intakeRate: Math.round(intakeRate * 10) / 10,
        avgOrderValue: intakesThisMonth > 0 ? Math.round(thisMonth / intakesThisMonth) : 0,
        lifetimeIntakes: taggedProfilesCount,
      },
      traffic: {
        lifetimeClicks,
        clicksThisMonth: monthlyClicks,
        uniqueVisitorsThisMonth,
        taggedProfiles: taggedProfilesCount,
        funnel: {
          clicks: monthlyClicks,
          taggedProfiles: taggedProfilesCount,
          intakes: intakesThisMonth,
          clickToIntakeRate: monthlyClicks > 0
            ? Math.round((intakesThisMonth / monthlyClicks) * 1000) / 10
            : 0,
        },
        topCodesByClicks: topCodesFormatted,
        dailyTrend: dailyTrendFormatted,
      },
      recentActivity,
    });
  } catch (error) {
    logger.error('[Affiliate Dashboard] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);
