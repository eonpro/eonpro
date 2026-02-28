/**
 * REVENUE REPORTS API
 * ===================
 * Detailed revenue and financial reporting
 *
 * GET /api/reports/revenue - Revenue metrics
 * GET /api/reports/revenue?type=daily - Daily revenue breakdown
 * GET /api/reports/revenue?type=recurring - Recurring revenue analysis
 * GET /api/reports/revenue?type=by-treatment - Revenue by treatment type
 * GET /api/reports/revenue?type=forecast - Revenue forecast
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import { requirePermission, toPermissionContext } from '@/lib/rbac/permissions';
import {
  ReportingService,
  DateRange,
  DateRangeParams,
  calculateDateRange,
} from '@/services/reporting/ReportingService';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

async function getRevenueReportsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    requirePermission(toPermissionContext(user), 'report:run');
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'metrics';
    const rangeParam = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');

    const dateRangeParams: DateRangeParams = { range: rangeParam };
    if (rangeParam === 'custom' && startDateParam && endDateParam) {
      dateRangeParams.startDate = new Date(startDateParam);
      dateRangeParams.endDate = new Date(endDateParam);
    }

    const { start, end, label } = calculateDateRange(dateRangeParams);
    const reportingService = new ReportingService(user.clinicId);
    const clinicFilter = user.clinicId ? { clinicId: user.clinicId } : {};

    switch (type) {
      case 'metrics':
        const metrics = await reportingService.getRevenueMetrics(dateRangeParams);
        return NextResponse.json({
          metrics,
          dateRange: { start, end, label },
          formatted: {
            totalRevenue: formatCurrency(metrics.totalRevenue),
            recurringRevenue: formatCurrency(metrics.recurringRevenue),
            oneTimeRevenue: formatCurrency(metrics.oneTimeRevenue),
            averageOrderValue: formatCurrency(metrics.averageOrderValue),
            projectedRevenue: formatCurrency(metrics.projectedRevenue),
          },
        });

      case 'daily':
        const payments = await prisma.payment.findMany({
          where: {
            ...clinicFilter,
            status: 'SUCCEEDED',
            createdAt: { gte: start, lte: end },
          },
          select: {
            amount: true,
            createdAt: true,
            subscriptionId: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 500,
        });

        const dailyRevenue: Record<
          string,
          { total: number; recurring: number; oneTime: number; count: number }
        > = {};

        payments.forEach(
          (p: { createdAt: Date; amount: number; subscriptionId: number | null }) => {
            const dateKey = p.createdAt.toISOString().split('T')[0];
            if (!dailyRevenue[dateKey]) {
              dailyRevenue[dateKey] = { total: 0, recurring: 0, oneTime: 0, count: 0 };
            }
            dailyRevenue[dateKey].total += p.amount;
            dailyRevenue[dateKey].count++;
            if (p.subscriptionId) {
              dailyRevenue[dateKey].recurring += p.amount;
            } else {
              dailyRevenue[dateKey].oneTime += p.amount;
            }
          }
        );

        const dailyData = Object.entries(dailyRevenue)
          .map(([date, data]) => ({
            date,
            ...data,
            formatted: {
              total: formatCurrency(data.total),
              recurring: formatCurrency(data.recurring),
              oneTime: formatCurrency(data.oneTime),
            },
          }))
          .sort((a, b) => a.date.localeCompare(b.date));

        return NextResponse.json({
          daily: dailyData,
          summary: {
            totalDays: dailyData.length,
            averageDaily:
              dailyData.length > 0
                ? formatCurrency(dailyData.reduce((sum, d) => sum + d.total, 0) / dailyData.length)
                : '$0.00',
            bestDay:
              dailyData.length > 0
                ? dailyData.reduce((best, d) => (d.total > best.total ? d : best))
                : null,
          },
          dateRange: { start, end, label },
        });

      case 'recurring':
        const recurringBreakdown = await reportingService.getRecurringRevenueBreakdown();

        return NextResponse.json({
          mrr: recurringBreakdown.totalMRR,
          arr: recurringBreakdown.totalARR,
          formatted: {
            mrr: formatCurrency(recurringBreakdown.totalMRR),
            arr: formatCurrency(recurringBreakdown.totalARR),
          },
          byPlan: Object.entries(recurringBreakdown.byPlan).map(([plan, data]) => ({
            plan,
            count: data.count,
            mrr: data.mrr,
            formatted: formatCurrency(data.mrr),
          })),
          subscriptionCount: recurringBreakdown.subscriptionCount,
        });

      case 'by-treatment':
        const revenueMetrics = await reportingService.getRevenueMetrics(dateRangeParams);

        const treatmentRevenue = Object.entries(revenueMetrics.revenueByTreatment)
          .map(([treatment, amount]) => ({
            treatment,
            amount,
            formatted: formatCurrency(amount),
            percentage:
              revenueMetrics.totalRevenue > 0
                ? Math.round((amount / revenueMetrics.totalRevenue) * 100)
                : 0,
          }))
          .sort((a, b) => b.amount - a.amount);

        return NextResponse.json({
          byTreatment: treatmentRevenue,
          total: revenueMetrics.totalRevenue,
          formatted: formatCurrency(revenueMetrics.totalRevenue),
          dateRange: { start, end, label },
        });

      case 'forecast':
        const subscriptions = await prisma.subscription.findMany({
          where: {
            ...clinicFilter,
            status: 'ACTIVE',
          },
          select: {
            amount: true,
            interval: true,
            intervalCount: true,
            nextBillingDate: true,
          },
          take: 500,
        });

        const currentMRR = subscriptions.reduce(
          (sum: number, s: { interval: string; amount: number; intervalCount: number }) => {
            if (s.interval === 'month') return sum + s.amount / s.intervalCount;
            if (s.interval === 'year') return sum + s.amount / 12;
            return sum + s.amount;
          },
          0
        );

        // Project next 12 months
        const forecast: {
          month: string;
          monthName: string;
          projectedMRR: number;
          formatted: string;
        }[] = [];
        for (let i = 1; i <= 12; i++) {
          const month = new Date();
          month.setMonth(month.getMonth() + i);

          // Simple projection (could be enhanced with churn prediction)
          const projectedMRR = currentMRR * (1 - (0.02 * i) / 12); // Assume 2% annual churn

          forecast.push({
            month: month.toISOString().slice(0, 7),
            monthName: month.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            projectedMRR: Math.round(projectedMRR),
            formatted: formatCurrency(Math.round(projectedMRR)),
          });
        }

        return NextResponse.json({
          currentMRR: Math.round(currentMRR),
          currentARR: Math.round(currentMRR * 12),
          formatted: {
            mrr: formatCurrency(Math.round(currentMRR)),
            arr: formatCurrency(Math.round(currentMRR * 12)),
          },
          forecast,
          assumptions: {
            churnRate: '2% annually',
            growthRate: '0% (conservative)',
          },
        });

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Failed to generate revenue report', error as Error);
    return NextResponse.json({ error: 'Failed to generate revenue report' }, { status: 500 });
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export const GET = standardRateLimit(withClinicalAuth(getRevenueReportsHandler));
