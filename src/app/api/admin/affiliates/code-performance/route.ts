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
  clicks: number;
  conversions: number;
  revenue: number; // in cents
  conversionRate: number; // percentage
  lastClickAt: string | null;
  lastConversionAt: string | null;
  createdAt: string;
}

interface CodePerformanceResponse {
  codes: CodePerformance[];
  totals: {
    totalCodes: number;
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
    const clinicFilter = user.role === 'super_admin' ? {} : { clinicId: user.clinicId };

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

    // Fetch all ref codes with affiliate info
    const refCodes = await prisma.affiliateRefCode.findMany({
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

    // Define refCode type
    type RefCodeWithAffiliate = {
      refCode: string;
      affiliateId: number;
      createdAt: Date;
      affiliate: {
        id: number;
        displayName: string;
        status: string;
      };
    };

    // Get performance metrics for each code
    const codePerformances: CodePerformance[] = await Promise.all(
      refCodes.map(async (refCode: RefCodeWithAffiliate) => {
        // Get clicks (touches) for this code in date range
        const clicksResult = await prisma.affiliateTouch.aggregate({
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

        // Get conversions (touches that converted) for this code in date range
        const conversionsResult = await prisma.affiliateTouch.aggregate({
          where: {
            refCode: refCode.refCode,
            ...clinicFilter,
            convertedAt: {
              gte: dateFrom,
              lte: dateTo,
            },
          },
          _count: true,
        });

        // Get revenue from commission events for this code in date range
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

        // Get last click and conversion timestamps
        const lastClick = await prisma.affiliateTouch.findFirst({
          where: {
            refCode: refCode.refCode,
            ...clinicFilter,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        const lastConversion = await prisma.affiliateTouch.findFirst({
          where: {
            refCode: refCode.refCode,
            ...clinicFilter,
            convertedAt: { not: null },
          },
          orderBy: { convertedAt: 'desc' },
          select: { convertedAt: true },
        });

        const clicks = clicksResult._count;
        const conversions = conversionsResult._count;
        const revenue = revenueResult._sum.orderAmountCents || 0;
        const conversionRate = clicks > 0 ? (conversions / clicks) * 100 : 0;

        return {
          code: refCode.refCode,
          affiliateId: refCode.affiliateId,
          affiliateName: refCode.affiliate.displayName,
          affiliateStatus: refCode.affiliate.status,
          clicks,
          conversions,
          revenue,
          conversionRate,
          lastClickAt: lastClick?.createdAt?.toISOString() || null,
          lastConversionAt: lastConversion?.convertedAt?.toISOString() || null,
          createdAt: refCode.createdAt.toISOString(),
        };
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
        case 'clicks':
          comparison = a.clicks - b.clicks;
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
        case 'lastClickAt':
          comparison = (a.lastClickAt || '').localeCompare(b.lastClickAt || '');
          break;
        default:
          comparison = a.conversions - b.conversions;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Calculate totals
    const totals = {
      totalCodes: sortedPerformances.length,
      totalClicks: sortedPerformances.reduce((sum, c) => sum + c.clicks, 0),
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
