/**
 * Super Admin Affiliate Diagnostics API
 *
 * Provides system health checks and diagnostic data for affiliate reporting.
 * This helps admins understand why data might be missing and what needs attention.
 *
 * GET /api/super-admin/affiliates/diagnostics
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { handleApiError } from '@/domains/shared/errors';
import { logger } from '@/lib/logger';

interface DiagnosticCheck {
  name: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  value?: number | string;
  details?: Record<string, any>;
}

interface DiagnosticsResponse {
  timestamp: string;
  overallStatus: 'healthy' | 'warning' | 'error';
  checks: DiagnosticCheck[];
  recentActivity: {
    recentTouches: Array<{
      refCode: string;
      affiliateName: string;
      clinicName: string;
      createdAt: string;
      converted: boolean;
    }>;
    recentCommissions: Array<{
      affiliateName: string;
      clinicName: string;
      amountCents: number;
      commissionCents: number;
      status: string;
      createdAt: string;
    }>;
    recentReferrals: Array<{
      promoCode: string;
      patientId: number;
      hasModernAttribution: boolean;
      createdAt: string;
    }>;
  };
  migrationStatus: {
    legacyInfluencerCount: number;
    modernAffiliateCount: number;
    unmigratedCodes: string[];
  };
}

async function handler(req: NextRequest): Promise<Response> {
  logger.info('[SuperAdmin Diagnostics] Running affiliate system diagnostics');

  try {
    const checks: DiagnosticCheck[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Run all independent count/aggregate queries in parallel
    const [
      affiliateCount, activeAffiliateCount,
      refCodeCount, activeRefCodeCount,
      touchCount, recentTouchCount, convertedTouchCount,
      commissionCount, pendingCommissions, approvedCommissions, paidCommissions, totalCommissionCents,
      planCount, activePlanCount,
      affiliatesWithPlans,
      patientsWithAttribution, recentPatientsWithAttribution,
      legacyInfluencerCount,
      influencerCodes, affiliateCodes,
      recentTouches, recentCommissions, recentReferrals,
    ] = await Promise.all([
      prisma.affiliate.count(),
      prisma.affiliate.count({ where: { status: 'ACTIVE' } }),
      prisma.affiliateRefCode.count(),
      prisma.affiliateRefCode.count({ where: { isActive: true } }),
      prisma.affiliateTouch.count(),
      prisma.affiliateTouch.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.affiliateTouch.count({ where: { convertedAt: { not: null } } }),
      prisma.affiliateCommissionEvent.count(),
      prisma.affiliateCommissionEvent.count({ where: { status: 'PENDING' } }),
      prisma.affiliateCommissionEvent.count({ where: { status: 'APPROVED' } }),
      prisma.affiliateCommissionEvent.count({ where: { status: 'PAID' } }),
      prisma.affiliateCommissionEvent.aggregate({
        where: { status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
        _sum: { commissionAmountCents: true },
      }),
      prisma.affiliateCommissionPlan.count(),
      prisma.affiliateCommissionPlan.count({ where: { isActive: true } }),
      prisma.affiliate.count({ where: { planAssignments: { some: { effectiveTo: null } } } }),
      prisma.patient.count({ where: { attributionAffiliateId: { not: null } } }),
      prisma.patient.count({ where: { attributionAffiliateId: { not: null }, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.influencer.count({ where: { status: 'ACTIVE' } }),
      prisma.influencer.findMany({ where: { status: 'ACTIVE' }, select: { promoCode: true } }),
      prisma.affiliateRefCode.findMany({ select: { refCode: true } }),
      prisma.affiliateTouch.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        include: { affiliate: { select: { displayName: true } }, clinic: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.affiliateCommissionEvent.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        include: { affiliate: { select: { displayName: true } }, clinic: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      prisma.referralTracking.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        include: { patient: { select: { attributionAffiliateId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    const affiliatesWithoutPlans = affiliateCount - affiliatesWithPlans;
    const affiliateCodeSet = new Set(affiliateCodes.map((c) => c.refCode.toUpperCase()));
    const unmigratedCodes = influencerCodes
      .filter((i) => !affiliateCodeSet.has(i.promoCode.toUpperCase()))
      .map((i) => i.promoCode);

    checks.push(
      {
        name: 'Affiliates',
        status: affiliateCount > 0 ? 'healthy' : 'error',
        message: affiliateCount > 0
          ? `${affiliateCount} affiliates (${activeAffiliateCount} active)`
          : 'No affiliates found - create affiliates or run migration',
        value: affiliateCount,
        details: { total: affiliateCount, active: activeAffiliateCount },
      },
      {
        name: 'Ref Codes',
        status: refCodeCount > 0 ? 'healthy' : 'error',
        message: refCodeCount > 0
          ? `${refCodeCount} ref codes (${activeRefCodeCount} active)`
          : 'No ref codes found - affiliates need ref codes to track',
        value: refCodeCount,
        details: { total: refCodeCount, active: activeRefCodeCount },
      },
      {
        name: 'Tracking Records',
        status: touchCount > 0 ? (recentTouchCount > 0 ? 'healthy' : 'warning') : 'warning',
        message: touchCount > 0
          ? `${touchCount} total (${recentTouchCount} in last 30 days, ${convertedTouchCount} converted)`
          : 'No tracking records - verify AffiliateTracker is in app layout',
        value: touchCount,
        details: { total: touchCount, last30Days: recentTouchCount, converted: convertedTouchCount },
      },
      {
        name: 'Commission Events',
        status: commissionCount > 0 ? 'healthy' : 'warning',
        message: commissionCount > 0
          ? `${commissionCount} events ($${((totalCommissionCents._sum.commissionAmountCents || 0) / 100).toFixed(2)} total)`
          : 'No commission events - check Stripe webhook integration',
        value: commissionCount,
        details: {
          total: commissionCount, pending: pendingCommissions,
          approved: approvedCommissions, paid: paidCommissions,
          totalCents: totalCommissionCents._sum.commissionAmountCents || 0,
        },
      },
      {
        name: 'Commission Plans',
        status: planCount > 0 ? 'healthy' : 'error',
        message: planCount > 0
          ? `${planCount} plans (${activePlanCount} active)`
          : 'No commission plans - affiliates cannot earn without plans',
        value: planCount,
        details: { total: planCount, active: activePlanCount },
      },
      {
        name: 'Plan Assignments',
        status: affiliatesWithoutPlans === 0 ? 'healthy' : 'warning',
        message: affiliatesWithoutPlans === 0
          ? 'All affiliates have active plans'
          : `${affiliatesWithoutPlans} affiliates without plans`,
        value: affiliatesWithPlans,
        details: { withPlans: affiliatesWithPlans, withoutPlans: affiliatesWithoutPlans },
      },
      {
        name: 'Patient Attribution',
        status: patientsWithAttribution > 0 ? 'healthy' : 'warning',
        message: patientsWithAttribution > 0
          ? `${patientsWithAttribution} patients attributed (${recentPatientsWithAttribution} in last 30 days)`
          : 'No patients have affiliate attribution',
        value: patientsWithAttribution,
        details: { total: patientsWithAttribution, last30Days: recentPatientsWithAttribution },
      },
      {
        name: 'Legacy Migration',
        status: unmigratedCodes.length === 0 ? 'healthy' : 'warning',
        message: unmigratedCodes.length === 0
          ? 'All legacy codes migrated'
          : `${unmigratedCodes.length} legacy codes need migration`,
        value: unmigratedCodes.length,
        details: { unmigrated: unmigratedCodes.slice(0, 10), legacyCount: legacyInfluencerCount },
      },
    );

    // ========================================================================
    // Determine Overall Status
    // ========================================================================
    const hasErrors = checks.some((c) => c.status === 'error');
    const hasWarnings = checks.some((c) => c.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy';

    const response: DiagnosticsResponse = {
      timestamp: now.toISOString(),
      overallStatus,
      checks,
      recentActivity: {
        recentTouches: recentTouches.map((t) => ({
          refCode: t.refCode,
          affiliateName: t.affiliate.displayName,
          clinicName: t.clinic.name,
          createdAt: t.createdAt.toISOString(),
          converted: !!t.convertedAt,
        })),
        recentCommissions: recentCommissions.map((c) => ({
          affiliateName: c.affiliate.displayName,
          clinicName: c.clinic.name,
          amountCents: c.eventAmountCents,
          commissionCents: c.commissionAmountCents,
          status: c.status,
          createdAt: c.createdAt.toISOString(),
        })),
        recentReferrals: recentReferrals.map((r) => ({
          promoCode: r.promoCode,
          patientId: r.patientId,
          hasModernAttribution: !!r.patient?.attributionAffiliateId,
          createdAt: r.createdAt.toISOString(),
        })),
      },
      migrationStatus: {
        legacyInfluencerCount,
        modernAffiliateCount: affiliateCount,
        unmigratedCodes: unmigratedCodes.slice(0, 20),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[SuperAdmin Diagnostics] Failed to run diagnostics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return handleApiError(error, { route: 'GET /api/super-admin/affiliates/diagnostics' });
  }
}

export const GET = withSuperAdminAuth(handler);
