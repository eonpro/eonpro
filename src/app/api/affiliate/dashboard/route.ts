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

/**
 * Handle dashboard for legacy Influencer model users
 * Returns simplified dashboard data from the Influencer table
 */
async function handleInfluencerDashboard(influencerId: number) {
  const influencer = await prisma.influencer.findUnique({
    where: { id: influencerId },
    select: {
      id: true,
      name: true,
      promoCode: true,
      commissionRate: true,
      status: true,
      createdAt: true,
    },
  });

  if (!influencer || influencer.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Influencer not found or inactive' }, { status: 404 });
  }

  // Calculate total earnings from commissions table
  const totalEarningsAgg = await prisma.commission.aggregate({
    where: { influencerId },
    _sum: { commissionAmount: true },
  }).catch(() => ({ _sum: { commissionAmount: null } }));

  // Calculate date ranges for this month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Get legacy commissions from Commission table
  const [monthlyCommissions, referralCount] = await Promise.all([
    // Get commissions from Commission table (legacy model)
    prisma.commission.aggregate({
      where: {
        influencerId,
        createdAt: { gte: startOfMonth },
        status: { in: ['PENDING', 'APPROVED', 'PAID'] },
      },
      _sum: { commissionAmount: true },
      _count: true,
    }).catch(() => ({ _sum: { commissionAmount: null }, _count: 0 })),
    
    // Get referral count from ReferralTracking
    prisma.referralTracking.count({
      where: {
        influencerId,
        createdAt: { gte: startOfMonth },
      },
    }).catch(() => 0),
  ]);

  // Commission amounts are stored as dollars in legacy model
  const thisMonth = Math.round((monthlyCommissions._sum.commissionAmount || 0) * 100);
  const conversionsThisMonth = monthlyCommissions._count || 0;
  const totalEarnings = totalEarningsAgg._sum.commissionAmount || 0;

  return NextResponse.json({
    affiliate: {
      displayName: influencer.name,
      tier: 'Standard',
      tierProgress: 0,
    },
    earnings: {
      availableBalance: Math.round(totalEarnings * 100), // Convert to cents if stored as dollars
      pendingBalance: 0,
      lifetimeEarnings: Math.round(totalEarnings * 100),
      thisMonth,
      lastMonth: 0,
      monthOverMonthChange: 0,
    },
    performance: {
      clicks: referralCount, // Use referral count as a proxy for activity
      conversions: conversionsThisMonth,
      conversionRate: referralCount > 0 ? Math.round((conversionsThisMonth / referralCount) * 1000) / 10 : 0,
      avgOrderValue: 0,
    },
    recentActivity: [],
    // Additional info for influencers
    influencer: {
      promoCode: influencer.promoCode,
      commissionRate: influencer.commissionRate,
    },
  });
}

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    const influencerId = user.influencerId;
    
    // Handle legacy Influencer users
    if (!affiliateId && influencerId) {
      return handleInfluencerDashboard(influencerId);
    }
    
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
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: now } },
            ],
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

    // Calculate date ranges (now already defined above)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Get commission summaries
    const [
      availableCommissions,
      pendingCommissions,
      thisMonthCommissions,
      lastMonthCommissions,
      monthlyClicks,
      recentCommissions,
      recentPayouts,
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
      
      // This month earnings
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { commissionAmountCents: true },
        _count: true,
      }),
      
      // Last month earnings
      prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          createdAt: {
            gte: startOfLastMonth,
            lte: endOfLastMonth,
          },
        },
        _sum: { commissionAmountCents: true },
      }),
      
      // This month clicks
      prisma.affiliateTouch.count({
        where: {
          affiliateId,
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
    ]);

    // Calculate metrics
    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;
    const pendingBalance = pendingCommissions._sum.commissionAmountCents || 0;
    const thisMonth = thisMonthCommissions._sum.commissionAmountCents || 0;
    const lastMonth = lastMonthCommissions._sum.commissionAmountCents || 0;
    const conversionsThisMonth = thisMonthCommissions._count || 0;
    
    const monthOverMonthChange = lastMonth > 0
      ? ((thisMonth - lastMonth) / lastMonth) * 100
      : thisMonth > 0 ? 100 : 0;

    const conversionRate = monthlyClicks > 0
      ? (conversionsThisMonth / monthlyClicks) * 100
      : 0;

    // Calculate tier progress
    let tierProgress = 0;
    const currentPlan = affiliate.planAssignments[0]?.commissionPlan;
    if (currentPlan && affiliate.currentTier) {
      const tiers = currentPlan.tiers;
      const currentTierIndex = tiers.findIndex((t: typeof tiers[number]) => t.id === affiliate.currentTierId);
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
      ...recentCommissions.map((c: typeof recentCommissions[number]) => ({
        id: `comm-${c.id}`,
        type: 'conversion' as const,
        amount: c.commissionAmountCents,
        createdAt: c.createdAt.toISOString(),
        description: c.status === 'PENDING' ? 'Pending commission' : 'New conversion',
      })),
      ...recentPayouts.map((p: typeof recentPayouts[number]) => ({
        id: `payout-${p.id}`,
        type: 'payout' as const,
        amount: p.netAmountCents,
        createdAt: p.createdAt.toISOString(),
        description: p.status === 'COMPLETED' ? 'Payout completed' : 'Payout processing',
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);

    return NextResponse.json({
      affiliate: {
        displayName: affiliate.displayName,
        tier: affiliate.currentTier?.name || 'Standard',
        tierProgress,
      },
      earnings: {
        availableBalance,
        pendingBalance,
        lifetimeEarnings: affiliate.lifetimeRevenueCents,
        thisMonth,
        lastMonth,
        monthOverMonthChange,
      },
      performance: {
        clicks: monthlyClicks,
        conversions: conversionsThisMonth,
        conversionRate: Math.round(conversionRate * 10) / 10,
        avgOrderValue: conversionsThisMonth > 0 ? Math.round(thisMonth / conversionsThisMonth) : 0,
      },
      recentActivity,
    });
  } catch (error) {
    console.error('[Affiliate Dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load dashboard' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handleGet);
