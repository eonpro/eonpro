/**
 * Admin Affiliate Detail API
 *
 * Returns detailed information about a specific affiliate including:
 * - Basic info (name, email, status)
 * - Referral codes
 * - Commission plan
 * - Stats (clicks, conversions, revenue, commission)
 * - Recent activity
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { suppressConversionMetrics, CLICK_FILTER } from '@/services/affiliate/reportingConstants';
import { badRequest, notFound, serverError } from '@/lib/api/error-response';

interface AffiliateDetail {
  id: number;
  displayName: string;
  status: string;
  createdAt: string;
  isLegacy: boolean;
  user: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    lastLogin: string | null;
  } | null;
  refCodes: Array<{
    id: number;
    refCode: string;
    isActive: boolean;
    description?: string;
    createdAt: string;
  }>;
  currentPlan: {
    id: number;
    name: string;
    planType: string;
    flatAmountCents: number | null;
    percentBps: number | null;
  } | null;
  stats: {
    totalClicks: number;
    /** Patients who completed intake via this affiliate (USE) */
    totalIntakes: number;
    /** Touches where convertedAt is set (legacy metric, kept for compat) */
    totalConversions: number;
    /** Actual payment conversions (AffiliateCommissionEvent count) */
    totalPaymentConversions: number;
    conversionRate: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    pendingCommissionCents: number;
  };
  recentActivity: Array<{
    id: number;
    type: string;
    description: string;
    amountCents?: number;
    createdAt: string;
  }>;
  /** Recent patients attributed to this affiliate (HIPAA-safe: IDs and dates only) */
  recentAttributedPatients: Array<{
    patientId: number;
    refCode: string | null;
    attributedAt: string;
  }>;
}

