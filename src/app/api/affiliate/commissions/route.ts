/**
 * Affiliate Commissions API
 * 
 * Returns paginated commission events for the affiliate portal
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth } from '@/lib/auth/middleware';
import type { AuthUser } from '@/lib/auth/middleware';

interface CommissionEvent {
  id: string;
  date: string;
  orderAmount: number;
  commission: number;
  status: string;
  refCode: string;
  planName: string;
}

async function handler(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const status = searchParams.get('status');
    
    const skip = (page - 1) * limit;

    // Build where clause
    const whereClause: any = {};
    
    // Check if user is an affiliate
    if (user.affiliateId) {
      whereClause.affiliateId = user.affiliateId;
    } else if (user.influencerId) {
      whereClause.influencerId = user.influencerId;
    } else {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 403 });
    }

    if (status && status !== 'all') {
      whereClause.status = status.toUpperCase();
    }

    // Fetch commissions
    const [commissions, total] = await Promise.all([
      prisma.commission.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          createdAt: true,
          orderAmount: true,
          commissionAmount: true,
          status: true,
          promoCode: true,
        },
      }),
      prisma.commission.count({ where: whereClause }),
    ]);

    // Format for frontend
    const events: CommissionEvent[] = commissions.map((c: any) => ({
      id: String(c.id),
      date: c.createdAt.toISOString(),
      orderAmount: Math.round((c.orderAmount || 0) * 100),
      commission: Math.round((c.commissionAmount || 0) * 100),
      status: (c.status || 'PENDING').toLowerCase(),
      refCode: c.promoCode || 'N/A',
      planName: 'Standard',
    }));

    // Calculate totals
    const totals = await prisma.commission.aggregate({
      where: whereClause,
      _sum: {
        orderAmount: true,
        commissionAmount: true,
      },
    });

    return NextResponse.json({
      events,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      totals: {
        orderAmount: Math.round((totals._sum.orderAmount || 0) * 100),
        commission: Math.round((totals._sum.commissionAmount || 0) * 100),
      },
    });
  } catch (error) {
    console.error('[Commissions] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch commissions' },
      { status: 500 }
    );
  }
}

export const GET = withAffiliateAuth(handler);
