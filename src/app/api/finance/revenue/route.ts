/**
 * Revenue Analytics API
 * 
 * GET /api/finance/revenue
 * Returns comprehensive revenue analytics data
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext, withClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { subDays, subMonths, startOfYear } from 'date-fns';
import { 
  RevenueAnalyticsService,
  type Granularity,
} from '@/services/analytics/revenueAnalytics';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get clinic ID from context or fall back to user's clinic
    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';
    const granularityParam = searchParams.get('granularity') || 'daily';

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (range) {
      case '7d':
        startDate = subDays(now, 7);
        break;
      case '90d':
        startDate = subDays(now, 90);
        break;
      case '12m':
        startDate = subMonths(now, 12);
        break;
      case 'ytd':
        startDate = startOfYear(now);
        break;
      default: // 30d
        startDate = subDays(now, 30);
    }

    // Map granularity
    let granularity: Granularity = 'daily';
    if (granularityParam === 'weekly') granularity = 'weekly';
    if (granularityParam === 'monthly') granularity = 'monthly';

    // Auto-adjust granularity for longer ranges
    if (range === '12m' && granularityParam === 'daily') {
      granularity = 'weekly';
    }

    const dateRange = { start: startDate, end: now };

    // Fetch all analytics data in parallel
    const [
      overview,
      trends,
      mrr,
      byProduct,
      byPaymentMethod,
      forecast,
    ] = await Promise.all([
      RevenueAnalyticsService.getRevenueOverview(clinicId, dateRange),
      RevenueAnalyticsService.getRevenueTrends(clinicId, dateRange, granularity),
      RevenueAnalyticsService.getMrrBreakdown(clinicId),
      RevenueAnalyticsService.getRevenueByProduct(clinicId, dateRange),
      RevenueAnalyticsService.getRevenueByPaymentMethod(clinicId, dateRange),
      RevenueAnalyticsService.getForecast(clinicId, 6),
    ]);

    return NextResponse.json({
      overview,
      trends,
      mrr,
      byProduct,
      byPaymentMethod,
      forecast,
    });
  } catch (error) {
    logger.error('Failed to fetch revenue analytics', { error });
    return NextResponse.json(
      { error: 'Failed to fetch revenue analytics' },
      { status: 500 }
    );
  }
}
