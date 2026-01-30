/**
 * Subscription Analytics Service
 * 
 * Provides subscription metrics, churn analysis, and retention insights.
 */

import { prisma, withClinicContext } from '@/lib/db';
import { logger } from '@/lib/logger';
import { 
  startOfMonth, 
  endOfMonth,
  subMonths, 
  format,
  differenceInDays,
  eachMonthOfInterval,
} from 'date-fns';
import type { DateRange } from './revenueAnalytics';

// Types
export interface SubscriptionMetrics {
  activeSubscriptions: number;
  pausedSubscriptions: number;
  canceledSubscriptions: number;
  pastDueSubscriptions: number;
  totalMrr: number;
  averageSubscriptionValue: number;
  subscriptionsByPlan: Array<{
    planName: string;
    count: number;
    mrr: number;
    percentageOfTotal: number;
  }>;
}

export interface ChurnAnalysis {
  churnRate: number; // Monthly churn rate percentage
  churnedCount: number;
  churnedMrr: number;
  churnReasons: Array<{
    reason: string;
    count: number;
    mrr: number;
    percentageOfTotal: number;
  }>;
  averageLifetimeBeforeChurn: number; // Days
  retentionRate: number;
}

export interface SubscriptionTrend {
  month: string;
  newSubscriptions: number;
  canceledSubscriptions: number;
  netChange: number;
  endingCount: number;
  mrr: number;
}

export interface SubscriptionDetail {
  id: number;
  patientId: number;
  patientName: string;
  patientEmail: string;
  planName: string | null;
  status: string;
  amount: number;
  interval: string | null;
  startDate: Date;
  canceledAt: Date | null;
  cancelReason: string | null;
  lifetimeValue: number;
  paymentCount: number;
  daysSinceStart: number;
}

export interface TrialConversion {
  totalTrials: number;
  convertedTrials: number;
  canceledTrials: number;
  activeTrials: number;
  conversionRate: number;
  averageTrialLength: number;
}

export interface UpgradeDowngradeAnalysis {
  upgrades: number;
  downgrades: number;
  expansionMrr: number;
  contractionMrr: number;
  netMrrChange: number;
  topUpgradePaths: Array<{
    fromPlan: string;
    toPlan: string;
    count: number;
  }>;
  topDowngradePaths: Array<{
    fromPlan: string;
    toPlan: string;
    count: number;
  }>;
}

/**
 * Subscription Analytics Service
 */
export class SubscriptionAnalyticsService {
  /**
   * Get overall subscription metrics
   */
  static async getSubscriptionMetrics(clinicId: number): Promise<SubscriptionMetrics> {
    return withClinicContext(clinicId, async () => {
      // Get all subscriptions
      const subscriptions = await prisma.subscription.findMany({
        where: { clinicId },
        select: {
          id: true,
          status: true,
          planName: true,
          amount: true,
          interval: true,
        },
      });

      // Count by status
      const statusCounts = {
        ACTIVE: 0,
        PAUSED: 0,
        CANCELED: 0,
        PAST_DUE: 0,
        EXPIRED: 0,
      };

      subscriptions.forEach((sub: typeof subscriptions[number]) => {
        if (sub.status in statusCounts) {
          statusCounts[sub.status as keyof typeof statusCounts]++;
        }
      });

      // Calculate MRR (only active subscriptions)
      const calculateMonthlyAmount = (amount: number, interval: string | null): number => {
        switch (interval?.toUpperCase()) {
          case 'WEEKLY': return amount * 4;
          case 'MONTHLY': return amount;
          case 'QUARTERLY': return Math.round(amount / 3);
          case 'SEMI_ANNUAL': return Math.round(amount / 6);
          case 'ANNUAL': return Math.round(amount / 12);
          default: return amount;
        }
      };

      const activeSubscriptions = subscriptions.filter((s: { status: string }) => s.status === 'ACTIVE');
      const totalMrr = activeSubscriptions.reduce(
        (sum: number, sub: { amount: number; interval: string | null }) => sum + calculateMonthlyAmount(sub.amount, sub.interval),
        0
      );

      const avgValue = activeSubscriptions.length > 0
        ? Math.round(totalMrr / activeSubscriptions.length)
        : 0;

      // Group by plan
      const planMap = new Map<string, { count: number; mrr: number }>();
      activeSubscriptions.forEach((sub: { planName?: string; amount: number; interval: string | null }) => {
        const planName = sub.planName || 'Unknown Plan';
        const existing = planMap.get(planName);
        const monthlyAmount = calculateMonthlyAmount(sub.amount, sub.interval);

        if (existing) {
          existing.count++;
          existing.mrr += monthlyAmount;
        } else {
          planMap.set(planName, { count: 1, mrr: monthlyAmount });
        }
      });

      const subscriptionsByPlan = Array.from(planMap.entries())
        .map(([planName, data]) => ({
          planName,
          count: data.count,
          mrr: data.mrr,
          percentageOfTotal: totalMrr > 0
            ? Math.round((data.mrr / totalMrr) * 10000) / 100
            : 0,
        }))
        .sort((a, b) => b.mrr - a.mrr);

      return {
        activeSubscriptions: statusCounts.ACTIVE,
        pausedSubscriptions: statusCounts.PAUSED,
        canceledSubscriptions: statusCounts.CANCELED,
        pastDueSubscriptions: statusCounts.PAST_DUE,
        totalMrr,
        averageSubscriptionValue: avgValue,
        subscriptionsByPlan,
      };
    });
  }

