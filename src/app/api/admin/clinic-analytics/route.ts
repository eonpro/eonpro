/**
 * Clinic Analytics API
 * ====================
 *
 * Comprehensive analytics endpoint aggregating revenue, patient, subscription,
 * and operational data for the admin analytics dashboard.
 *
 * Query params:
 *   - period: '7d' | '30d' | '90d' | '12m' (default '30d')
 *   - section: 'overview' | 'revenue' | 'patients' | 'subscriptions' | 'orders' (default 'overview')
 *
 * @module api/admin/clinic-analytics
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAdminAuth, AuthUser } from '@/lib/auth/middleware';
import { logger } from '@/lib/logger';
import { handleApiError } from '@/domains/shared/errors';
import { getResilientReadDb, isTransientDbError, hasReadReplica } from '@/lib/database/read-replica';
import {
  RevenueAnalyticsService,
  PatientAnalyticsService,
  SubscriptionAnalyticsService,
} from '@/services/analytics';
import {
  subDays,
  subMonths,
  startOfDay,
  startOfMonth,
  endOfDay,
  format,
  eachMonthOfInterval,
  eachDayOfInterval,
} from 'date-fns';

function getAnalyticsDb() {
  return getResilientReadDb();
}

type Period = '7d' | '30d' | '90d' | '12m';
type Section = 'overview' | 'revenue' | 'patients' | 'subscriptions' | 'orders';

function getDateRange(period: Period) {
  const end = endOfDay(new Date());
  let start: Date;
  switch (period) {
    case '7d':
      start = startOfDay(subDays(end, 7));
      break;
    case '30d':
      start = startOfDay(subDays(end, 30));
      break;
    case '90d':
      start = startOfDay(subDays(end, 90));
      break;
    case '12m':
      start = startOfDay(subMonths(end, 12));
      break;
    default:
      start = startOfDay(subDays(end, 30));
  }
  return { start, end };
}

function getGranularity(period: Period) {
  switch (period) {
    case '7d':
      return 'daily' as const;
    case '30d':
      return 'daily' as const;
    case '90d':
      return 'weekly' as const;
    case '12m':
      return 'monthly' as const;
    default:
      return 'daily' as const;
  }
}

async function getOverviewData(clinicId: number, period: Period) {
  const dateRange = getDateRange(period);
  const db = getAnalyticsDb();

  const [
    revenueOverview,
    patientMetrics,
    subscriptionMetrics,
    totalOrders,
    pendingOrders,
    completedOrders,
    activeProviders,
    newPatientsTimeline,
  ] = await Promise.all([
    RevenueAnalyticsService.getRevenueOverview(clinicId, dateRange),
    PatientAnalyticsService.getPatientMetrics(clinicId),
    SubscriptionAnalyticsService.getSubscriptionMetrics(clinicId),
    db.order.count({ where: { clinicId } }),
    db.order.count({ where: { clinicId, status: { in: ['PENDING', 'PENDING_REVIEW'] } } }),
    db.order.count({ where: { clinicId, status: 'COMPLETED' } }),
    db.provider.count({ where: { clinicId, status: 'ACTIVE' } }).catch(() => 0),
    getNewPatientsTimeline(clinicId, period),
  ]);

  const revenueTrends = await RevenueAnalyticsService.getRevenueTrends(
    clinicId,
    dateRange,
    getGranularity(period)
  );

  return {
    kpis: {
      totalRevenue: revenueOverview.grossRevenue,
      revenueGrowth: revenueOverview.periodGrowth,
      mrr: subscriptionMetrics.totalMrr,
      totalPatients: patientMetrics.totalPatients,
      patientsWithPayments: patientMetrics.patientsWithPayments,
      activeSubscriptions: subscriptionMetrics.activeSubscriptions,
      churnRate: patientMetrics.churnRate,
      avgOrderValue: revenueOverview.averageOrderValue,
      successfulPayments: revenueOverview.successfulPayments,
      failedPayments: revenueOverview.failedPayments,
      activeProviders,
      totalOrders,
      pendingOrders,
      completedOrders,
      conversionRate:
        patientMetrics.totalPatients > 0
          ? Math.round(
              (patientMetrics.patientsWithPayments / patientMetrics.totalPatients) * 100 * 10
            ) / 10
          : 0,
    },
    revenueTrends,
    newPatientsTimeline,
    subscriptionsByPlan: subscriptionMetrics.subscriptionsByPlan,
  };
}

async function getRevenueData(clinicId: number, period: Period) {
  const dateRange = getDateRange(period);

  const [overview, trends, mrr, byProduct, byPaymentMethod, forecast] = await Promise.all([
    RevenueAnalyticsService.getRevenueOverview(clinicId, dateRange),
    RevenueAnalyticsService.getRevenueTrends(clinicId, dateRange, getGranularity(period)),
    RevenueAnalyticsService.getMrrBreakdown(clinicId),
    RevenueAnalyticsService.getRevenueByProduct(clinicId, dateRange),
    RevenueAnalyticsService.getRevenueByPaymentMethod(clinicId, dateRange),
    RevenueAnalyticsService.getForecast(clinicId, 6),
  ]);

  return { overview, trends, mrr, byProduct, byPaymentMethod, forecast };
}

async function getPatientData(clinicId: number) {
  const [metrics, segments, atRisk, retention, paymentBehavior] = await Promise.all([
    PatientAnalyticsService.getPatientMetrics(clinicId),
    PatientAnalyticsService.getPatientSegments(clinicId),
    PatientAnalyticsService.getAtRiskPatients(clinicId, 10),
    PatientAnalyticsService.getRetentionMatrix(clinicId, 6),
    PatientAnalyticsService.getPaymentBehavior(clinicId),
  ]);

  return { metrics, segments, atRisk, retention, paymentBehavior };
}

async function getSubscriptionData(clinicId: number) {
  const [metrics, churn, trends, pastDue] = await Promise.all([
    SubscriptionAnalyticsService.getSubscriptionMetrics(clinicId),
    SubscriptionAnalyticsService.getChurnAnalysis(clinicId),
    SubscriptionAnalyticsService.getSubscriptionTrends(clinicId, 12),
    SubscriptionAnalyticsService.getPastDueSubscriptions(clinicId),
  ]);

  return { metrics, churn, trends, pastDue };
}

async function getOrderData(clinicId: number, period: Period) {
  const dateRange = getDateRange(period);
  const db = getAnalyticsDb();

  const [statusCounts, recentOrders, dailyOrders] = await Promise.all([
    db.order
      .groupBy({
        by: ['status'],
        where: { clinicId },
        _count: { id: true },
      })
      .then((groups) => {
        const counts: Record<string, number> = {};
        groups.forEach((g) => {
          const key = g.status ?? 'UNKNOWN';
          counts[key] = g._count.id;
        });
        return counts;
      }),
    db.order.findMany({
      where: { clinicId, createdAt: { gte: dateRange.start, lte: dateRange.end } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        status: true,
        createdAt: true,
        patient: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    getOrderTimeline(clinicId, period),
  ]);

  return { statusCounts, recentOrders, dailyOrders };
}

async function getNewPatientsTimeline(clinicId: number, period: Period) {
  const dateRange = getDateRange(period);
  const db = getAnalyticsDb();

  const patients = await db.patient.findMany({
    where: {
      clinicId,
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const useDaily = period === '7d' || period === '30d';
  const intervals = useDaily
    ? eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    : eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });

  const dateFormat = useDaily ? 'yyyy-MM-dd' : 'yyyy-MM';

  return intervals.map((intervalStart, index) => {
    const intervalEnd = intervals[index + 1]
      ? new Date(intervals[index + 1].getTime() - 1)
      : dateRange.end;

    const count = patients.filter((p) => {
      const d = new Date(p.createdAt);
      return d >= intervalStart && d <= intervalEnd;
    }).length;

    return { date: format(intervalStart, dateFormat), count };
  });
}

async function getOrderTimeline(clinicId: number, period: Period) {
  const dateRange = getDateRange(period);
  const db = getAnalyticsDb();

  const orders = await db.order.findMany({
    where: {
      clinicId,
      createdAt: { gte: dateRange.start, lte: dateRange.end },
    },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  const useDaily = period === '7d' || period === '30d';
  const intervals = useDaily
    ? eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    : eachMonthOfInterval({ start: dateRange.start, end: dateRange.end });

  const dateFormat = useDaily ? 'yyyy-MM-dd' : 'yyyy-MM';

  return intervals.map((intervalStart, index) => {
    const intervalEnd = intervals[index + 1]
      ? new Date(intervals[index + 1].getTime() - 1)
      : dateRange.end;

    const intervalOrders = orders.filter((o) => {
      const d = new Date(o.createdAt);
      return d >= intervalStart && d <= intervalEnd;
    });

    return {
      date: format(intervalStart, dateFormat),
      total: intervalOrders.length,
      completed: intervalOrders.filter((o) => o.status === 'COMPLETED').length,
      pending: intervalOrders.filter((o) =>
        o.status != null && ['PENDING', 'PENDING_REVIEW'].includes(o.status)
      ).length,
    };
  });
}

async function handleGet(req: NextRequest, user: AuthUser) {
  const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();

  try {
    const url = new URL(req.url);
    const period = (url.searchParams.get('period') || '30d') as Period;
    const section = (url.searchParams.get('section') || 'overview') as Section;

    if (!['7d', '30d', '90d', '12m'].includes(period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }
    if (!['overview', 'revenue', 'patients', 'subscriptions', 'orders'].includes(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }

    const clinicId = user.clinicId;
    if (!clinicId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Clinic context required' }, { status: 400 });
    }

    const effectiveClinicId = clinicId ?? 0;

    logger.info('[CLINIC-ANALYTICS] Fetching', {
      userId: user.id,
      clinicId: effectiveClinicId,
      section,
      period,
      requestId,
    });

    const fetchSection = async (): Promise<unknown> => {
      switch (section) {
        case 'overview':
          return getOverviewData(effectiveClinicId, period);
        case 'revenue':
          return getRevenueData(effectiveClinicId, period);
        case 'patients':
          return getPatientData(effectiveClinicId);
        case 'subscriptions':
          return getSubscriptionData(effectiveClinicId);
        case 'orders':
          return getOrderData(effectiveClinicId, period);
      }
    };

    let data: unknown;
    try {
      data = await fetchSection();
    } catch (firstError) {
      const isTransient = isTransientDbError(firstError);
      if (isTransient && hasReadReplica) {
        logger.warn('[CLINIC-ANALYTICS] Transient DB error on read replica, retrying with primary', {
          clinicId: effectiveClinicId,
          section,
          errorCode: (firstError as any)?.code,
          requestId,
        });
        data = await fetchSection();
      } else {
        throw firstError;
      }
    }

    return NextResponse.json({ success: true, section, period, data });
  } catch (error) {
    logger.error('[CLINIC-ANALYTICS] Error', {
      userId: user.id,
      error: error instanceof Error ? error.message : String(error),
      requestId,
    });
    return handleApiError(error, {
      requestId,
      route: 'GET /api/admin/clinic-analytics',
      context: { userId: user.id ?? undefined },
    });
  }
}

export const GET = withAdminAuth(handleGet);
