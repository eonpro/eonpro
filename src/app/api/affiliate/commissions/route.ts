/**
 * Affiliate Commissions API
 *
 * Returns paginated commission events for the affiliate portal.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface CommissionEvent {
  id: string;
  date: string;
  orderAmount: number;
  commission: number;
  status: string;
  refCode: string;
  planName: string;
}

const MAX_LIMIT = 100;

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status');

    const affiliateId = user.affiliateId;
    if (!affiliateId) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    const safeLimit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * safeLimit;

    const whereClause: any = { affiliateId };
    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }

    const [commissions, total, totals] = await Promise.all([
      prisma.affiliateCommissionEvent.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        select: {
          id: true,
          createdAt: true,
          eventAmountCents: true,
          commissionAmountCents: true,
          status: true,
          metadata: true,
        },
      }),
      prisma.affiliateCommissionEvent.count({ where: whereClause }),
      prisma.affiliateCommissionEvent.aggregate({
        where: whereClause,
        _sum: {
          eventAmountCents: true,
          commissionAmountCents: true,
        },
      }),
    ]);

    const events: CommissionEvent[] = commissions.map((c: (typeof commissions)[number]) => ({
      id: String(c.id),
      date: c.createdAt.toISOString(),
      orderAmount: c.eventAmountCents,
      commission: c.commissionAmountCents,
      status: c.status.toLowerCase(),
      refCode: (c.metadata as any)?.refCode || 'DIRECT',
      planName: (c.metadata as any)?.planName || 'Standard',
    }));

    return NextResponse.json({
      events,
      pagination: {
        page,
        limit: safeLimit,
        total,
        pages: Math.ceil(total / safeLimit),
      },
      totals: {
        orderAmount: totals._sum.eventAmountCents || 0,
        commission: totals._sum.commissionAmountCents || 0,
      },
    });
  } catch (error) {
    logger.error('[Commissions] Error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 });
  }
}

export const GET = withAffiliateAuth(handler);
