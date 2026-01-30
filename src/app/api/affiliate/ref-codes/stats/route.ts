/**
 * Affiliate Ref Code Stats API
 * 
 * GET /api/affiliate/ref-codes/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * 
 * Returns performance stats for each ref code belonging to the authenticated affiliate.
 * Includes clicks, conversions, revenue, and commission per ref code.
 * 
 * @security Affiliate role only
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface RefCodeStats {
  refCode: string;
  description: string | null;
  clicks: number;
  conversions: number;
  revenueCents: number;
  commissionCents: number;
  conversionRate: number;
}

export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    // Get affiliate from user
    const affiliate = await prisma.affiliate.findUnique({
      where: { userId: user.id },
      select: { id: true, clinicId: true, status: true }
    });

    if (!affiliate) {
      return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
    }

    if (affiliate.status !== 'ACTIVE') {
      return NextResponse.json({ error: 'Affiliate account is not active' }, { status: 403 });
    }

    // Parse date filters
    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get('from');
    const toStr = searchParams.get('to');
    
    const fromDate = fromStr ? new Date(fromStr) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : new Date();

    // Get all ref codes for this affiliate
    const refCodes = await prisma.affiliateRefCode.findMany({
      where: {
        affiliateId: affiliate.id,
        clinicId: affiliate.clinicId,
      },
      select: {
        refCode: true,
        description: true,
      }
    });

    if (refCodes.length === 0) {
      return NextResponse.json({
        refCodes: [],
        dateRange: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
        }
      });
    }

    const refCodeList = refCodes.map(r => r.refCode);

    // Get clicks per ref code (from AffiliateTouch)
    const clicksData = await prisma.affiliateTouch.groupBy({
      by: ['refCode'],
      where: {
        affiliateId: affiliate.id,
        clinicId: affiliate.clinicId,
        refCode: { in: refCodeList },
        createdAt: {
          gte: fromDate,
          lte: toDate,
        }
      },
      _count: true,
    });

    // Get conversions and revenue per ref code (from AffiliateCommissionEvent)
    // Note: Commission events are linked via touch, need to join through touch table
    const conversionsData = await prisma.$queryRaw<Array<{
      ref_code: string;
      conversions: bigint;
      revenue_cents: bigint;
      commission_cents: bigint;
    }>>`
      SELECT 
        t."refCode" as ref_code,
        COUNT(DISTINCT ce.id) as conversions,
        COALESCE(SUM(ce."eventAmountCents"), 0) as revenue_cents,
        COALESCE(SUM(ce."commissionAmountCents"), 0) as commission_cents
      FROM "AffiliateTouch" t
      INNER JOIN "AffiliateCommissionEvent" ce ON ce."touchId" = t.id
      WHERE t."affiliateId" = ${affiliate.id}
        AND t."clinicId" = ${affiliate.clinicId}
        AND t."refCode" = ANY(${refCodeList})
        AND ce."status" != 'REVERSED'
        AND ce."occurredAt" >= ${fromDate}
        AND ce."occurredAt" <= ${toDate}
      GROUP BY t."refCode"
    `;

    // Build click map
    const clickMap = new Map<string, number>();
    for (const row of clicksData) {
      clickMap.set(row.refCode, row._count);
    }

    // Build conversion map
    const conversionMap = new Map<string, {
      conversions: number;
      revenueCents: number;
      commissionCents: number;
    }>();
    for (const row of conversionsData) {
      conversionMap.set(row.ref_code, {
        conversions: Number(row.conversions),
        revenueCents: Number(row.revenue_cents),
        commissionCents: Number(row.commission_cents),
      });
    }

    // Combine data for each ref code
    const refCodeStats: RefCodeStats[] = refCodes.map(rc => {
      const clicks = clickMap.get(rc.refCode) || 0;
      const convData = conversionMap.get(rc.refCode) || {
        conversions: 0,
        revenueCents: 0,
        commissionCents: 0,
      };
      
      return {
        refCode: rc.refCode,
        description: rc.description,
        clicks,
        conversions: convData.conversions,
        revenueCents: convData.revenueCents,
        commissionCents: convData.commissionCents,
        conversionRate: clicks > 0 ? (convData.conversions / clicks) * 100 : 0,
      };
    });

    // Sort by commission (highest first)
    refCodeStats.sort((a, b) => b.commissionCents - a.commissionCents);

    return NextResponse.json({
      refCodes: refCodeStats,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      }
    });

  } catch (error) {
    logger.error('[Affiliate Ref Code Stats] Error fetching stats', error);
    return NextResponse.json({ error: 'Failed to fetch ref code stats' }, { status: 500 });
  }
}, { roles: ['affiliate', 'super_admin', 'admin'] });
