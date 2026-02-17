/**
 * Affiliate Earnings API
 *
 * Returns detailed earnings data:
 * - Balance summary
 * - Commission history
 * - Payout history
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
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

    // PHASE 2 OPTIMIZATION: Consolidated from 7 queries → 3 queries
    // 1 raw SQL (replaces 5 aggregates) + 2 findMany for list data
    const earningsResult = await executeDbRead(
      () => Promise.all([
        // Single SQL: all commission + payout aggregates via UNION ALL
        prisma.$queryRaw<Array<{
          source: string;
          status: string;
          sum_amount: bigint | null;
          available_amount: bigint | null;
        }>>(Prisma.sql`
          SELECT
            'commission' AS source,
            status,
            COALESCE(SUM("commissionAmountCents"), 0) AS sum_amount,
            COALESCE(SUM(
              CASE WHEN "payoutId" IS NULL AND status = 'APPROVED'
                   THEN "commissionAmountCents" ELSE 0 END
            ), 0) AS available_amount
          FROM "AffiliateCommissionEvent"
          WHERE "affiliateId" = ${affiliateId}
            AND status IN ('PENDING', 'APPROVED', 'PAID')
          GROUP BY status
          UNION ALL
          SELECT
            'payout' AS source,
            status,
            COALESCE(SUM("netAmountCents"), 0) AS sum_amount,
            0 AS available_amount
          FROM "AffiliatePayout"
          WHERE "affiliateId" = ${affiliateId}
            AND status IN ('PROCESSING', 'COMPLETED')
          GROUP BY status
        `),

        // Commission events list (last 100) — needed for display
        prisma.affiliateCommissionEvent.findMany({
          where: { affiliateId },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),

        // Payouts list (last 50) — needed for display
        prisma.affiliatePayout.findMany({
          where: { affiliateId },
          orderBy: { createdAt: 'desc' },
          take: 50,
        }),
      ]),
      'affiliate-earnings:consolidated'
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

    const [aggregateRows, commissionEvents, payouts] = earningsResult.data!;

    // Parse aggregation results from the single SQL query
    let availableBalance = 0;
    let pendingBalance = 0;
    let lifetimeEarnings = 0;
    let processingPayout = 0;
    let lifetimePaid = 0;

    for (const row of aggregateRows) {
      const sumAmount = Number(row.sum_amount ?? 0);
      const availableAmount = Number(row.available_amount ?? 0);

      if (row.source === 'commission') {
        // Accumulate lifetime earnings across statuses
        lifetimeEarnings += sumAmount;

        if (row.status === 'APPROVED') {
          availableBalance = availableAmount; // Only un-paid-out APPROVED commissions
        } else if (row.status === 'PENDING') {
          pendingBalance = sumAmount;
        }
      } else if (row.source === 'payout') {
        if (row.status === 'PROCESSING') {
          processingPayout = sumAmount;
        } else if (row.status === 'COMPLETED') {
          lifetimePaid = sumAmount;
        }
      }
    }

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

    // Estimate next payout if there's available balance
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
