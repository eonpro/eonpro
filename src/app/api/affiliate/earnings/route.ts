/**
 * Affiliate Earnings API
 *
 * Returns detailed earnings data:
 * - Balance summary (available, pending, lifetime, paid)
 * - Commission history
 * - Payout history
 * - Next payout estimate
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;

    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: { id: true },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    const [
      availableCommissions,
      pendingCommissions,
      lifetimeCommissions,
      processingPayouts,
      completedPayouts,
      commissionEvents,
      payouts,
    ] = await Promise.all([
      prisma.affiliateCommissionEvent.aggregate({
        where: { affiliateId, status: 'APPROVED', payoutId: null },
        _sum: { commissionAmountCents: true },
      }),
      prisma.affiliateCommissionEvent.aggregate({
        where: { affiliateId, status: 'PENDING' },
        _sum: { commissionAmountCents: true },
      }),
      prisma.affiliateCommissionEvent.aggregate({
        where: { affiliateId, status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
        _sum: { commissionAmountCents: true },
      }),
      prisma.affiliatePayout.aggregate({
        where: { affiliateId, status: 'PROCESSING' },
        _sum: { netAmountCents: true },
      }),
      prisma.affiliatePayout.aggregate({
        where: { affiliateId, status: 'COMPLETED' },
        _sum: { netAmountCents: true },
      }),
      prisma.affiliateCommissionEvent.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          createdAt: true,
          commissionAmountCents: true,
          eventAmountCents: true,
          status: true,
          holdUntil: true,
          metadata: true,
        },
      }),
      prisma.affiliatePayout.findMany({
        where: { affiliateId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;
    const pendingBalance = pendingCommissions._sum.commissionAmountCents || 0;
    const lifetimeEarnings = lifetimeCommissions._sum.commissionAmountCents || 0;
    const processingPayout = processingPayouts._sum.netAmountCents || 0;
    const lifetimePaid = completedPayouts._sum.netAmountCents || 0;

    const formattedCommissions = commissionEvents.map((c) => ({
      id: String(c.id),
      createdAt: c.createdAt.toISOString(),
      amount: c.commissionAmountCents,
      status: c.status.toLowerCase() as 'pending' | 'approved' | 'paid' | 'reversed',
      orderAmount: c.eventAmountCents,
      refCode: (c.metadata as any)?.refCode || 'DIRECT',
      holdUntil: c.holdUntil?.toISOString(),
    }));

    const formattedPayouts = payouts.map((p) => ({
      id: String(p.id),
      createdAt: p.createdAt.toISOString(),
      amount: p.amountCents,
      fee: p.feeCents,
      netAmount: p.netAmountCents,
      status: p.status.toLowerCase() as 'processing' | 'completed' | 'failed',
      method: p.methodType === 'PAYPAL' ? 'PayPal' : 'Bank Transfer',
    }));

    let nextPayout: { date: string; estimatedAmount: number } | undefined;
    if (availableBalance >= 5000) {
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
        processingPayout,
        lifetimeEarnings,
        lifetimePaid,
      },
      commissions: formattedCommissions,
      payouts: formattedPayouts,
      nextPayout,
    });
  } catch (error) {
    logger.error('[Affiliate Earnings] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to load earnings' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handleGet);