async function handler(req: NextRequest, user: any): Promise<Response> {
  // Extract ID from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const idIndex = pathParts.indexOf('affiliates') + 1;
  const id = pathParts[idIndex];
  const affiliateId = parseInt(id, 10);

  if (isNaN(affiliateId) || affiliateId <= 0) {
    return badRequest('Invalid affiliate ID');
  }

  try {
    // Determine clinic filter
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    // Try to find in modern Affiliate table first
    const modernAffiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliateId,
        ...clinicFilter,
      },
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            lastLogin: true,
          },
        },
        refCodes: {
          orderBy: { createdAt: 'desc' },
        },
        // Get current active plan via planAssignments (effectiveTo is null for current plan)
        planAssignments: {
          where: { effectiveTo: null },
          include: { commissionPlan: true },
          take: 1,
        },
        commissionEvents: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (modernAffiliate) {
      // Get stats from modern system
      type RefCode = (typeof modernAffiliate.refCodes)[number];
      type CommissionEvent = (typeof modernAffiliate.commissionEvents)[number];

      const refCodeStrings = modernAffiliate.refCodes.map((rc: RefCode) => rc.refCode);

      // Get all clicks for this affiliate's codes (use shared CLICK_FILTER constant)
      const totalClicks = await prisma.affiliateTouch.count({
        where: {
          refCode: { in: refCodeStrings },
          ...CLICK_FILTER,
          ...clinicFilter,
        },
      });

      // Get conversions (touches with convertedAt set — represents intake completions / "uses")
      const totalConversions = await prisma.affiliateTouch.count({
        where: {
          refCode: { in: refCodeStrings },
          convertedAt: { not: null },
          ...clinicFilter,
        },
      });

      // Get intake count: patients attributed to this affiliate
      const totalIntakes = await prisma.patient.count({
        where: {
          attributionAffiliateId: modernAffiliate.id,
        },
      });

      // Get payment conversion count from commission events
      const totalPaymentConversions = await prisma.affiliateCommissionEvent.count({
        where: {
          affiliateId: modernAffiliate.id,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
      });

      // Get recent attributed patients (HIPAA-safe: IDs and dates only)
      const recentPatients = await prisma.patient.findMany({
        where: {
          attributionAffiliateId: modernAffiliate.id,
        },
        select: {
          id: true,
          attributionRefCode: true,
          attributionFirstTouchAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Get revenue and commission totals
      const commissionAgg = await prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: modernAffiliate.id,
          status: { in: ['PENDING', 'APPROVED', 'PAID'] },
        },
        _sum: {
          eventAmountCents: true,
          commissionAmountCents: true,
        },
      });

      // Get pending commission
      const pendingAgg = await prisma.affiliateCommissionEvent.aggregate({
        where: {
          affiliateId: modernAffiliate.id,
          status: 'APPROVED',
        },
        _sum: {
          commissionAmountCents: true,
        },
      });

      // Format recent activity
      const recentActivity = modernAffiliate.commissionEvents.map((event: CommissionEvent) => ({
        id: event.id,
        type: 'commission',
        description: `Commission ${event.status.toLowerCase()} - Event #${event.stripeObjectId?.slice(-8) || 'N/A'}`,
        amountCents: event.commissionAmountCents,
        createdAt: event.createdAt.toISOString(),
      }));

      const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

      // HIPAA small-number suppression for admin-facing conversion metrics
      const suppressedMetrics = suppressConversionMetrics({
        conversions: totalConversions,
        revenueCents: commissionAgg._sum.eventAmountCents || 0,
        commissionCents: commissionAgg._sum.commissionAmountCents || 0,
      });

      // Audit log for admin access to individual affiliate data
      logger.security('[AffiliateAudit] Admin accessed affiliate detail', {
        action: 'AFFILIATE_DETAIL_VIEWED',
        affiliateId: modernAffiliate.id,
        clinicId: modernAffiliate.clinicId,
        performedBy: user.id,
        performedByRole: user.role,
      });

      const response: AffiliateDetail = {
        id: modernAffiliate.id,
        displayName: modernAffiliate.displayName,
        status: modernAffiliate.status,
        createdAt: modernAffiliate.createdAt.toISOString(),
        isLegacy: false,
        user: modernAffiliate.user
          ? {
              email: modernAffiliate.user.email,
              firstName: modernAffiliate.user.firstName || '',
              lastName: modernAffiliate.user.lastName || '',
              phone: modernAffiliate.user.phone || undefined,
              lastLogin: modernAffiliate.user.lastLogin?.toISOString() || null,
            }
          : null,
        refCodes: modernAffiliate.refCodes.map((rc: RefCode) => ({
          id: rc.id,
          refCode: rc.refCode,
          isActive: rc.isActive,
          description: rc.description || undefined,
          createdAt: rc.createdAt.toISOString(),
        })),
        currentPlan: modernAffiliate.planAssignments[0]?.commissionPlan
          ? {
              id: modernAffiliate.planAssignments[0].commissionPlan.id,
              name: modernAffiliate.planAssignments[0].commissionPlan.name,
              planType: modernAffiliate.planAssignments[0].commissionPlan.planType,
              flatAmountCents: modernAffiliate.planAssignments[0].commissionPlan.flatAmountCents,
              percentBps: modernAffiliate.planAssignments[0].commissionPlan.percentBps,
            }
          : null,
        stats: {
          totalClicks,
          totalIntakes,
          totalConversions,
          totalPaymentConversions,
          conversionRate,
          totalRevenueCents: commissionAgg._sum.eventAmountCents || 0,
          totalCommissionCents: commissionAgg._sum.commissionAmountCents || 0,
          pendingCommissionCents: pendingAgg._sum.commissionAmountCents || 0,
        },
        recentActivity,
        recentAttributedPatients: recentPatients.map((p) => ({
          patientId: p.id,
          refCode: p.attributionRefCode,
          attributedAt: (p.attributionFirstTouchAt || p.createdAt).toISOString(),
        })),
      };

      return NextResponse.json(response);
    }

    // Try legacy Influencer table
    const legacyInfluencer = await prisma.influencer.findFirst({
      where: {
        id: affiliateId,
        ...clinicFilter,
      },
      include: {
        referrals: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (legacyInfluencer) {
      type Referral = (typeof legacyInfluencer.referrals)[number];

      // Get total referrals (conversions) from legacy system
      const totalConversions = await prisma.referralTracking.count({
        where: {
          influencerId: legacyInfluencer.id,
        },
      });

      // For legacy, clicks = conversions (no separate click tracking)
      const totalClicks = totalConversions;

      // Format recent activity from referrals
      const recentActivity = legacyInfluencer.referrals.map((ref: Referral) => ({
        id: ref.id,
        type: 'referral',
        description: `Referral tracked - Patient #${ref.patientId}`,
        createdAt: ref.createdAt.toISOString(),
      }));

      const response: AffiliateDetail = {
        id: legacyInfluencer.id,
        displayName: legacyInfluencer.name,
        status: legacyInfluencer.status,
        createdAt: legacyInfluencer.createdAt.toISOString(),
        isLegacy: true,
        user: {
          email: legacyInfluencer.email,
          firstName: legacyInfluencer.name.split(' ')[0] || '',
          lastName: legacyInfluencer.name.split(' ').slice(1).join(' ') || '',
          phone: legacyInfluencer.phone || undefined,
          lastLogin: legacyInfluencer.lastLogin?.toISOString() || null,
        },
        refCodes: [
          {
            id: legacyInfluencer.id,
            refCode: legacyInfluencer.promoCode,
            isActive: legacyInfluencer.status === 'ACTIVE',
            createdAt: legacyInfluencer.createdAt.toISOString(),
          },
        ],
        currentPlan: {
          id: 0,
          name: 'Legacy Commission',
          planType: 'PERCENTAGE',
          flatAmountCents: null,
          percentBps: Math.round(legacyInfluencer.commissionRate * 10000), // Convert 0.10 to 1000 bps
        },
        stats: {
          totalClicks,
          totalIntakes: totalConversions,
          totalConversions,
          totalPaymentConversions: 0,
          conversionRate: totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0,
          totalRevenueCents: 0,
          totalCommissionCents: 0,
          pendingCommissionCents: 0,
        },
        recentActivity,
        recentAttributedPatients: [],
      };

      return NextResponse.json(response);
    }

    // Not found
    return notFound('Affiliate not found');
  } catch (error) {
    logger.error('[AffiliateDetail] Failed to fetch affiliate', {
      affiliateId,
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return serverError('Failed to fetch affiliate details');
  }
}

export const GET = withAdminAuth(handler);
