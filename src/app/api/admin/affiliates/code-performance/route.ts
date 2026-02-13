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
import { handleApiError } from '@/domains/shared/errors';

interface CodePerformance {
  code: string;
  affiliateId: number;
  affiliateName: string;
  affiliateStatus: string;
  uses: number; // Code uses (someone entered the code in intake)
  clicks: number; // Alias for uses (for backward compatibility)
  conversions: number; // Actual paying customers
  revenue: number; // in cents
  conversionRate: number; // percentage
  taggedProfiles: number; // Patient count with this ref code (attributionRefCode or tags)
  lastUseAt: string | null;
  lastClickAt: string | null; // Alias for lastUseAt
  lastConversionAt: string | null;
  createdAt: string;
}

interface CodePerformanceResponse {
  codes: CodePerformance[];
  totals: {
    totalCodes: number;
    totalUses: number;
    totalClicks: number; // Alias for totalUses
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
    const clinicFilter =
      user.role === 'super_admin' ? {} : user.clinicId ? { clinicId: user.clinicId } : {}; // If no clinicId, show all (fallback)

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
      take: 100,
    });

    // Also fetch from legacy Influencer table
    const legacyInfluencers = await prisma.influencer.findMany({
      where: {
        ...(user.role !== 'super_admin' && user.clinicId ? { clinicId: user.clinicId } : {}),
        ...(search
          ? {
              OR: [
                { promoCode: { contains: search, mode: 'insensitive' as const } },
                { name: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      take: 100,
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
      clinicId: number | null;
      createdAt: Date;
      isLegacy: boolean;
      affiliate: {
        id: number;
        displayName: string;
        status: string;
      };
    };

    // Define types for the records
    type ModernRefCode = (typeof modernRefCodes)[number];
    type LegacyInfluencer = (typeof legacyInfluencers)[number];

    // Build a Set of modern ref codes for deduplication
    const modernCodeSet = new Set(
      modernRefCodes.map((rc: ModernRefCode) => rc.refCode.toUpperCase())
    );

    // Combine both systems, but deduplicate (prefer modern over legacy)
    const refCodes: RefCodeWithAffiliate[] = [
      // Modern affiliate ref codes (primary)
      ...modernRefCodes.map((rc: ModernRefCode) => ({
        refCode: rc.refCode,
        affiliateId: rc.affiliateId,
        clinicId: rc.clinicId,
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
        .filter(
          (inf: LegacyInfluencer) =>
            inf.promoCode && !modernCodeSet.has(inf.promoCode.toUpperCase())
        )
        .map((inf: LegacyInfluencer) => ({
          refCode: inf.promoCode!,
          affiliateId: inf.id,
          clinicId: inf.clinicId,
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
        let uses = 0; // Code uses (intake submissions with this code)
        let conversions = 0; // Actual paying customers
        let revenue = 0;
        let lastUseAt: Date | null = null;
        let lastConversionAt: Date | null = null;
        let taggedProfiles = 0;

        try {
          // Tagged profiles = patients with this ref code (attributionRefCode or tags) in this code's clinic
          const normalizedCode = refCode.refCode.trim().toUpperCase();
          if (refCode.clinicId != null) {
            const taggedWhere = {
              clinicId: refCode.clinicId,
              OR: [
                { attributionRefCode: { equals: normalizedCode, mode: 'insensitive' as const } },
                { tags: { array_contains: [normalizedCode] } },
                { tags: { array_contains: [`affiliate:${normalizedCode}`] } },
                { tags: { array_contains: [`influencer:${normalizedCode}`] } },
              ],
            };
            taggedProfiles = await prisma.patient.count({ where: taggedWhere });
          }

          if (refCode.isLegacy) {
            // For legacy codes, get data from ReferralTracking table - all queries in parallel
            const [referralCount, legacyCommissions, lastReferral] = await Promise.all([
              prisma.referralTracking.count({
                where: {
                  promoCode: refCode.refCode,
                  createdAt: {
                    gte: dateFrom,
                    lte: dateTo,
                  },
                },
              }),
              // For conversions, check if there's revenue (commission events)
              prisma.commission.count({
                where: {
                  influencer: { promoCode: refCode.refCode },
                  createdAt: { gte: dateFrom, lte: dateTo },
                },
              }),
              // Get last referral (use)
              prisma.referralTracking.findFirst({
                where: {
                  promoCode: refCode.refCode,
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
              }),
            ]);
            // Legacy system doesn't differentiate uses from conversions
            // All referral tracking entries are considered "uses"
            uses = referralCount;
            conversions = legacyCommissions;
            lastUseAt = lastReferral?.createdAt || null;
          } else {
            // For modern codes, get data from BOTH AffiliateTouch (modern) AND ReferralTracking (legacy)
            // This is important because legacy tracking data may exist for codes that are now in the modern system
            // Run all queries in parallel for performance
            const [
              modernUsesResult,
              legacyUsesResult,
              modernConversionsResult,
              legacyConversionsResult,
              revenueResult,
              lastModernUse,
              lastLegacyUse,
              lastConversionRecord,
            ] = await Promise.all([
              // Modern uses from AffiliateTouch
              prisma.affiliateTouch.aggregate({
                where: {
                  refCode: refCode.refCode,
                  ...clinicFilter,
                  createdAt: {
                    gte: dateFrom,
                    lte: dateTo,
                  },
                },
                _count: true,
              }),
              // Legacy uses from ReferralTracking (case-insensitive match)
              prisma.referralTracking.count({
                where: {
                  promoCode: { equals: refCode.refCode, mode: 'insensitive' },
                  createdAt: {
                    gte: dateFrom,
                    lte: dateTo,
                  },
                },
              }),
              // Modern conversions from AffiliateTouch
              prisma.affiliateTouch.aggregate({
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
              }),
              // Legacy conversions from ReferralTracking (isConverted = true)
              prisma.referralTracking.count({
                where: {
                  promoCode: { equals: refCode.refCode, mode: 'insensitive' },
                  isConverted: true,
                  createdAt: {
                    gte: dateFrom,
                    lte: dateTo,
                  },
                },
              }),
              // Get revenue from commission events
              prisma.affiliateCommissionEvent.aggregate({
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
                  eventAmountCents: true,
                },
              }),
              // Get last use (most recent touch) from both systems
              prisma.affiliateTouch.findFirst({
                where: {
                  refCode: refCode.refCode,
                  ...clinicFilter,
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
              }),
              prisma.referralTracking.findFirst({
                where: {
                  promoCode: { equals: refCode.refCode, mode: 'insensitive' },
                },
                orderBy: { createdAt: 'desc' },
                select: { createdAt: true },
              }),
              // Get last conversion (most recent converted touch)
              prisma.affiliateTouch.findFirst({
                where: {
                  refCode: refCode.refCode,
                  ...clinicFilter,
                  convertedAt: { not: null },
                },
                orderBy: { convertedAt: 'desc' },
                select: { convertedAt: true },
              }),
            ]);

            uses = modernUsesResult._count + legacyUsesResult;

            // Debug logging for specific codes
            if (['TEAMSAV', 'JACOB10', 'INST69D37F'].includes(refCode.refCode.toUpperCase())) {
              logger.info('[CodePerformance] Code debug', {
                code: refCode.refCode,
                isLegacy: refCode.isLegacy,
                modernUses: modernUsesResult._count,
                legacyUses: legacyUsesResult,
                totalUses: uses,
                clinicFilter,
                dateFrom: dateFrom.toISOString(),
                dateTo: dateTo.toISOString(),
              });
            }

            conversions = modernConversionsResult._count + legacyConversionsResult;
            revenue = revenueResult._sum.eventAmountCents || 0;

            // Use the most recent of the two
            if (lastModernUse && lastLegacyUse) {
              lastUseAt =
                lastModernUse.createdAt > lastLegacyUse.createdAt
                  ? lastModernUse.createdAt
                  : lastLegacyUse.createdAt;
            } else {
              lastUseAt = lastModernUse?.createdAt || lastLegacyUse?.createdAt || null;
            }

            lastConversionAt = lastConversionRecord?.convertedAt || null;
          }

          const conversionRate = uses > 0 ? (conversions / uses) * 100 : 0;

          return {
            code: refCode.refCode,
            affiliateId: refCode.affiliateId,
            affiliateName: refCode.affiliate.displayName,
            affiliateStatus: String(refCode.affiliate.status),
            uses,
            clicks: uses, // Backward compatibility alias
            conversions,
            revenue,
            conversionRate,
            taggedProfiles,
            lastUseAt: lastUseAt?.toISOString() || null,
            lastClickAt: lastUseAt?.toISOString() || null, // Backward compatibility alias
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
            taggedProfiles: 0,
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
        case 'clicks': // Backward compatibility
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
        case 'lastClickAt': // Backward compatibility
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
      totalClicks: totalUses, // Backward compatibility alias
      totalConversions: sortedPerformances.reduce((sum, c) => sum + c.conversions, 0),
      totalRevenue: sortedPerformances.reduce((sum, c) => sum + c.revenue, 0),
      avgConversionRate:
        sortedPerformances.length > 0
          ? sortedPerformances.reduce((sum, c) => sum + c.conversionRate, 0) /
            sortedPerformances.length
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
    return handleApiError(error, { route: 'GET /api/admin/affiliates/code-performance' });
  }
}

export const GET = withAdminAuth(handler);
