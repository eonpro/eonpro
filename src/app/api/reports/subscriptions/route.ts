/**
 * SUBSCRIPTION REPORTS API
 * ========================
 * Detailed subscription and recurring revenue reporting
 *
 * GET /api/reports/subscriptions - Subscription metrics
 * GET /api/reports/subscriptions?type=active - Active subscriptions
 * GET /api/reports/subscriptions?type=cancelled - Cancelled subscriptions
 * GET /api/reports/subscriptions?type=paused - Paused subscriptions
 * GET /api/reports/subscriptions?type=by-month - Subscriptions by treatment month
 * GET /api/reports/subscriptions?type=churn - Churn analysis
 */

import { NextRequest, NextResponse } from 'next/server';
import { withClinicalAuth, AuthUser } from '@/lib/auth/middleware';
import {
  ReportingService,
  DateRange,
  DateRangeParams,
  calculateDateRange,
} from '@/services/reporting/ReportingService';
import { prisma } from '@/lib/db';
import { standardRateLimit } from '@/lib/rateLimit';
import { logger } from '@/lib/logger';

async function getSubscriptionReportsHandler(req: NextRequest, user: AuthUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'metrics';
    const rangeParam = (url.searchParams.get('range') || 'this_month') as DateRange;
    const startDateParam = url.searchParams.get('startDate');
    const endDateParam = url.searchParams.get('endDate');
    const month = url.searchParams.get('month');

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
        const metrics = await reportingService.getSubscriptionMetrics(dateRangeParams);
        return NextResponse.json({
          metrics,
          formatted: {
            mrr: formatCurrency(metrics.monthlyRecurringRevenue),
            arr: formatCurrency(metrics.annualRecurringRevenue),
            averageValue: formatCurrency(metrics.averageSubscriptionValue),
          },
          dateRange: { start, end, label },
        });

      case 'active':
        const activeSubscriptions = await prisma.subscription.findMany({
          where: {
            ...clinicFilter,
            status: 'ACTIVE',
          },
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 3,
              select: {
                amount: true,
                status: true,
                createdAt: true,
              },
            },
          },
          orderBy: { startDate: 'desc' },
          take: 500,
        });

        const now = new Date();
        const activeWithDetails = activeSubscriptions.map(
          (s: {
            id: number;
            patient: unknown;
            planName: string;
            amount: number;
            interval: string;
            startDate: Date;
            nextBillingDate: Date | null;
            payments: Array<{ amount: number; status: string; createdAt: Date }>;
          }) => {
            const monthsActive =
              Math.floor((now.getTime() - s.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)) + 1;

            return {
              id: s.id,
              patient: s.patient,
              planName: s.planName,
              amount: s.amount,
              formattedAmount: formatCurrency(s.amount),
              interval: s.interval,
              startDate: s.startDate,
              monthsActive,
              nextBillingDate: s.nextBillingDate,
              recentPayments: s.payments.map(
                (p: { amount: number; status: string; createdAt: Date }) => ({
                  amount: formatCurrency(p.amount),
                  status: p.status,
                  date: p.createdAt,
                })
              ),
            };
          }
        );

        return NextResponse.json({
          subscriptions: activeWithDetails,
          count: activeWithDetails.length,
          totalMRR: formatCurrency(
            activeWithDetails.reduce((sum: number, s: { amount: number }) => sum + s.amount, 0)
          ),
        });

      case 'cancelled':
        const cancelledSubscriptions =
          await reportingService.getCancelledSubscriptions(dateRangeParams);

        const cancelledWithDetails = cancelledSubscriptions.map(
          (s: (typeof cancelledSubscriptions)[number]) => {
            const monthsActive =
              s.canceledAt && s.startDate
                ? Math.floor(
                    (s.canceledAt.getTime() - s.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)
                  ) + 1
                : 0;

            const totalPaid = s.payments.reduce(
              (sum: number, p: { status: string; amount: number }) =>
                p.status === 'SUCCEEDED' ? sum + p.amount : sum,
              0
            );

            return {
              id: s.id,
              patient: s.patient,
              planName: s.planName,
              amount: s.amount,
              formattedAmount: formatCurrency(s.amount),
              startDate: s.startDate,
              cancelledAt: s.canceledAt,
              monthsActive,
              totalPaid: formatCurrency(totalPaid),
              lostMRR: formatCurrency(s.amount),
            };
          }
        );

        const totalLostMRR = cancelledSubscriptions.reduce(
          (sum: number, s: { amount: number }) => sum + s.amount,
          0
        );

        return NextResponse.json({
          subscriptions: cancelledWithDetails,
          count: cancelledWithDetails.length,
          totalLostMRR: formatCurrency(totalLostMRR),
          dateRange: { start, end, label },
        });

      case 'paused':
        const pausedSubscriptions = await reportingService.getPausedSubscriptions();

        const pausedWithDetails = pausedSubscriptions.map(
          (s: (typeof pausedSubscriptions)[number]) => ({
            id: s.id,
            patient: s.patient,
            planName: s.planName,
            amount: s.amount,
            formattedAmount: formatCurrency(s.amount),
            pausedAt: s.pausedAt,
            resumeAt: s.resumeAt,
            startDate: s.startDate,
          })
        );

        const pausedMRR = pausedSubscriptions.reduce(
          (sum: number, s: { amount: number }) => sum + s.amount,
          0
        );

        return NextResponse.json({
          subscriptions: pausedWithDetails,
          count: pausedWithDetails.length,
          pausedMRR: formatCurrency(pausedMRR),
        });

      case 'by-month':
        const treatmentMonth = month ? parseInt(month) : null;

        if (treatmentMonth) {
          const patientsOnMonth =
            await reportingService.getPatientsByTreatmentMonth(treatmentMonth);
          return NextResponse.json({
            month: treatmentMonth,
            label: `Month ${treatmentMonth} of Treatment`,
            patients: patientsOnMonth,
            count: patientsOnMonth.length,
          });
        }

        // Return distribution across all months
        const allSubscriptions = await prisma.subscription.findMany({
          where: {
            ...clinicFilter,
            status: 'ACTIVE',
          },
          include: {
            patient: {
              select: { firstName: true, lastName: true },
            },
          },
          orderBy: { startDate: 'desc' },
          take: 500,
        });

        const byMonth: Record<
          number,
          Array<{ id: number; patient: string; startDate: Date; amount: number }>
        > = {};

        allSubscriptions.forEach(
          (s: {
            id: number;
            patient: { firstName: string; lastName: string };
            startDate: Date;
            amount: number;
          }) => {
            const monthsActive =
              Math.floor((now.getTime() - s.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)) + 1;

            if (!byMonth[monthsActive]) {
              byMonth[monthsActive] = [];
            }
            byMonth[monthsActive].push({
              id: s.id,
              patient: `${s.patient.firstName} ${s.patient.lastName}`,
              startDate: s.startDate,
              amount: s.amount,
            });
          }
        );

        const monthDistribution = Object.entries(byMonth)
          .map(([m, subs]) => ({
            month: parseInt(m),
            label: `Month ${m}`,
            count: subs.length,
            mrr: formatCurrency(subs.reduce((sum, s) => sum + s.amount, 0)),
            patients: subs,
          }))
          .sort((a, b) => a.month - b.month);

        return NextResponse.json({
          distribution: monthDistribution,
          totalActive: allSubscriptions.length,
        });

      case 'churn':
        // Churn analysis over time
        const periods: {
          period: string;
          periodLabel: string;
          activeAtStart: number;
          newSubscriptions: number;
          cancelled: number;
          churnRate: string;
          netGrowth: number;
        }[] = [];
        const periodStart = new Date(start);

        while (periodStart < end) {
          const periodEnd = new Date(periodStart);
          periodEnd.setMonth(periodEnd.getMonth() + 1);
          if (periodEnd > end) periodEnd.setTime(end.getTime());

          const activeAtStart = await prisma.subscription.count({
            where: {
              ...clinicFilter,
              createdAt: { lt: periodStart },
              OR: [{ status: 'ACTIVE' }, { canceledAt: { gte: periodStart } }],
            },
          });

          const cancelledInPeriod = await prisma.subscription.count({
            where: {
              ...clinicFilter,
              status: 'CANCELED',
              canceledAt: { gte: periodStart, lt: periodEnd },
            },
          });

          const newInPeriod = await prisma.subscription.count({
            where: {
              ...clinicFilter,
              createdAt: { gte: periodStart, lt: periodEnd },
            },
          });

          const churnRate =
            activeAtStart > 0 ? Math.round((cancelledInPeriod / activeAtStart) * 100 * 10) / 10 : 0;

          periods.push({
            period: periodStart.toISOString().slice(0, 7),
            periodLabel: periodStart.toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            }),
            activeAtStart,
            newSubscriptions: newInPeriod,
            cancelled: cancelledInPeriod,
            churnRate: `${churnRate}%`,
            netGrowth: newInPeriod - cancelledInPeriod,
          });

          periodStart.setMonth(periodStart.getMonth() + 1);
        }

        const avgChurn =
          periods.length > 0
            ? periods.reduce((sum, p) => sum + parseFloat(p.churnRate), 0) / periods.length
            : 0;

        return NextResponse.json({
          periods,
          summary: {
            averageChurnRate: `${Math.round(avgChurn * 10) / 10}%`,
            totalCancelled: periods.reduce((sum, p) => sum + p.cancelled, 0),
            totalNew: periods.reduce((sum, p) => sum + p.newSubscriptions, 0),
            netGrowth: periods.reduce((sum, p) => sum + p.netGrowth, 0),
          },
          dateRange: { start, end, label },
        });

      default:
        return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
    }
  } catch (error) {
    logger.error('Failed to generate subscription report', error as Error);
    return NextResponse.json({ error: 'Failed to generate subscription report' }, { status: 500 });
  }
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

export const GET = standardRateLimit(withClinicalAuth(getSubscriptionReportsHandler));
