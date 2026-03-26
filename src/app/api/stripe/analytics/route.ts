/**
 * STRIPE REVENUE ANALYTICS API
 *
 * GET /api/stripe/analytics
 *
 * Provides MRR/ARR time series, churn analytics, cohort revenue,
 * net revenue trends, and 3-month forecasting.
 *
 * Query params:
 *   type: 'mrr' | 'churn' | 'cohorts' | 'trends' | 'forecast' | 'all' (default: 'all')
 *   months: number (default: 12, max: 24)
 *   clinicId: number (optional, super_admin only)
 *
 * PROTECTED: Requires admin authentication
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import {
  getMRRTimeSeries,
  getChurnAnalytics,
  getCohortRevenue,
  getNetRevenueTrend,
  getRevenueForecasting,
  getAllAnalytics,
} from '@/services/analytics/stripeRevenueAnalytics';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function handler(request: NextRequest, user: AuthUser) {
  try {
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';
    const months = Math.min(Math.max(parseInt(searchParams.get('months') || '12'), 3), 24);

    let clinicId: number | undefined;
    if (user.role === 'super_admin' && searchParams.get('clinicId')) {
      clinicId = parseInt(searchParams.get('clinicId')!);
    } else if (user.clinicId) {
      clinicId = user.clinicId;
    }

    const startTime = Date.now();
    let data: any;

    switch (type) {
      case 'mrr':
        data = { mrr: await getMRRTimeSeries(clinicId, months) };
        break;
      case 'churn':
        data = { churn: await getChurnAnalytics(clinicId, months) };
        break;
      case 'cohorts':
        data = { cohorts: await getCohortRevenue(clinicId, months) };
        break;
      case 'trends':
        data = { trends: await getNetRevenueTrend(clinicId, months) };
        break;
      case 'forecast':
        data = { forecast: await getRevenueForecasting(clinicId, months) };
        break;
      case 'all':
        data = await getAllAnalytics(clinicId, months);
        break;
      default:
        return NextResponse.json({
          error: 'Invalid type',
          validTypes: ['mrr', 'churn', 'cohorts', 'trends', 'forecast', 'all'],
        }, { status: 400 });
    }

    const duration = Date.now() - startTime;

    logger.info('[Stripe Analytics] Generated', {
      type,
      months,
      clinicId,
      duration,
      userId: user.id,
    });

    return NextResponse.json({
      success: true,
      type,
      months,
      generatedAt: new Date().toISOString(),
      generationTimeMs: duration,
      ...data,
    });
  } catch (error) {
    logger.error('[Stripe Analytics] Failed', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate analytics' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(handler);
