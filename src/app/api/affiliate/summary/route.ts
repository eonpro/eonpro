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
import { ACTIVE_COMMISSION_STATUSES } from '@/services/affiliate/reportingConstants';
import { notFound, forbidden, serverError } from '@/lib/api/error-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = withAffiliateAuth(
  async (req: NextRequest, user: AuthUser) => {
    try {
      if (!user.affiliateId) {
        return notFound('Affiliate not found');
      }

      // Get affiliate from user
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: user.affiliateId },
        select: { id: true, clinicId: true, status: true },
      });

      if (!affiliate) {
        return notFound('Affiliate profile not found');
      }

      if (affiliate.status !== 'ACTIVE') {
        return forbidden('Affiliate account is not active');
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

      // Get aggregated stats by status (use occurredAt for revenue date alignment)
      const [pendingStats, approvedStats, paidStats, reversedStats, totalRevenue] =
        await Promise.all([
          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'PENDING',
              ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'APPROVED',
              ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'PAID',
              ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: 'REVERSED',
              ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { commissionAmountCents: true, eventAmountCents: true },
            _count: true,
          }),

          // Total conversions and revenue (only active statuses; exclude REVERSED)
          prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliateId: affiliate.id,
              clinicId: affiliate.clinicId,
              status: { in: [...ACTIVE_COMMISSION_STATUSES] },
              ...(hasDateFilter ? { occurredAt: dateFilter } : {}),
            },
            _sum: { eventAmountCents: true },
            _count: true,
          }),
        ]);

      // Get click and intake counts (funnel metrics)
      const [clickStats, intakeCount] = await Promise.all([
        // Total clicks (AffiliateTouch where touchType = CLICK)
        prisma.affiliateTouch.aggregate({
          where: {
            affiliateId: affiliate.id,
            clinicId: affiliate.clinicId,
            touchType: 'CLICK',
            ...(hasDateFilter ? { createdAt: dateFilter } : {}),
          },
          _count: true,
        }),
        // Total intakes (patients attributed to this affiliate)
        prisma.patient.count({
          where: {
            affiliateId: affiliate.id,
            clinicId: affiliate.clinicId,
            ...(hasDateFilter
              ? { createdAt: dateFilter }
              : {}),
          },
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
          clicksCount: clickStats._count,
          intakesCount: intakeCount,
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
      return serverError('Failed to fetch summary');
    }
  }
);
