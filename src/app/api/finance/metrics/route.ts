/**
 * Finance Metrics API
 * 
 * GET /api/finance/metrics
 * Returns aggregated financial KPIs for the dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma, getClinicContext, withClinicContext } from '@/lib/db';
import { requireAuth, getAuthUser } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { 
  startOfDay, 
  startOfYear, 
  subDays, 
  subMonths,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { RevenueAnalyticsService } from '@/services/analytics/revenueAnalytics';
import { SubscriptionAnalyticsService } from '@/services/analytics/subscriptionAnalytics';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicId = getClinicContext();
    if (!clinicId) {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const range = searchParams.get('range') || '30d';

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
      case 'ytd':
        startDate = startOfYear(now);
        break;
      default: // 30d
        startDate = subDays(now, 30);
    }

    return withClinicContext(clinicId, async () => {
      // Get revenue overview
      const revenueOverview = await RevenueAnalyticsService.getRevenueOverview(
        clinicId,
        { start: startDate, end: now }
      );

      // Get MRR breakdown
      const mrrBreakdown = await RevenueAnalyticsService.getMrrBreakdown(clinicId);

      // Get subscription metrics
      const subscriptionMetrics = await SubscriptionAnalyticsService.getSubscriptionMetrics(clinicId);

      // Get churn analysis
      const churnAnalysis = await SubscriptionAnalyticsService.getChurnAnalysis(clinicId);

      // Get outstanding invoices
      const outstandingInvoices = await prisma.invoice.findMany({
        where: {
          clinicId,
          status: { in: ['OPEN', 'DRAFT'] },
        },
        select: {
          total: true,
        },
      });

      const outstandingAmount = outstandingInvoices.reduce((sum: number, inv: typeof outstandingInvoices[number]) => sum + inv.total, 0);

      // Get pending payouts (from Stripe if connected)
      // This would need Stripe API integration for real data
      const pendingPayouts = 0;

      // Calculate dispute rate from payments
      const [totalPayments, disputedPayments] = await Promise.all([
        prisma.payment.count({
          where: {
            clinicId,
            createdAt: { gte: startDate },
          },
        }),
        prisma.payment.count({
          where: {
            clinicId,
            createdAt: { gte: startDate },
            status: 'DISPUTED',
          },
        }),
      ]);

      const disputeRate = totalPayments > 0 
        ? (disputedPayments / totalPayments) * 100 
        : 0;

      return NextResponse.json({
        grossRevenue: revenueOverview.grossRevenue,
        netRevenue: revenueOverview.netRevenue,
        mrr: mrrBreakdown.totalMrr,
        arr: mrrBreakdown.arr,
        activeSubscriptions: subscriptionMetrics.activeSubscriptions,
        churnRate: churnAnalysis.churnRate,
        averageOrderValue: revenueOverview.averageOrderValue,
        outstandingInvoices: outstandingInvoices.length,
        outstandingAmount,
        pendingPayouts,
        disputeRate,
        periodGrowth: revenueOverview.periodGrowth,
        mrrGrowth: mrrBreakdown.mrrGrowthRate,
      });
    });
  } catch (error) {
    logger.error('Failed to fetch finance metrics', { error });
    return NextResponse.json(
      { error: 'Failed to fetch finance metrics' },
      { status: 500 }
    );
  }
}
