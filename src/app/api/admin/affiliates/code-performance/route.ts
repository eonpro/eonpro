/**
 * Admin Affiliate Code Performance API
 *
 * Returns performance metrics for all affiliate ref codes:
 * - Code, Affiliate Name, Clicks, Conversions, Revenue, Conversion Rate
 * - Sortable by any column
 * - Filterable by date range, affiliate, status
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';

interface CodePerformance {
  code: string;
  affiliateId: number;
  affiliateName: string;
  affiliateStatus: string;
  uses: number;  // Code uses (someone entered the code in intake)
  clicks: number;  // Alias for uses (for backward compatibility)
  conversions: number;  // Actual paying customers
  revenue: number; // in cents
  conversionRate: number; // percentage
  lastUseAt: string | null;
  lastClickAt: string | null;  // Alias for lastUseAt
  lastConversionAt: string | null;
  createdAt: string;
}

interface CodePerformanceResponse {
  codes: CodePerformance[];
  totals: {
    totalCodes: number;
    totalUses: number;
    totalClicks: number;  // Alias for totalUses
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
  const search = searchParams.get('search');

  try {
    // Determine clinic filter based on user role
    // For super_admin, no clinic filter; for admin, filter by their clinic
    const clinicFilter = user.role === 'super_admin'
      ? {}
      : user.clinicId
        ? { clinicId: user.clinicId }
        : {}; // If no clinicId, show all (fallback)

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
      ...(search ? {
        OR: [
          { refCode: { contains: search, mode: 'insensitive' } },
          { affiliate: { displayName: { contains: search, mode: 'insensitive' } } },
        ],
      } : {}),
    };

    // Fetch all ref codes with affiliate info from modern system
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

    // Also fetch from legacy Influencer table
    const legacyInfluencers = await prisma.influencer.findMany({
      where: {
        ...(user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : {}),
        ...(search ? {
          OR: [
            { promoCode: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        } : {}),
      },
      select: {
        id: true,
        promoCode: true,
        name: true,
        status: true,
        createdAt: true,
        clinicId: true,
      },
    });

    // Define refCode type
    type RefCodeWithAffiliate = {
      refCode: string;
      affiliateId: number;
      createdAt: Date;
      isLegacy: boolean;
      affiliate: {
        id: number;
        displayName: string;
        status: string;
      };
    };

    // Define types for the records
    type ModernRefCode = typeof modernRefCodes[number];
    type LegacyInfluencer = typeof legacyInfluencers[number];

    // Build a Set of modern ref codes for deduplication
    const modernCodeSet = new Set(modernRefCodes.map((rc: ModernRefCode) => rc.refCode.toUpperCase()));

    // Combine both systems, but deduplicate (prefer modern over legacy)
    const refCodes: RefCodeWithAffiliate[] = [
      // Modern affiliate ref codes (primary)
      ...modernRefCodes.map((rc: ModernRefCode) => ({
        refCode: rc.refCode,
        affiliateId: rc.affiliateId,
        createdAt: rc.createdAt,
        isLegacy: false,
        affiliate: {
          id: rc.affiliate.id,
          displayName: rc.affiliate.displayName,
          status: rc.affiliate.status,
        },
      })),
      // Legacy influencer codes (only if not already in modern system)
      ...legacyInfluencers
        .filter((inf: LegacyInfluencer) =>
          inf.promoCode && !modernCodeSet.has(inf.promoCode.toUpperCase())
        )
        .map((inf: LegacyInfluencer) => ({
          refCode: inf.promoCode!,
          affiliateId: inf.id,
          createdAt: inf.createdAt,
          isLegacy: true,
          affiliate: {
            id: inf.id,
            displayName: inf.name,
            status: inf.status,
          },
        })),
    ];

    logger.info('[CodePerformance] Processing codes', {
      userId: user.id,
      userRole: user.role,
      userClinicId: user.clinicId,
      clinicFilter,
      dateFrom: dateFrom.toISOString(),
      dateTo: dateTo.toISOString(),
      modernRefCodesCount: modernRefCodes.length,
      legacyInfluencersCount: legacyInfluencers.length,
      totalRefCodesCount: refCodes.length,
    });

    // Get performance metrics for each code
    const codePerformances: CodePerformance[] = await Promise.all(
      refCodes.map(async (refCode: RefCodeWithAffiliate) => {
        let uses = 0;  // Code uses (intake submissions with this code)
        let conversions = 0;  // Actual paying customers
        let revenue = 0;
        let lastUseAt: Date | null = null;
        let lastConversionAt: Date | null = null;

        try {
          if (refCode.isLegacy) {
            // For legacy codes, get data from ReferralTracking table
            const referralCount = await prisma.referralTracking.count({
              where: {
                promoCode: refCode.refCode,
                createdAt: {
                  gte: dateFrom,
                  lte: dateTo,
                },
              },
            });
            // Legacy system doesn't differentiate uses from conversions
            // All referral tracking entries are considered "uses"
            uses = referralCount;

            // For conversions, check if there's revenue (commission events)
            const legacyCommissions = await prisma.commission.count({
              where: {
                influencer: { promoCode: refCode.refCode },
                createdAt: { gte: dateFrom, lte: dateTo },
              },
            });
            conversions = legacyCommissions;

            // Get last referral (use)
            const lastReferral = await prisma.referralTracking.findFirst({
              where: {
                promoCode: refCode.refCode,
              },
              orderBy: { createdAt: 'desc' },
              select: { createdAt: true },
            });
            lastUseAt = lastReferral?.createdAt || null;
          } else {
          // For modern codes, get data from AffiliateTouch table
          // Uses = all touch records (someone used the code)
          const usesResult = await prisma.affiliateTouch.aggregate({
            where: {
              refCode: refCode.refCode,
              ...clinicFilter,
              createdAt: {
                gte: dateFrom,
                lte: dateTo,
              },
            },
            _count: true,
          });
          uses = usesResult._count;

          // Debug logging for specific codes
          if (refCode.refCode === 'TEAMSAV') {
            logger.info('[CodePerformance] TEAMSAV debug', {
              code: refCode.refCode,
              isLegacy: refCode.isLegacy,
              usesCount: uses,
              clinicFilter,
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString(),
            });
          }

          // Conversions = touches with convertedAt set (paying customers)
          const conversionsResult = await prisma.affiliateTouch.aggregate({
            where: {
              refCode: refCode.refCode,
              ...clinicFilter,
              convertedAt: { not: null },
              createdAt: {
                gte: dateFrom,
                lte: dateTo,
              },
            },
            _count: true,
          });
          conversions = conversionsResult._count;

          // Get revenue from commission events
          const revenueResult = await prisma.affiliateCommissionEvent.aggregate({
            where: {
              affiliate: {
                refCodes: {
                  some: { refCode: refCode.refCode },
                },
              },
              ...clinicFilter,
              createdAt: {
                gte: dateFrom,
                lte: dateTo,
              },
              status: { in: ['PENDING', 'APPROVED', 'PAID'] },
            },
            _sum: {
              orderAmountCents: true,
            },
          });
          revenue = revenueResult._sum.orderAmountCents || 0;

          // Get last use (most recent touch)
          const lastUseRecord = await prisma.affiliateTouch.findFirst({
            where: {
              refCode: refCode.refCode,
              ...clinicFilter,
            },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          });
          lastUseAt = lastUseRecord?.createdAt || null;

          // Get last conversion (most recent converted touch)
          const lastConversionRecord = await prisma.affiliateTouch.findFirst({
            where: {
              refCode: refCode.refCode,
              ...clinicFilter,
              convertedAt: { not: null },
            },
            orderBy: { convertedAt: 'desc' },
            select: { convertedAt: true },
          });
          lastConversionAt = lastConversionRecord?.convertedAt || null;
        }

        const conversionRate = uses > 0 ? (conversions / uses) * 100 : 0;

        return {
          code: refCode.refCode,
          affiliateId: refCode.affiliateId,
          affiliateName: refCode.affiliate.displayName,
          affiliateStatus: String(refCode.affiliate.status),
          uses,
          clicks: uses,  // Backward compatibility alias
          conversions,
          revenue,
          conversionRate,
          lastUseAt: lastUseAt?.toISOString() || null,
          lastClickAt: lastUseAt?.toISOString() || null,  // Backward compatibility alias
          lastConversionAt: lastConversionAt?.toISOString() || null,
          createdAt: refCode.createdAt.toISOString(),
        };
        } catch (err) {
          // Return empty metrics if query fails for this code
          logger.warn('[CodePerformance] Failed to get metrics for code', {
            code: refCode.refCode,
            error: err instanceof Error ? err.message : 'Unknown',
          });
          return {
            code: refCode.refCode,
            affiliateId: refCode.affiliateId,
            affiliateName: refCode.affiliate.displayName,
            affiliateStatus: String(refCode.affiliate.status),
            uses: 0,
            clicks: 0,
            conversions: 0,
            revenue: 0,
            conversionRate: 0,
            lastUseAt: null,
            lastClickAt: null,
            lastConversionAt: null,
            createdAt: refCode.createdAt.toISOString(),
          };
        }
      })
    );

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
        case 'clicks':  // Backward compatibility
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
        case 'lastClickAt':  // Backward compatibility
          comparison = (a.lastUseAt || '').localeCompare(b.lastUseAt || '');
          break;
        default:
          comparison = a.conversions - b.conversions;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Calculate totals
    const totalUses = sortedPerformances.reduce((sum, c) => sum + c.uses, 0);
    const totals = {
      totalCodes: sortedPerformances.length,
      totalUses,
      totalClicks: totalUses,  // Backward compatibility alias
      totalConversions: sortedPerformances.reduce((sum, c) => sum + c.conversions, 0),
      totalRevenue: sortedPerformances.reduce((sum, c) => sum + c.revenue, 0),
      avgConversionRate: sortedPerformances.length > 0
        ? sortedPerformances.reduce((sum, c) => sum + c.conversionRate, 0) / sortedPerformances.length
        : 0,
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
    logger.error('[CodePerformance] Failed to fetch code performance', {
      userId: user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return NextResponse.json(
      { error: 'Failed to fetch code performance data' },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handler);
