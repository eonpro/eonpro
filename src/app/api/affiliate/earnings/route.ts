/**
 * Affiliate Earnings API
 * 
 * Returns detailed earnings data:
 * - Balance summary
 * - Commission history
 * - Payout history
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';

/**
 * Handle earnings for legacy Influencer model users
 */
async function handleInfluencerEarnings(influencerId: number) {
  const influencer = await prisma.influencer.findUnique({
    where: { id: influencerId },
    select: {
      id: true,
      totalEarnings: true,
    },
  });

  if (!influencer) {
    return NextResponse.json({ error: 'Influencer not found' }, { status: 404 });
  }

  // Get legacy commissions
  const commissions = await prisma.commission.findMany({
    where: { influencerId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      createdAt: true,
      commissionAmount: true,
      status: true,
      orderAmount: true,
      promoCode: true,
    },
  }).catch(() => []);

  // Convert to expected format
  const formattedCommissions = commissions.map((c: any) => ({
    id: String(c.id),
    createdAt: c.createdAt.toISOString(),
    amount: Math.round((c.commissionAmount || 0) * 100), // Convert to cents
    status: (c.status || 'pending').toLowerCase() as 'pending' | 'approved' | 'paid' | 'reversed',
    orderAmount: Math.round((c.orderAmount || 0) * 100),
    refCode: c.promoCode || 'PROMO',
  }));

  const totalEarnings = influencer.totalEarnings || 0;

  return NextResponse.json({
    summary: {
      availableBalance: Math.round(totalEarnings * 100),
      pendingBalance: 0,
      processingPayout: 0,
      lifetimeEarnings: Math.round(totalEarnings * 100),
      lifetimePaid: 0,
    },
    commissions: formattedCommissions,
    payouts: [],
  });
}

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;
    const influencerId = user.influencerId;
    
    // Handle legacy Influencer users
    if (!affiliateId && influencerId) {
      return handleInfluencerEarnings(influencerId);
    }
    
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        lifetimeRevenueCents: true,
        lifetimeCommissionsCents: true,
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Get all data in parallel
    const [
      availableCommissions,
      pendingCommissions,
      processingPayouts,
      commissionEvents,
      payouts,
      paidCommissions,
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
      
      // Processing payouts
      prisma.affiliatePayout.aggregate({
        where: {
          affiliateId,
          status: 'PROCESSING',
        },
        _sum: { netAmountCents: true },
      }),
      
      // Commission events (last 100)
      prisma.affiliateCommissionEvent.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          refCode: {
            select: { code: true },
          },
        },
      }),
      
      // Payouts
      prisma.affiliatePayout.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      
      // Total paid out
      prisma.affiliatePayout.aggregate({
        where: {
          affiliateId,
          status: 'COMPLETED',
        },
        _sum: { netAmountCents: true },
      }),
    ]);

    // Format commissions
    const formattedCommissions = commissionEvents.map((c) => ({
      id: String(c.id),
      createdAt: c.createdAt.toISOString(),
      amount: c.commissionAmountCents,
      status: c.status.toLowerCase() as 'pending' | 'approved' | 'paid' | 'reversed',
      orderAmount: c.orderAmountCents,
      refCode: c.refCode?.code || 'DIRECT',
      holdUntil: c.holdUntil?.toISOString(),
    }));

    // Format payouts
    const formattedPayouts = payouts.map((p) => ({
      id: String(p.id),
      createdAt: p.createdAt.toISOString(),
      amount: p.grossAmountCents,
      fee: p.feeCents,
      netAmount: p.netAmountCents,
      status: p.status.toLowerCase() as 'processing' | 'completed' | 'failed',
      method: p.paymentMethod || 'Bank Transfer',
    }));

    // Calculate next payout (estimated)
    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;
    const pendingBalance = pendingCommissions._sum.commissionAmountCents || 0;
    
    // Estimate next payout if there's available balance
    let nextPayout: { date: string; estimatedAmount: number } | undefined;
    if (availableBalance >= 5000) { // $50 minimum
      // Next weekly payout (Friday)
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
      const nextFriday = new Date(now);
      nextFriday.setDate(now.getDate() + daysUntilFriday);
      nextFriday.setHours(12, 0, 0, 0);
      
      nextPayout = {
        date: nextFriday.toISOString(),
        estimatedAmount: availableBalance,
      };
    }

    return NextResponse.json({
      summary: {
        availableBalance,
        pendingBalance,
        processingPayout: processingPayouts._sum.netAmountCents || 0,
        lifetimeEarnings: affiliate.lifetimeCommissionsCents || 0,
        lifetimePaid: paidCommissions._sum.netAmountCents || 0,
      },
      commissions: formattedCommissions,
      payouts: formattedPayouts,
      nextPayout,
    });
  } catch (error) {
    console.error('[Affiliate Earnings] Error:', error);
    return NextResponse.json(
      { error: 'Failed to load earnings' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handleGet);