  /**
   * Analyze churn patterns
   */
  static async getChurnAnalysis(
    clinicId: number,
    dateRange?: DateRange
  ): Promise<ChurnAnalysis> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const start = dateRange?.start || startOfMonth(subMonths(now, 1));
      const end = dateRange?.end || endOfMonth(subMonths(now, 1));

      // Get canceled subscriptions in date range
      const churnedSubscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'CANCELED',
          canceledAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          id: true,
          amount: true,
          interval: true,
          createdAt: true,
          canceledAt: true,
          cancelReason: true,
        },
      });

      const calculateMonthlyAmount = (amount: number, interval: string | null): number => {
        switch (interval?.toUpperCase()) {
          case 'WEEKLY': return amount * 4;
          case 'MONTHLY': return amount;
          case 'QUARTERLY': return Math.round(amount / 3);
          case 'SEMI_ANNUAL': return Math.round(amount / 6);
          case 'ANNUAL': return Math.round(amount / 12);
          default: return amount;
        }
      };

      const churnedCount = churnedSubscriptions.length;
      const churnedMrr = churnedSubscriptions.reduce(
        (sum: number, sub: { amount: number; interval?: string }) => sum + calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY'),
        0
      );

      // Calculate average lifetime before churn
      const lifetimes = churnedSubscriptions
        .filter((sub: { canceledAt: Date | null; createdAt: Date }) => sub.canceledAt && sub.createdAt)
        .map((sub: { canceledAt: Date | null; createdAt: Date }) => differenceInDays(sub.canceledAt!, sub.createdAt));
      
      const avgLifetime = lifetimes.length > 0
        ? Math.round(lifetimes.reduce((a: number, b: number) => a + b, 0) / lifetimes.length)
        : 0;

      // Get active subscriptions at start of period for churn rate calculation
      const activeAtStart = await prisma.subscription.count({
        where: {
          clinicId,
          OR: [
            { status: 'ACTIVE' },
            {
              status: 'CANCELED',
              canceledAt: { gt: start },
            },
          ],
          createdAt: { lt: start },
        },
      });

      const churnRate = activeAtStart > 0
        ? Math.round((churnedCount / activeAtStart) * 10000) / 100
        : 0;

      // Group by cancel reason
      const reasonMap = new Map<string, { count: number; mrr: number }>();
      churnedSubscriptions.forEach((sub: { cancelReason?: string; amount: number; interval?: string }) => {
        const reason = sub.cancelReason || 'Not specified';
        const existing = reasonMap.get(reason);
        const mrr = calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY');

        if (existing) {
          existing.count++;
          existing.mrr += mrr;
        } else {
          reasonMap.set(reason, { count: 1, mrr });
        }
      });

      const churnReasons = Array.from(reasonMap.entries())
        .map(([reason, data]) => ({
          reason,
          count: data.count,
          mrr: data.mrr,
          percentageOfTotal: churnedCount > 0
            ? Math.round((data.count / churnedCount) * 10000) / 100
            : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        churnRate,
        churnedCount,
        churnedMrr,
        churnReasons,
        averageLifetimeBeforeChurn: avgLifetime,
        retentionRate: 100 - churnRate,
      };
    });
  }

  /**
   * Get subscription trends over time
   */
  static async getSubscriptionTrends(
    clinicId: number,
    months: number = 12
  ): Promise<SubscriptionTrend[]> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const startDate = startOfMonth(subMonths(now, months));
      const intervals = eachMonthOfInterval({ start: startDate, end: now });

      const trends: SubscriptionTrend[] = [];

      const calculateMonthlyAmount = (amount: number, interval: string | null): number => {
        switch (interval?.toUpperCase()) {
          case 'WEEKLY': return amount * 4;
          case 'MONTHLY': return amount;
          case 'QUARTERLY': return Math.round(amount / 3);
          case 'SEMI_ANNUAL': return Math.round(amount / 6);
          case 'ANNUAL': return Math.round(amount / 12);
          default: return amount;
        }
      };

      for (const monthStart of intervals) {
        const monthEnd = endOfMonth(monthStart);
        const monthKey = format(monthStart, 'yyyy-MM');

        // New subscriptions in this month
        const newSubs = await prisma.subscription.count({
          where: {
            clinicId,
            createdAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
        });

        // Canceled subscriptions in this month
        const canceledSubs = await prisma.subscription.count({
          where: {
            clinicId,
            canceledAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
        });

        // Active subscriptions at end of month
        const activeAtEnd = await prisma.subscription.findMany({
          where: {
            clinicId,
            OR: [
              { status: 'ACTIVE' },
              {
                status: 'CANCELED',
                canceledAt: { gt: monthEnd },
              },
            ],
            createdAt: { lte: monthEnd },
          },
          select: {
            amount: true,
            interval: true,
          },
        });

        const mrr = activeAtEnd.reduce(
          (sum, sub) => sum + calculateMonthlyAmount(sub.amount, sub.interval),
          0
        );

        trends.push({
          month: monthKey,
          newSubscriptions: newSubs,
          canceledSubscriptions: canceledSubs,
          netChange: newSubs - canceledSubs,
          endingCount: activeAtEnd.length,
          mrr,
        });
      }

      return trends;
    });
  }

  /**
   * Get detailed subscription list with filters
   */
  static async getSubscriptionDetails(
    clinicId: number,
    options: {
      status?: string;
      planName?: string;
      page?: number;
      limit?: number;
      sortBy?: 'amount' | 'createdAt' | 'canceledAt';
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ subscriptions: SubscriptionDetail[]; total: number }> {
    return withClinicContext(clinicId, async () => {
      const { 
        status, 
        planName, 
        page = 1, 
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc',
      } = options;

      const where: any = { clinicId };
      if (status) where.status = status;
      if (planName) where.planName = planName;

      const [subscriptions, total] = await Promise.all([
        prisma.subscription.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            patient: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        }),
        prisma.subscription.count({ where }),
      ]);

      // Get payment counts for each subscription's patient
      const details = await Promise.all(
        subscriptions.map(async (sub) => {
          const [payments, totalValue] = await Promise.all([
            prisma.payment.count({
              where: {
                patientId: sub.patientId,
                clinicId,
                status: 'SUCCEEDED',
              },
            }),
            prisma.payment.aggregate({
              where: {
                patientId: sub.patientId,
                clinicId,
                status: 'SUCCEEDED',
              },
              _sum: { amount: true },
            }),
          ]);

          return {
            id: sub.id,
            patientId: sub.patientId,
            patientName: sub.patient 
              ? `${sub.patient.firstName} ${sub.patient.lastName}`
              : 'Unknown',
            patientEmail: sub.patient?.email || '',
            planName: sub.planName,
            status: sub.status,
            amount: sub.amount,
            interval: sub.interval,
            startDate: sub.createdAt,
            canceledAt: sub.canceledAt,
            cancelReason: sub.cancelReason,
            lifetimeValue: totalValue._sum.amount || 0,
            paymentCount: payments,
            daysSinceStart: differenceInDays(new Date(), sub.createdAt),
          };
        })
      );

      return { subscriptions: details, total };
    });
  }

  /**
   * Get subscriptions expiring soon (for renewal campaigns)
   */
  static async getExpiringSubscriptions(
    clinicId: number,
    daysAhead: number = 30
  ): Promise<SubscriptionDetail[]> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      // Get subscriptions with end dates in the window
      const subscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: futureDate,
          },
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      return subscriptions.map((sub: typeof subscriptions[number]) => ({
        id: sub.id,
        patientId: sub.patientId,
        patientName: sub.patient 
          ? `${sub.patient.firstName} ${sub.patient.lastName}`
          : 'Unknown',
        patientEmail: sub.patient?.email || '',
        planName: sub.planName,
        status: sub.status,
        amount: sub.amount,
        interval: sub.interval,
        startDate: sub.createdAt,
        canceledAt: sub.canceledAt,
        cancelReason: sub.cancelReason,
        lifetimeValue: 0, // Would need additional query
        paymentCount: 0, // Would need additional query
        daysSinceStart: differenceInDays(now, sub.createdAt),
      }));
    });
  }

  /**
   * Get past due subscriptions requiring attention
   */
  static async getPastDueSubscriptions(
    clinicId: number
  ): Promise<{
    subscriptions: SubscriptionDetail[];
    totalAmount: number;
    daysPastDue: { under7: number; under30: number; over30: number };
  }> {
    return withClinicContext(clinicId, async () => {
      const subscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'PAST_DUE',
        },
        include: {
          patient: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      });

      let totalAmount = 0;
      const daysPastDue = { under7: 0, under30: 0, over30: 0 };
      const now = new Date();

      const details = subscriptions.map((sub: typeof subscriptions[number]) => {
        totalAmount += sub.amount;
        
        // Check last payment attempt to determine days past due
        // This is a simplified calculation
        const daysSinceStart = differenceInDays(now, sub.createdAt);
        if (daysSinceStart < 7) daysPastDue.under7++;
        else if (daysSinceStart < 30) daysPastDue.under30++;
        else daysPastDue.over30++;

        return {
          id: sub.id,
          patientId: sub.patientId,
          patientName: sub.patient 
            ? `${sub.patient.firstName} ${sub.patient.lastName}`
            : 'Unknown',
          patientEmail: sub.patient?.email || '',
          planName: sub.planName,
          status: sub.status,
          amount: sub.amount,
          interval: sub.interval,
          startDate: sub.createdAt,
          canceledAt: sub.canceledAt,
          cancelReason: sub.cancelReason,
          lifetimeValue: 0,
          paymentCount: 0,
          daysSinceStart,
        };
      });

      return {
        subscriptions: details,
        totalAmount,
        daysPastDue,
      };
    });
  }

  /**
   * Get subscription actions/activity log
   */
  static async getSubscriptionActivity(
    clinicId: number,
    subscriptionId?: number,
    dateRange?: DateRange
  ): Promise<Array<{
    id: number;
    subscriptionId: number;
    action: string;
    oldValue: any;
    newValue: any;
    createdAt: Date;
    performedBy: string | null;
  }>> {
    const now = new Date();
    const start = dateRange?.start || subMonths(now, 1);
    const end = dateRange?.end || now;

    const where: any = {
      createdAt: {
        gte: start,
        lte: end,
      },
    };

    if (subscriptionId) {
      where.subscriptionId = subscriptionId;
    }

    const actions = await prisma.subscriptionAction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        performedBy: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return actions.map((action: typeof actions[number]) => ({
      id: action.id,
      subscriptionId: action.subscriptionId,
      action: action.actionType,
      oldValue: action.oldValue,
      newValue: action.newValue,
      createdAt: action.createdAt,
      performedBy: action.performedBy 
        ? `${action.performedBy.firstName} ${action.performedBy.lastName}`
        : null,
    }));
  }
}
