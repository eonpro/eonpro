/**
 * Affiliate Portal Payouts API
 *
 * GET /api/affiliate/payouts?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns aggregated payout/commission ledger totals for the authenticated affiliate.
 * HIPAA-COMPLIANT: Only returns aggregated totals, never individual transaction details.
 *
 * @security Affiliate role only (derived from auth session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

export const GET = withAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      // Get affiliate from user
      const affiliate = await prisma.affiliate.findUnique({
        where: { userId: user.id },
        select: { id: true, clinicId: true, status: true, displayName: true },
      });

      if (!affiliate) {
        return NextResponse.json({ error: 'Affiliate profile not found' }, { status: 404 });
      }

      // Parse date filters
      const { searchParams } = new URL(req.url);
      const fromStr = searchParams.get('from');
      const toStr = searchParams.get('to');

      const fromDate = fromStr ? new Date(fromStr) : undefined;
      const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : undefined;

      const dateFilter = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
      const hasDateFilter = fromDate || toDate;

      // Get monthly aggregates for paid commissions
      const monthlyPayouts = await prisma.$queryRaw<
        Array<{
          month: Date;
          payout_count: bigint;
          payout_total_cents: bigint;
        }>
      >`
      SELECT 
        DATE_TRUNC('month', "paidAt") as month,
        COUNT(*) as payout_count,
        SUM("commissionAmountCents") as payout_total_cents
      FROM "AffiliateCommissionEvent"
      WHERE "affiliateId" = ${affiliate.id}
        AND "clinicId" = ${affiliate.clinicId}
        AND "status" = 'PAID'
        AND "paidAt" IS NOT NULL
        ${fromDate ? prisma.$queryRaw`AND "paidAt" >= ${fromDate}` : prisma.$queryRaw``}
        ${toDate ? prisma.$queryRaw`AND "paidAt" <= ${toDate}` : prisma.$queryRaw``}
      GROUP BY DATE_TRUNC('month', "paidAt")
      ORDER BY month DESC
      LIMIT 24
    `;

      // Get summary totals
      const [lifetimeTotals, pendingPayout] = await Promise.all([
        // Lifetime paid totals
        prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId: affiliate.id,
            clinicId: affiliate.clinicId,
            status: 'PAID',
          },
          _sum: { commissionAmountCents: true },
          _count: true,
        }),

        // Currently pending/approved (not yet paid)
        prisma.affiliateCommissionEvent.aggregate({
          where: {
            affiliateId: affiliate.id,
            clinicId: affiliate.clinicId,
            status: { in: ['PENDING', 'APPROVED'] },
          },
          _sum: { commissionAmountCents: true },
          _count: true,
        }),
      ]);

      // Get upcoming payout eligibility (approved but not paid)
      const upcomingPayout = await prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: affiliate.id,
          clinicId: affiliate.clinicId,
          status: 'APPROVED',
        },
        _sum: { commissionAmountCents: true },
        _count: true,
      });

      return NextResponse.json({
        affiliate: {
          displayName: affiliate.displayName,
          status: affiliate.status,
        },
        summary: {
          lifetimePaidCents: lifetimeTotals._sum.commissionAmountCents || 0,
          lifetimePaidCount: lifetimeTotals._count,
          pendingTotalCents: pendingPayout._sum.commissionAmountCents || 0,
          pendingCount: pendingPayout._count,
          readyForPayoutCents: upcomingPayout._sum.commissionAmountCents || 0,
          readyForPayoutCount: upcomingPayout._count,
        },
        monthlyHistory: monthlyPayouts.map(
          (row: { month: Date; payout_count: bigint; payout_total_cents: bigint }) => ({
            month: row.month.toISOString().substring(0, 7), // YYYY-MM format
            count: Number(row.payout_count),
            totalCents: Number(row.payout_total_cents),
          })
        ),
        dateRange: {
          from: fromDate?.toISOString() || null,
          to: toDate?.toISOString() || null,
        },
        note: "Payouts are processed according to the clinic's payout schedule. Contact support for payout questions.",
      });
    } catch (error) {
      logger.error('[Affiliate Payouts] Error fetching payouts', error);
      return NextResponse.json({ error: 'Failed to fetch payouts' }, { status: 500 });
    }
  },
  { roles: ['affiliate', 'super_admin', 'admin'] }
);
