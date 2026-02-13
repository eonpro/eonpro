/**
 * Revenue Analytics API
 *
 * GET /api/finance/revenue
 * Returns comprehensive revenue analytics data
 *
 * Query params:
 *   range: 1d | 7d | 30d | 90d | quarter | semester | 12m | ytd | custom
 *   startDate, endDate: required when range=custom (ISO date strings)
 *   granularity: daily | weekly | monthly
 *   providerId, salesRepId: optional filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { getClinicContext } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { subDays, subMonths, startOfYear, startOfQuarter, endOfQuarter } from 'date-fns';
import { RevenueAnalyticsService, type Granularity } from '@/services/analytics/revenueAnalytics';

function getSemesterBounds(date: Date): { start: Date; end: Date } {
  const month = date.getMonth();
  const year = date.getFullYear();
  if (month < 6) {
    return { start: new Date(year, 0, 1), end: new Date(year, 5, 30, 23, 59, 59) };
  }
  return { start: new Date(year, 6, 1), end: new Date(year, 11, 31, 23, 59, 59) };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contextClinicId = getClinicContext();
    const clinicId = contextClinicId || user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';
    const granularityParam = searchParams.get('granularity') || 'daily';
    const startDateParam = searchParams.get('startDate');
    const endDateParam = searchParams.get('endDate');

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (range === 'custom' && startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return NextResponse.json({ error: 'Invalid startDate or endDate' }, { status: 400 });
      }
      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }
    } else {
      endDate = now;
      switch (range) {
        case '1d':
          startDate = new Date(now);
          startDate.setHours(0, 0, 0, 0);
          break;
        case '7d':
          startDate = subDays(now, 7);
          break;
        case '90d':
          startDate = subDays(now, 90);
          break;
        case 'quarter':
          startDate = startOfQuarter(now);
          endDate = endOfQuarter(now);
          break;
        case 'semester': {
          const s = getSemesterBounds(now);
          startDate = s.start;
          endDate = s.end;
          break;
        }
        case '12m':
          startDate = subMonths(now, 12);
          break;
        case 'ytd':
          startDate = startOfYear(now);
          break;
        default:
          startDate = subDays(now, 30);
      }
    }

    // Map granularity
    let granularity: Granularity = 'daily';
    if (granularityParam === 'weekly') granularity = 'weekly';
    if (granularityParam === 'monthly') granularity = 'monthly';

    // Auto-adjust granularity for longer ranges
    if (range === '12m' && granularityParam === 'daily') {
      granularity = 'weekly';
    }

    const dateRange = { start: startDate, end: endDate };

    // Fetch all analytics data in parallel
    const [overview, trends, mrr, byProduct, byPaymentMethod, forecast] = await Promise.all([
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
    return NextResponse.json({ error: 'Failed to fetch revenue analytics' }, { status: 500 });
  }
}
