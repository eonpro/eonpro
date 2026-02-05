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

    // ========================================================================
    // Check 1: Affiliates
    // ========================================================================
    const affiliateCount = await prisma.affiliate.count();
    const activeAffiliateCount = await prisma.affiliate.count({ where: { status: 'ACTIVE' } });

    checks.push({
      name: 'Affiliates',
      status: affiliateCount > 0 ? 'healthy' : 'error',
      message: affiliateCount > 0 
        ? `${affiliateCount} affiliates (${activeAffiliateCount} active)` 
        : 'No affiliates found - create affiliates or run migration',
      value: affiliateCount,
      details: { total: affiliateCount, active: activeAffiliateCount }
    });

    // ========================================================================
    // Check 2: Ref Codes
    // ========================================================================
    const refCodeCount = await prisma.affiliateRefCode.count();
    const activeRefCodeCount = await prisma.affiliateRefCode.count({ where: { isActive: true } });

    checks.push({
      name: 'Ref Codes',
      status: refCodeCount > 0 ? 'healthy' : 'error',
      message: refCodeCount > 0 
        ? `${refCodeCount} ref codes (${activeRefCodeCount} active)` 
        : 'No ref codes found - affiliates need ref codes to track',
      value: refCodeCount,
      details: { total: refCodeCount, active: activeRefCodeCount }
    });

    // ========================================================================
    // Check 3: Tracking Records
    // ========================================================================
    const touchCount = await prisma.affiliateTouch.count();
    const recentTouchCount = await prisma.affiliateTouch.count({
      where: { createdAt: { gte: thirtyDaysAgo } }
    });
    const convertedTouchCount = await prisma.affiliateTouch.count({
      where: { convertedAt: { not: null } }
    });

    checks.push({
      name: 'Tracking Records',
      status: touchCount > 0 ? (recentTouchCount > 0 ? 'healthy' : 'warning') : 'warning',
      message: touchCount > 0 
        ? `${touchCount} total (${recentTouchCount} in last 30 days, ${convertedTouchCount} converted)` 
        : 'No tracking records - verify AffiliateTracker is in app layout',
      value: touchCount,
      details: { total: touchCount, last30Days: recentTouchCount, converted: convertedTouchCount }
    });

    // ========================================================================
    // Check 4: Commission Events
    // ========================================================================
    const commissionCount = await prisma.affiliateCommissionEvent.count();
    const pendingCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'PENDING' } });
    const approvedCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'APPROVED' } });
    const paidCommissions = await prisma.affiliateCommissionEvent.count({ where: { status: 'PAID' } });

    const totalCommissionCents = await prisma.affiliateCommissionEvent.aggregate({
      where: { status: { in: ['PENDING', 'APPROVED', 'PAID'] } },
      _sum: { commissionAmountCents: true }
    });

    checks.push({
      name: 'Commission Events',
      status: commissionCount > 0 ? 'healthy' : 'warning',
      message: commissionCount > 0 
        ? `${commissionCount} events ($${((totalCommissionCents._sum.commissionAmountCents || 0) / 100).toFixed(2)} total)` 
        : 'No commission events - check Stripe webhook integration',
      value: commissionCount,
      details: { 
        total: commissionCount, 
        pending: pendingCommissions, 
        approved: approvedCommissions, 
        paid: paidCommissions,
        totalCents: totalCommissionCents._sum.commissionAmountCents || 0
      }
    });

    // ========================================================================
    // Check 5: Commission Plans
    // ========================================================================
    const planCount = await prisma.affiliateCommissionPlan.count();
    const activePlanCount = await prisma.affiliateCommissionPlan.count({ where: { isActive: true } });

    checks.push({
      name: 'Commission Plans',
      status: planCount > 0 ? 'healthy' : 'error',
      message: planCount > 0 
        ? `${planCount} plans (${activePlanCount} active)` 
        : 'No commission plans - affiliates cannot earn without plans',
      value: planCount,
      details: { total: planCount, active: activePlanCount }
    });

    // ========================================================================
    // Check 6: Plan Assignments
    // ========================================================================
    const affiliatesWithPlans = await prisma.affiliate.count({
      where: {
        planAssignments: {
          some: { effectiveTo: null }
        }
      }
    });
    const affiliatesWithoutPlans = affiliateCount - affiliatesWithPlans;

    checks.push({
      name: 'Plan Assignments',
      status: affiliatesWithoutPlans === 0 ? 'healthy' : 'warning',
      message: affiliatesWithoutPlans === 0 
        ? 'All affiliates have active plans' 
        : `${affiliatesWithoutPlans} affiliates without plans`,
      value: affiliatesWithPlans,
      details: { withPlans: affiliatesWithPlans, withoutPlans: affiliatesWithoutPlans }
    });

    // ========================================================================
    // Check 7: Patient Attribution
    // ========================================================================
    const patientsWithAttribution = await prisma.patient.count({
      where: { attributionAffiliateId: { not: null } }
    });
    const recentPatientsWithAttribution = await prisma.patient.count({
      where: {
        attributionAffiliateId: { not: null },
        createdAt: { gte: thirtyDaysAgo }
      }
    });

    checks.push({
      name: 'Patient Attribution',
      status: patientsWithAttribution > 0 ? 'healthy' : 'warning',
      message: patientsWithAttribution > 0 
        ? `${patientsWithAttribution} patients attributed (${recentPatientsWithAttribution} in last 30 days)` 
        : 'No patients have affiliate attribution',
      value: patientsWithAttribution,
      details: { total: patientsWithAttribution, last30Days: recentPatientsWithAttribution }
    });

    // ========================================================================
    // Check 8: Legacy Migration Status
    // ========================================================================
    const legacyInfluencerCount = await prisma.influencer.count({ where: { status: 'ACTIVE' } });
    
    // Find unmigrated codes
    const influencerCodes = await prisma.influencer.findMany({
      where: { status: 'ACTIVE' },
      select: { promoCode: true }
    });
    const affiliateCodes = await prisma.affiliateRefCode.findMany({
      select: { refCode: true }
    });
    const affiliateCodeSet = new Set(affiliateCodes.map(c => c.refCode.toUpperCase()));
    const unmigratedCodes = influencerCodes
      .filter(i => !affiliateCodeSet.has(i.promoCode.toUpperCase()))
      .map(i => i.promoCode);

    checks.push({
      name: 'Legacy Migration',
      status: unmigratedCodes.length === 0 ? 'healthy' : 'warning',
      message: unmigratedCodes.length === 0 
        ? 'All legacy codes migrated' 
        : `${unmigratedCodes.length} legacy codes need migration`,
      value: unmigratedCodes.length,
      details: { unmigrated: unmigratedCodes.slice(0, 10), legacyCount: legacyInfluencerCount }
    });

    // ========================================================================
    // Recent Activity
    // ========================================================================
    const recentTouches = await prisma.affiliateTouch.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: {
        affiliate: { select: { displayName: true } },
        clinic: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const recentCommissions = await prisma.affiliateCommissionEvent.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: {
        affiliate: { select: { displayName: true } },
        clinic: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    const recentReferrals = await prisma.referralTracking.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      include: {
        patient: {
          select: { attributionAffiliateId: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    // ========================================================================
    // Determine Overall Status
    // ========================================================================
    const hasErrors = checks.some(c => c.status === 'error');
    const hasWarnings = checks.some(c => c.status === 'warning');
    const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy';

    const response: DiagnosticsResponse = {
      timestamp: now.toISOString(),
      overallStatus,
      checks,
      recentActivity: {
        recentTouches: recentTouches.map(t => ({
          refCode: t.refCode,
          affiliateName: t.affiliate.displayName,
          clinicName: t.clinic.name,
          createdAt: t.createdAt.toISOString(),
          converted: !!t.convertedAt
        })),
        recentCommissions: recentCommissions.map(c => ({
          affiliateName: c.affiliate.displayName,
          clinicName: c.clinic.name,
          amountCents: c.eventAmountCents,
          commissionCents: c.commissionAmountCents,
          status: c.status,
          createdAt: c.createdAt.toISOString()
        })),
        recentReferrals: recentReferrals.map(r => ({
          promoCode: r.promoCode,
          patientId: r.patientId,
          hasModernAttribution: !!r.patient?.attributionAffiliateId,
          createdAt: r.createdAt.toISOString()
        }))
      },
      migrationStatus: {
        legacyInfluencerCount,
        modernAffiliateCount: affiliateCount,
        unmigratedCodes: unmigratedCodes.slice(0, 20)
      }
    };

    return NextResponse.json(response);

  } catch (error) {
    logger.error('[SuperAdmin Diagnostics] Failed to run diagnostics', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return NextResponse.json(
      { error: 'Failed to run diagnostics' },
      { status: 500 }
    );
  }
}

export const GET = withSuperAdminAuth(handler);
