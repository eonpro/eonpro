/**
 * Admin Affiliate Code Performance API
 *
 * Returns performance metrics for all affiliate ref codes:
 * - Code, Affiliate Name, Clicks, Conversions, Revenue, Conversion Rate
 * - Sortable by any column
 * - Filterable by date range, affiliate, status
 *
 * Optimized: uses batch aggregation queries (GROUP BY refCode)
 * instead of per-code queries to avoid N+1 query patterns.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { suppressSmallNumber } from '@/services/affiliate/reportingConstants';

interface CodePerformance {
  code: string;
  affiliateId: number;
  affiliateName: string;
  affiliateStatus: string;
  uses: number;
  clicks: number;
  conversions: number;
  revenue: number;
  conversionRate: number;
  taggedProfiles: number;
  lastUseAt: string | null;
  lastClickAt: string | null;
  lastConversionAt: string | null;
  createdAt: string;
}

interface CodePerformanceResponse {
  codes: CodePerformance[];
  totals: {
    totalCodes: number;
    totalUses: number;
    totalClicks: number;
    totalConversions: number;
    totalRevenue: number;
    avgConversionRate: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

async function handler(req: NextRequest, user: any): Promise<Response> {
  const searchParams = req.nextUrl.searchParams;

  // HIPAA audit: log admin access to affiliate code performance data
  logger.security('[AffiliateAudit] Admin accessed code performance', {
    adminUserId: user.id,
    adminRole: user.role,
    route: req.nextUrl.pathname,
    clinicId: user.clinicId,
  });

  // Parse query parameters
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
  const sortBy = searchParams.get('sortBy') || 'conversions';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';
  const affiliateId = searchParams.get('affiliateId');
  const status = searchParams.get('status');
  const period = searchParams.get('period') || '30d';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search')?.trim() || null;

  try {
    // Determine clinic filter based on user role
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {};

    // Calculate date range
    let dateFrom: Date;
    let dateTo: Date = new Date();

    if (startDate && endDate) {
      dateFrom = new Date(startDate);
      dateTo = new Date(endDate);
    } else {
      dateFrom = new Date();
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
    }

    // Build where clause for ref codes
    const refCodeWhere: any = {
      ...clinicFilter,
      ...(affiliateId ? { affiliateId: parseInt(affiliateId, 10) } : {}),
      ...(status ? { affiliate: { status } } : {}),
      ...(search
        ? {
            OR: [
              { refCode: { contains: search, mode: 'insensitive' } },
              { affiliate: { displayName: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    // Fetch all ref codes with affiliate info
    const modernRefCodes = await prisma.affiliateRefCode.findMany({
      where: refCodeWhere,
      include: {
        affiliate: {
          select: {
            id: true,
            displayName: true,
            status: true,
          },
        },
      },
    });

    type ModernRefCode = (typeof modernRefCodes)[number];

    const refCodes = modernRefCodes.map((rc: ModernRefCode) => ({
      refCode: rc.refCode,
      affiliateId: rc.affiliateId,
      clinicId: rc.clinicId,
      createdAt: rc.createdAt,
      affiliate: {
        id: rc.affiliate.id,
        displayName: rc.affiliate.displayName,
        status: rc.affiliate.status,
      },
    }));

    logger.info('[CodePerformance] Processing codes', {
      userId: user.id,
      userRole: user.role,
      userClinicId: user.clinicId,
      clinicFilter,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      totalRefCodesCount: refCodes.length,
    });

    if (refCodes.length === 0) {
      return NextResponse.json({
        codes: [],
        totals: { totalCodes: 0, totalUses: 0, totalClicks: 0, totalConversions: 0, totalRevenue: 0, avgConversionRate: 0 },
        pagination: { page, limit, total: 0, hasMore: false },
      });
    }

    const codeList = refCodes.map((c) => c.refCode);

    // Build clinic ID filter for raw SQL
    const clinicIdValue = user.role !== 'super_admin' && user.clinicId ? user.clinicId : null;

    // Run all batch aggregation queries in parallel
    const [
      usesByCode,
      conversionsByCode,
      revenueByCode,
      lastUseByCode,
      lastConversionByCode,
      taggedProfilesByCode,
    ] = await Promise.all([
      // Batch: clicks per code (CLICK type only — the standard click metric)
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          ...clinicFilter,
          refCode: { in: codeList },
          touchType: 'CLICK',
          createdAt: { gte: dateFrom, lte: dateTo },
        },
        _count: true,
      }),

      // Batch: conversions per code (filter by convertedAt date range — implies non-null)
      prisma.affiliateTouch.groupBy({
        by: ['refCode'],
        where: {
          ...clinicFilter,
          refCode: { in: codeList },
          convertedAt: { gte: dateFrom, lte: dateTo },
        },
        _count: true,
      }),

      // Batch: revenue per code via raw SQL (JSONB metadata filtering)
      prisma.$queryRaw<
        Array<{ refCode: string; revenueCents: number }>
      >`
        SELECT
          metadata->>'refCode' as "refCode",
          COALESCE(SUM("eventAmountCents"), 0)::int as "revenueCents"
        FROM "AffiliateCommissionEvent"
        WHERE "occurredAt" >= ${dateFrom}
          AND "occurredAt" <= ${dateTo}
          AND "status" IN ('PENDING', 'APPROVED', 'PAID')
          AND metadata->>'refCode' = ANY(${codeList})
          ${clinicIdValue ? prisma.$queryRaw`AND "clinicId" = ${clinicIdValue}` : prisma.$queryRaw``}
        GROUP BY metadata->>'refCode'
      `,

      // Batch: last use per code
      prisma.$queryRaw<
        Array<{ refCode: string; lastUseAt: Date }>
      >`
        SELECT "refCode", MAX("createdAt") as "lastUseAt"
        FROM "AffiliateTouch"
        WHERE "refCode" = ANY(${codeList})
          ${clinicIdValue ? prisma.$queryRaw`AND "clinicId" = ${clinicIdValue}` : prisma.$queryRaw``}
        GROUP BY "refCode"
      `,

      // Batch: last conversion per code
      prisma.$queryRaw<
        Array<{ refCode: string; lastConversionAt: Date }>
      >`
        SELECT "refCode", MAX("convertedAt") as "lastConversionAt"
        FROM "AffiliateTouch"
        WHERE "refCode" = ANY(${codeList})
          AND "convertedAt" IS NOT NULL
          ${clinicIdValue ? prisma.$queryRaw`AND "clinicId" = ${clinicIdValue}` : prisma.$queryRaw``}
        GROUP BY "refCode"
      `,

      // Batch: tagged profiles per code (patients attributed via ref code)
      prisma.$queryRaw<
        Array<{ refCode: string; taggedProfiles: number }>
      >`
        SELECT "attributionRefCode" as "refCode", COUNT(*)::int as "taggedProfiles"
        FROM "Patient"
        WHERE "attributionRefCode" = ANY(${codeList})
          ${clinicIdValue ? prisma.$queryRaw`AND "clinicId" = ${clinicIdValue}` : prisma.$queryRaw``}
        GROUP BY "attributionRefCode"
      `,
    ]);

    // Build lookup maps for O(1) per-code access
    const usesMap = new Map(usesByCode.map((r) => [r.refCode, r._count]));
    const conversionsMap = new Map(conversionsByCode.map((r) => [r.refCode, r._count]));
    const revenueMap = new Map((revenueByCode || []).map((r) => [r.refCode, r.revenueCents]));
    const lastUseMap = new Map((lastUseByCode || []).map((r) => [r.refCode, r.lastUseAt]));
    const lastConversionMap = new Map((lastConversionByCode || []).map((r) => [r.refCode, r.lastConversionAt]));
    const taggedMap = new Map((taggedProfilesByCode || []).map((r) => [r.refCode, r.taggedProfiles]));

    // Assemble per-code performance from pre-aggregated data
    const codePerformances: CodePerformance[] = refCodes.map((refCode) => {
      const uses = usesMap.get(refCode.refCode) || 0;
      const conversions = conversionsMap.get(refCode.refCode) || 0;
      const revenue = revenueMap.get(refCode.refCode) || 0;
      const taggedProfiles = taggedMap.get(refCode.refCode) || 0;
      const lastUseAt = lastUseMap.get(refCode.refCode) || null;
      const lastConversionAt = lastConversionMap.get(refCode.refCode) || null;
      const conversionRate = uses > 0 ? (conversions / uses) * 100 : 0;

      // HIPAA: suppress small conversion counts to prevent patient re-identification
      const suppressedConversions = suppressSmallNumber(conversions);
      const isSuppressed = typeof suppressedConversions === 'string';

      return {
        code: refCode.refCode,
        affiliateId: refCode.affiliateId,
        affiliateName: refCode.affiliate.displayName,
        affiliateStatus: String(refCode.affiliate.status),
        uses,
        clicks: uses,
        conversions: suppressedConversions,
        revenue: isSuppressed ? null : revenue,
        conversionRate: isSuppressed ? null : conversionRate,
        taggedProfiles,
        lastUseAt: lastUseAt instanceof Date ? lastUseAt.toISOString() : lastUseAt ? String(lastUseAt) : null,
        lastClickAt: lastUseAt instanceof Date ? lastUseAt.toISOString() : lastUseAt ? String(lastUseAt) : null,
        lastConversionAt: lastConversionAt instanceof Date ? lastConversionAt.toISOString() : lastConversionAt ? String(lastConversionAt) : null,
        createdAt: refCode.createdAt.toISOString(),
      };
    });

    // Sort results
    const sortedPerformances = codePerformances.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'code':
          comparison = a.code.localeCompare(b.code);
          break;
        case 'affiliateName':
          comparison = a.affiliateName.localeCompare(b.affiliateName);
          break;
        case 'uses':
        case 'clicks':
          comparison = a.uses - b.uses;
          break;
        case 'conversions':
          comparison = a.conversions - b.conversions;
          break;
        case 'revenue':
          comparison = a.revenue - b.revenue;
          break;
        case 'conversionRate':
          comparison = a.conversionRate - b.conversionRate;
          break;
        case 'lastUseAt':
        case 'lastClickAt':
          comparison = (a.lastUseAt || '').localeCompare(b.lastUseAt || '');
          break;
        default:
          comparison = a.conversions - b.conversions;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Calculate totals with weighted average conversion rate
    const totalUses = sortedPerformances.reduce((sum, c) => sum + c.uses, 0);
    const totalConversions = sortedPerformances.reduce((sum, c) => sum + c.conversions, 0);
    const totals = {
      totalCodes: sortedPerformances.length,
      totalUses,
      totalClicks: totalUses,
      totalConversions,
      totalRevenue: sortedPerformances.reduce((sum, c) => sum + c.revenue, 0),
      avgConversionRate: totalUses > 0 ? (totalConversions / totalUses) * 100 : 0,
    };

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedResults = sortedPerformances.slice(startIndex, startIndex + limit);

    const response: CodePerformanceResponse = {
      codes: paginatedResults,
      totals,
      pagination: {
        page,
        limit,
        total: sortedPerformances.length,
        hasMore: startIndex + limit < sortedPerformances.length,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    return handleApiError(error, { route: 'GET /api/admin/affiliates/code-performance' });
  }
}

export const GET = withAdminAuth(handler);
