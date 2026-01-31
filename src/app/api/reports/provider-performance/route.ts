/**
 * Provider Performance Reports API
 * 
 * GET - Get provider performance report with prescription and SOAP note metrics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { providerCompensationService, providerRoutingService } from '@/services/provider';

type DateRangePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd';

/**
 * GET /api/reports/provider-performance
 * Get provider performance report
 * 
 * Query params:
 * - clinicId: required for admin (super admin can access all)
 * - period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'ytd' | 'custom'
 * - startDate: ISO date string (required if period=custom)
 * - endDate: ISO date string (required if period=custom)
 * - groupBy: 'day' | 'week' | 'month' (default: determined by period)
 * - providerId: filter by specific provider (optional)
 */
async function handleGet(req: NextRequest, user: AuthUser) {
  try {
    const { searchParams } = new URL(req.url);
    const clinicIdParam = searchParams.get('clinicId');
    const period = (searchParams.get('period') || 'month') as DateRangePeriod | 'custom';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');
    const groupByParam = searchParams.get('groupBy') as 'day' | 'week' | 'month' | null;
    const providerIdParam = searchParams.get('providerId');

    // Determine clinic ID
    let clinicId: number | undefined;
    
    if (user.role === 'super_admin') {
      clinicId = clinicIdParam ? parseInt(clinicIdParam, 10) : undefined;
    } else {
      clinicId = user.clinicId;
    }

    if (!clinicId) {
      return NextResponse.json(
        { error: 'Clinic ID is required' },
        { status: 400 }
      );
    }

    logger.info('[REPORTS] Getting provider performance', {
      userId: user.id,
      clinicId,
      period,
      providerId: providerIdParam,
    });

    // Check if routing is enabled
    const config = await providerRoutingService.getRoutingConfig(clinicId);

    // Calculate date range
    let dateRange;
    
    if (period === 'custom') {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          { error: 'startDate and endDate are required for custom period' },
          { status: 400 }
        );
      }
      dateRange = {
        startDate: new Date(startDateParam),
        endDate: new Date(endDateParam),
      };
    } else {
      dateRange = providerCompensationService.getDateRange(period);
    }

    // Determine groupBy based on period if not specified
    let groupBy: 'day' | 'week' | 'month' = groupByParam || 'day';
    
    if (!groupByParam) {
      switch (period) {
        case 'day':
          groupBy = 'day';
          break;
        case 'week':
          groupBy = 'day';
          break;
        case 'month':
          groupBy = 'day';
          break;
        case 'quarter':
          groupBy = 'week';
          break;
        case 'year':
        case 'ytd':
          groupBy = 'month';
          break;
        default:
          // For custom, determine based on range
          const rangeDays = Math.ceil(
            (dateRange.endDate.getTime() - dateRange.startDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          if (rangeDays <= 31) {
            groupBy = 'day';
          } else if (rangeDays <= 90) {
            groupBy = 'week';
          } else {
            groupBy = 'month';
          }
      }
    }

    // Get performance report
    const report = await providerCompensationService.getProviderPerformanceReport(
      clinicId,
      dateRange,
      groupBy
    );

    // Filter by provider if specified
    let filteredProviders = report.providers;
    if (providerIdParam) {
      const providerId = parseInt(providerIdParam, 10);
      filteredProviders = report.providers.filter((p) => p.id === providerId);
    }

    return NextResponse.json({
      clinicId,
      period,
      dateRange: {
        startDate: dateRange.startDate.toISOString(),
        endDate: dateRange.endDate.toISOString(),
      },
      groupBy,
      compensationEnabled: config?.compensationEnabled ?? false,
      summary: {
        ...report.summary,
        totalEarningsFormatted: config?.compensationEnabled
          ? `$${(report.summary.totalEarningsCents / 100).toFixed(2)}`
          : null,
      },
      providers: filteredProviders.map((p) => ({
        ...p,
        earningsFormatted: config?.compensationEnabled
          ? `$${(p.earningsCents / 100).toFixed(2)}`
          : null,
      })),
      timeline: report.timeline,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[REPORTS] Error getting provider performance', {
      error: errorMessage,
      userId: user.id,
    });
    return NextResponse.json(
      { error: 'Failed to get provider performance report', details: errorMessage },
      { status: 500 }
    );
  }
}

export const GET = withAdminAuth(handleGet);
