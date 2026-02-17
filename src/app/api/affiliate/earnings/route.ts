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
import { logger } from '@/lib/logger';
import { executeDbRead } from '@/lib/database/executeDb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function handleGet(request: NextRequest, user: AuthUser) {
  try {
    const affiliateId = user.affiliateId;

    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    // Get affiliate
    const affiliate = await prisma.affiliate.findUnique({
      where: { id: affiliateId },
      select: {
        id: true,
        lifetimeRevenueCents: true,
      },
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
    }

    // Get all data in parallel — Tier 2 READ (fail-fast when breaker is OPEN)
    const earningsResult = await executeDbRead(
      () => Promise.all([
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

        // Lifetime commissions (PENDING + APPROVED + PAID for accounting identity)
        prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId,
            status: { in: ['PENDING', 'APPROVED', 'PAID'] },
          },
          _sum: { commissionAmountCents: true },
        }),
      ]),
      'affiliate-earnings:all-data'
    );

    if (!earningsResult.success) {
      logger.warn('[AffiliateEarnings] Blocked by circuit breaker', {
        affiliateId,
        error: earningsResult.error?.message,
      });
      return NextResponse.json(
        { error: 'Earnings data temporarily unavailable — please retry shortly' },
        { status: 503 }
      );
    }

    const [
      availableCommissions,
      pendingCommissions,
      processingPayouts,
      commissionEvents,
      payouts,
      paidCommissions,
      lifetimeCommissions,
    ] = earningsResult.data!;

    // Format commissions
    const formattedCommissions = commissionEvents.map((c: (typeof commissionEvents)[number]) => ({
      id: String(c.id),
      createdAt: c.createdAt.toISOString(),
      amount: c.commissionAmountCents,
      status: c.status.toLowerCase() as 'pending' | 'approved' | 'paid' | 'reversed',
      orderAmount: c.eventAmountCents,
      refCode: 'DIRECT', // TODO: Join with touch to get actual refCode if needed
      holdUntil: c.holdUntil?.toISOString(),
    }));

    // Format payouts
    const formattedPayouts = payouts.map((p: (typeof payouts)[number]) => ({
      id: String(p.id),
      createdAt: p.createdAt.toISOString(),
      amount: p.amountCents,
      fee: p.feeCents,
      netAmount: p.netAmountCents,
      status: p.status.toLowerCase() as 'processing' | 'completed' | 'failed',
      method: p.methodType === 'PAYPAL' ? 'PayPal' : 'Bank Transfer',
    }));

    // Calculate next payout (estimated)
    const availableBalance = availableCommissions._sum.commissionAmountCents || 0;
    const pendingBalance = pendingCommissions._sum.commissionAmountCents || 0;

    // Estimate next payout if there's available balance
    let nextPayout: { date: string; estimatedAmount: number } | undefined;
    if (availableBalance >= 5000) {
      // $50 minimum
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
        lifetimeEarnings: lifetimeCommissions._sum.commissionAmountCents || 0,
        lifetimePaid: paidCommissions._sum.netAmountCents || 0,
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
