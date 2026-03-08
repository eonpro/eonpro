/**
 * Subscription Finance Analytics API
 *
 * GET /api/finance/subscriptions
 * Returns subscription metrics and trends
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { SubscriptionAnalyticsService } from '@/services/analytics/subscriptionAnalytics';

export const GET = withAdminAuth(async (request: NextRequest, user) => {
  try {
    const clinicId = user.clinicId;

    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'all';

    // Fetch subscription analytics
    const [metrics, trends, subscriptionsData] = await Promise.all([
      SubscriptionAnalyticsService.getSubscriptionMetrics(clinicId),
      SubscriptionAnalyticsService.getSubscriptionTrends(clinicId, 12),
      SubscriptionAnalyticsService.getSubscriptionDetails(clinicId, {
        status: status !== 'all' ? status : undefined,
        limit: 50,
      }),
    ]);

    return NextResponse.json({
      metrics,
      trends,
      subscriptions: subscriptionsData.subscriptions,
      total: subscriptionsData.total,
    });
  } catch (error) {
    logger.error('Failed to fetch subscription analytics', { error });
    return NextResponse.json({ error: 'Failed to fetch subscription analytics' }, { status: 500 });
  }
});
