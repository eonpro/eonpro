/**
 * Affiliate Portal Summary API
 *
 * GET /api/affiliate/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns aggregated commission summary for the authenticated affiliate.
 * HIPAA-COMPLIANT: Only returns counts and totals, never patient data.
 *
 * @security Affiliate role only (derived from auth session)
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAffiliateAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

export const GET = withAffiliateAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.affiliateId) {
        return NextResponse.json({ error: 'Affiliate not found' }, { status: 404 });
      }

      // Get affiliate from user
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: user.affiliateId },
        select: { id: true, clinicId: true, status: true },
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

      const fromDate = fromStr ? new Date(fromStr) : undefined;
      const toDate = toStr ? new Date(toStr + 'T23:59:59.999Z') : undefined;

      const dateFilter = {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      };
      const hasDateFilter = fromDate || toDate;

      // Get aggregated stats by status (use createdAt consistently across all routes)
      const [pendingStats, approvedStats, paidStats, reversedStats, totalRevenue] =
        await Promise.all([
          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'PENDING',
              ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'APPROVED',
              ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'PAID',
              ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'REVERSED',
              ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          // Total conversions and revenue (exclude PENDING and REVERSED from conversions)
          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: { in: ['APPROVED', 'PAID'] },
              ...(hasDateFilter ? { createdAt: dateFilter } : {}),
            },
            _sum: { eventAmountCents: true },
            _count: true,
          }),
        ]);

      // Get active ref codes
      const refCodes = await prisma.affiliateRefCode.findMany({
        where: {
          affiliateId: affiliate.id,
          isActive: true,
        },
        select: {
          refCode: true,
          description: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Get current commission plan
      const currentPlanAssignment = await prisma.affiliatePlanAssignment.findFirst({
        where: {
          affiliateId: affiliate.id,
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
        },
        include: {
          commissionPlan: {
            select: {
              name: true,
              planType: true,
              flatAmountCents: true,
              percentBps: true,
              appliesTo: true,
            },
          },
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      return NextResponse.json({
        summary: {
          conversionsCount: totalRevenue._count,
          revenueTotalCents: totalRevenue._sum.eventAmountCents || 0,
          commissionPendingCents: pendingStats._sum.commissionAmountCents || 0,
          commissionApprovedCents: approvedStats._sum.commissionAmountCents || 0,
          commissionPaidCents: paidStats._sum.commissionAmountCents || 0,
          commissionReversedCents: reversedStats._sum.commissionAmountCents || 0,
          pendingCount: pendingStats._count,
          approvedCount: approvedStats._count,
          paidCount: paidStats._count,
          reversedCount: reversedStats._count,
        },
        refCodes,
        currentPlan: currentPlanAssignment?.commissionPlan || null,
        dateRange: {
          from: fromDate?.toISOString() || null,
          to: toDate?.toISOString() || null,
        },
      });
    } catch (error) {
      logger.error('[Affiliate Summary] Error fetching summary', error);
      return NextResponse.json({ error: 'Failed to fetch summary' }, { status: 500 });
    }
  }
);
