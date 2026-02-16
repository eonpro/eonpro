/**
 * Super Admin Affiliate Analytics API
 *
 * Cross-clinic analytics for affiliate performance:
 * - Total codes, conversions, revenue across all clinics
 * - Per-clinic breakdown
 * - Top performing codes globally
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withSuperAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { suppressConversionMetrics, CLICK_FILTER, ACTIVE_COMMISSION_STATUSES } from '@/services/affiliate/reportingConstants';
import { serverError } from '@/lib/api/error-response';
import { superAdminRateLimit } from '@/lib/rateLimit';

interface ClinicBreakdown {
  clinicId: number;
  clinicName: string;
  totalCodes: number;
  totalClicks: number;
  totalConversions: number;
  totalRevenue: number;
  activeAffiliates: number;
}

interface TopCode {
  code: string;
  affiliateName: string;
  clinicName: string;
  conversions: string | number;
  revenue: string | number;
}

interface CrossClinicAnalyticsResponse {
  totals: {
    totalClinics: number;
    totalAffiliates: number;
    activeAffiliates: number;
    totalCodes: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
  };
  clinicBreakdown: ClinicBreakdown[];
  topCodes: TopCode[];
  trends: Array<{
    date: string;
    conversions: number;
    revenue: number;
  }>;
}

async function handler(req: NextRequest): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;
  const period = searchParams.get('period') || '30d';
  const clinicId = searchParams.get('clinicId');

  logger.info('[SuperAdmin Analytics] Starting request', { period, clinicId });

  // HIPAA/SOC2 audit log for super-admin access to cross-clinic analytics
  logger.security('[AffiliateAudit] Super admin accessed cross-clinic analytics', {
    action: 'CROSS_CLINIC_ANALYTICS_VIEWED',
    period,
    clinicFilter: clinicId || 'all',
  });

  try {
    // Calculate date range
    let dateFrom: Date = new Date();
    switch (period) {
      case '7d':
        dateFrom.setDate(dateFrom.getDate() - 7);
        break;
      case '30d':
        dateFrom.setDate(dateFrom.getDate() - 30);
        break;
      case '90d':
        dateFrom.setDate(dateFrom.getDate() - 90);
        break;
      case 'ytd':
        dateFrom = new Date(dateFrom.getFullYear(), 0, 1);
        break;
      case 'all':
        dateFrom = new Date(2020, 0, 1);
        break;
      default:
        dateFrom.setDate(dateFrom.getDate() - 30);
    }

    // Get all clinics with affiliate data
    const clinics = await prisma.clinic.findMany({
      where: clinicId ? { id: parseInt(clinicId, 10) } : {},
      select: {
        id: true,
        name: true,
      },
    });

    // Define clinic type
    type ClinicRecord = { id: number; name: string };

    logger.info('[SuperAdmin Analytics] Found clinics', { count: clinics.length });

    // Aggregate data per clinic using groupBy queries (replaces O(N×5) fan-out).
    // Previously: 5 queries per clinic × N clinics = 50-250 queries.
    // Now: 5 groupBy queries total, regardless of clinic count.
    const clinicFilter = clinicId ? { clinicId: parseInt(clinicId, 10) } : {};

    const [
      affiliatesByClinic,
      codesByClinic,
      clicksByClinic,
      conversionsByClinic,
      revenueByClinic,
      totalAffiliateCount,
      activeAffiliateCount,
    ] = await Promise.all([
      prisma.affiliate.groupBy({
        by: ['clinicId'],
        where: { ...clinicFilter, status: 'ACTIVE' },
        _count: true,
      }),
      prisma.affiliateRefCode.groupBy({
        by: ['clinicId'],
        where: { ...clinicFilter, isActive: true },
        _count: true,
      }),
      prisma.affiliateTouch.groupBy({
        by: ['clinicId'],
        where: {
          ...clinicFilter,
          ...CLICK_FILTER,
          createdAt: { gte: dateFrom },
        },
        _count: true,
      }),
      prisma.affiliateTouch.groupBy({
        by: ['clinicId'],
        where: {
          ...clinicFilter,
          convertedAt: { not: null, gte: dateFrom },
        },
        _count: true,
      }),
      prisma.affiliateCommissionEvent.groupBy({
        by: ['clinicId'],
        where: {
          ...clinicFilter,
          occurredAt: { gte: dateFrom },
          status: { in: ACTIVE_COMMISSION_STATUSES },
        },
        _sum: { eventAmountCents: true },
      }),
      prisma.affiliate.count(clinicId ? { where: clinicFilter } : undefined),
      prisma.affiliate.count({ where: { ...clinicFilter, status: 'ACTIVE' } }),
    ]);

    // Build lookup maps for O(1) access per clinic
    const affiliateMap = new Map(affiliatesByClinic.map(r => [r.clinicId, r._count]));
    const codesMap = new Map(codesByClinic.map(r => [r.clinicId, r._count]));
    const clicksMap = new Map(clicksByClinic.map(r => [r.clinicId, r._count]));
    const conversionsMap = new Map(conversionsByClinic.map(r => [r.clinicId, r._count]));
    const revenueMap = new Map(revenueByClinic.map(r => [r.clinicId, r._sum.eventAmountCents || 0]));

    const clinicBreakdown: ClinicBreakdown[] = clinics.map((clinic: ClinicRecord) => ({
      clinicId: clinic.id,
      clinicName: clinic.name,
      activeAffiliates: affiliateMap.get(clinic.id) || 0,
      totalCodes: codesMap.get(clinic.id) || 0,
      totalClicks: clicksMap.get(clinic.id) || 0,
      totalConversions: conversionsMap.get(clinic.id) || 0,
      totalRevenue: revenueMap.get(clinic.id) || 0,
    }));

    // Calculate totals from the aggregated breakdown (no additional queries needed)
    const totals = {
      totalClinics: clinics.length,
      totalAffiliates: totalAffiliateCount,
      activeAffiliates: activeAffiliateCount,
      totalCodes: clinicBreakdown.reduce((sum, c) => sum + c.totalCodes, 0),
      totalClicks: clinicBreakdown.reduce((sum, c) => sum + c.totalClicks, 0),
      totalConversions: clinicBreakdown.reduce((sum, c) => sum + c.totalConversions, 0),
      totalRevenue: clinicBreakdown.reduce((sum, c) => sum + c.totalRevenue, 0),
      avgConversionRate: 0,
    };

    totals.avgConversionRate =
      totals.totalClicks > 0 ? (totals.totalConversions / totals.totalClicks) * 100 : 0;

    // Get top performing codes using batch aggregation (replaces O(M×2) fan-out).
    // Previously: 2 queries per ref code × 50 codes = 100 queries.
    // Now: 1 findMany + 2 groupBy queries = 3 queries total.
    logger.info('[SuperAdmin Analytics] Fetching top codes');

    // Get ref codes with their relations (limited to active codes)
    const refCodes = await prisma.affiliateRefCode.findMany({
      where: clinicId ? { clinicId: parseInt(clinicId, 10) } : {},
      select: {
        refCode: true,
        affiliate: { select: { displayName: true } },
        clinic: { select: { name: true } },
      },
      take: 200,
    });

    type RefCodeWithRelations = {
      refCode: string;
      affiliate: { displayName: string };
      clinic: { name: string };
    };

    logger.info('[SuperAdmin Analytics] Found ref codes', { count: refCodes.length });

    // Batch: get conversions and revenue per refCode in 2 queries (not 2×N)
    const allRefCodeStrings = refCodes.map((c: RefCodeWithRelations) => c.refCode);

    const [conversionsByCode, revenueByCode] = await Promise.all([
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          refCode: { in: allRefCodeStrings },
          convertedAt: { not: null, gte: dateFrom },
        },
        _count: true,
      }),
      // Revenue per affiliate (since commissionEvent doesn't have refCode directly)
      // We use the total revenue per clinic as a proxy for top code ranking
      prisma.affiliateCommissionEvent.groupBy({
        by: ['affiliateId'],
        where: {
          occurredAt: { gte: dateFrom },
          status: { in: ACTIVE_COMMISSION_STATUSES },
        },
        _sum: { eventAmountCents: true },
      }),
    ]);

    const conversionMap = new Map(conversionsByCode.map(r => [r.refCode, r._count]));

    // Build top codes with metrics from the batch results
    const topCodesWithMetrics: TopCode[] = refCodes.map((code: RefCodeWithRelations) => {
      const codeConversions = conversionMap.get(code.refCode) || 0;
      const suppressed = suppressConversionMetrics({
        conversions: codeConversions,
        revenueCents: 0,
      });
      return {
        code: code.refCode,
        affiliateName: code.affiliate.displayName,
        clinicName: code.clinic.name,
        conversions: suppressed.conversions,
        revenue: 0,
      };
    });

    // Sort by conversions and take top 10
    const topCodes = topCodesWithMetrics.sort((a, b) => Number(b.conversions) - Number(a.conversions)).slice(0, 10);

    // Get daily trends for the period using batch queries (avoids N+1 loop)
    logger.info('[SuperAdmin Analytics] Calculating trends');
    const days = Math.min(Math.ceil((Date.now() - dateFrom.getTime()) / (24 * 60 * 60 * 1000)), 30);
    const trendStart = new Date();
    trendStart.setDate(trendStart.getDate() - (days - 1));
    trendStart.setHours(0, 0, 0, 0);

    const clinicFilterRaw = clinicId ? parseInt(clinicId, 10) : null;

    const [conversionTrends, revenueTrends] = await Promise.all([
      // Batch: conversions by day
      prisma.$queryRaw<Array<{ date: Date; count: number }>>`
        SELECT DATE("convertedAt") as date, COUNT(*)::int as count
        FROM "AffiliateTouch"
        WHERE "convertedAt" IS NOT NULL
          AND "convertedAt" >= ${trendStart}
          ${clinicFilterRaw ? prisma.$queryRaw`AND "clinicId" = ${clinicFilterRaw}` : prisma.$queryRaw``}
        GROUP BY DATE("convertedAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; count: number }>),
      // Batch: revenue by day (use occurredAt for date alignment)
      prisma.$queryRaw<Array<{ date: Date; revenue: number }>>`
        SELECT DATE("occurredAt") as date, COALESCE(SUM("eventAmountCents"), 0)::int as revenue
        FROM "AffiliateCommissionEvent"
        WHERE "occurredAt" >= ${trendStart}
          AND status IN ('PENDING', 'APPROVED', 'PAID')
          ${clinicFilterRaw ? prisma.$queryRaw`AND "clinicId" = ${clinicFilterRaw}` : prisma.$queryRaw``}
        GROUP BY DATE("occurredAt")
        ORDER BY date
      `.catch(() => [] as Array<{ date: Date; revenue: number }>),
    ]);

    // Build a date-keyed map for O(1) lookup
    const conversionMap = new Map(conversionTrends.map(t => [new Date(t.date).toISOString().slice(0, 10), t.count]));
    const revenueMap = new Map(revenueTrends.map(t => [new Date(t.date).toISOString().slice(0, 10), t.revenue]));

    const trends: Array<{ date: string; conversions: number; revenue: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const key = dayStart.toISOString().slice(0, 10);
      trends.push({
        date: dayStart.toISOString(),
        conversions: conversionMap.get(key) || 0,
        revenue: revenueMap.get(key) || 0,
      });
    }

    const response: CrossClinicAnalyticsResponse = {
      totals,
      clinicBreakdown: clinicBreakdown.sort(
        (a: ClinicBreakdown, b: ClinicBreakdown) => b.totalConversions - a.totalConversions
      ),
      topCodes,
      trends,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('[SuperAdmin Analytics] Failed to fetch analytics', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return serverError('Failed to fetch analytics data');
  }
}

export const GET = superAdminRateLimit(withSuperAdminAuth(handler));
