/**
 * Revenue Analytics Service
 * 
 * Provides comprehensive revenue metrics, trends, and forecasting for clinics.
 * All amounts are stored and returned in cents.
 */

import { prisma, withClinicContext } from '@/lib/db';
import { stripe, getStripe } from '@/lib/stripe';
import { getStripeForClinic } from '@/lib/stripe/connect';
import { logger } from '@/lib/logger';
import { 
  startOfDay, 
  endOfDay, 
  startOfWeek, 
  startOfMonth, 
  startOfYear,
  endOfMonth,
  subDays, 
  subMonths, 
  subYears,
  format,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  differenceInDays,
  addMonths,
} from 'date-fns';

// Types
export interface DateRange {
  start: Date;
  end: Date;
}

export type Granularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface RevenueOverview {
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  fees: number;
  successfulPayments: number;
  failedPayments: number;
  averageOrderValue: number;
  periodGrowth: number; // Percentage growth vs previous period
}

export interface RevenueTrend {
  date: string;
  grossRevenue: number;
  netRevenue: number;
  refunds: number;
  paymentCount: number;
}

export interface MRRBreakdown {
  totalMrr: number;
  newMrr: number;
  churnedMrr: number;
  expansionMrr: number;
  contractionMrr: number;
  netNewMrr: number;
  activeSubscriptions: number;
  arr: number; // Annual Recurring Revenue
  mrrGrowthRate: number;
}

export interface RevenueByProduct {
  productId: number;
  productName: string;
  revenue: number;
  quantity: number;
  percentageOfTotal: number;
}

export interface RevenueByPaymentMethod {
  method: string;
  revenue: number;
  count: number;
  percentageOfTotal: number;
}

export interface RevenueForecast {
  month: string;
  predictedRevenue: number;
  confidence: number;
  lowerBound: number;
  upperBound: number;
}

export interface PeriodComparison {
  currentPeriod: RevenueOverview;
  previousPeriod: RevenueOverview;
  changes: {
    grossRevenue: number;
    netRevenue: number;
    paymentCount: number;
    averageOrderValue: number;
  };
}

/**
 * Revenue Analytics Service
 */
export class RevenueAnalyticsService {
  /**
   * Get revenue overview for a clinic
   */
  static async getRevenueOverview(
    clinicId: number, 
    dateRange: DateRange
  ): Promise<RevenueOverview> {
    return withClinicContext(clinicId, async () => {
      const { start, end } = dateRange;
      
      // Get payments in the date range
      const payments = await prisma.payment.findMany({
        where: {
          clinicId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          amount: true,
          status: true,
        },
      });

      // Calculate metrics
      const successfulPayments = payments.filter((p: { status: string }) => p.status === 'SUCCEEDED');
      const failedPayments = payments.filter((p: { status: string }) => p.status === 'FAILED');
      
      const grossRevenue = successfulPayments.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
      const fees = 0; // Fee not tracked at payment level
      const netRevenue = grossRevenue;
      
      // Get refunds
      const refunds = await prisma.payment.aggregate({
        where: {
          clinicId,
          status: 'REFUNDED',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const totalRefunds = refunds._sum.amount || 0;
      const avgOrderValue = successfulPayments.length > 0 
        ? Math.round(grossRevenue / successfulPayments.length)
        : 0;

      // Calculate period growth
      const periodLength = differenceInDays(end, start);
      const previousPeriodStart = subDays(start, periodLength);
      const previousPeriodEnd = subDays(end, periodLength);
      
      const previousPayments = await prisma.payment.aggregate({
        where: {
          clinicId,
          status: 'SUCCEEDED',
          createdAt: {
            gte: previousPeriodStart,
            lte: previousPeriodEnd,
          },
        },
        _sum: {
          amount: true,
        },
      });

      const previousGross = previousPayments._sum.amount || 0;
      const periodGrowth = previousGross > 0 
        ? ((grossRevenue - previousGross) / previousGross) * 100
        : grossRevenue > 0 ? 100 : 0;

      return {
        grossRevenue,
        netRevenue,
        refunds: totalRefunds,
        fees,
        successfulPayments: successfulPayments.length,
        failedPayments: failedPayments.length,
        averageOrderValue: avgOrderValue,
        periodGrowth: Math.round(periodGrowth * 100) / 100,
      };
    });
  }

  /**
   * Get revenue trends over time
   */
  static async getRevenueTrends(
    clinicId: number,
    dateRange: DateRange,
    granularity: Granularity = 'daily'
  ): Promise<RevenueTrend[]> {
    return withClinicContext(clinicId, async () => {
      const { start, end } = dateRange;

      // Generate date intervals based on granularity
      let intervals: Date[];
      let dateFormat: string;

      switch (granularity) {
        case 'weekly':
          intervals = eachWeekOfInterval({ start, end });
          dateFormat = 'yyyy-MM-dd';
          break;
        case 'monthly':
          intervals = eachMonthOfInterval({ start, end });
          dateFormat = 'yyyy-MM';
          break;
        case 'quarterly':
          intervals = eachMonthOfInterval({ start, end }).filter((_, i) => i % 3 === 0);
          dateFormat = 'yyyy-QQ';
          break;
        case 'yearly':
          intervals = [start];
          for (let year = start.getFullYear() + 1; year <= end.getFullYear(); year++) {
            intervals.push(new Date(year, 0, 1));
          }
          dateFormat = 'yyyy';
          break;
        default: // daily
          intervals = eachDayOfInterval({ start, end });
          dateFormat = 'yyyy-MM-dd';
      }

      // Get all payments in range
      const payments = await prisma.payment.findMany({
        where: {
          clinicId,
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          amount: true,
          status: true,
          createdAt: true,
        },
      });

      // Group by interval
      const trends: RevenueTrend[] = intervals.map((intervalStart, index) => {
        const intervalEnd = intervals[index + 1] 
          ? new Date(intervals[index + 1].getTime() - 1) 
          : end;

        const intervalPayments = payments.filter((p: { createdAt: Date }) => {
          const date = new Date(p.createdAt);
          return date >= intervalStart && date <= intervalEnd;
        });

        const successful = intervalPayments.filter((p: { status: string }) => p.status === 'SUCCEEDED');
        const refunded = intervalPayments.filter((p: { status: string }) => p.status === 'REFUNDED');

        const grossRevenue = successful.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
        const refunds = refunded.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

        return {
          date: format(intervalStart, dateFormat),
          grossRevenue,
          netRevenue: grossRevenue, // Net = gross when fee not tracked
          refunds,
          paymentCount: successful.length,
        };
      });

      return trends;
    });
  }

  /**
   * Get MRR breakdown and subscription metrics
   */
  static async getMrrBreakdown(clinicId: number): Promise<MRRBreakdown> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      const startOfCurrentMonth = startOfMonth(now);
      const startOfPreviousMonth = startOfMonth(subMonths(now, 1));
      const endOfPreviousMonth = endOfMonth(subMonths(now, 1));

      // Get current active subscriptions
      const activeSubscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          amount: true,
          interval: true,
          createdAt: true,
          canceledAt: true,
        },
      });

      // Calculate current MRR (normalize all intervals to monthly)
      const calculateMonthlyAmount = (amount: number, interval: string): number => {
        switch (interval?.toUpperCase()) {
          case 'WEEKLY': return amount * 4;
          case 'MONTHLY': return amount;
          case 'QUARTERLY': return Math.round(amount / 3);
          case 'SEMI_ANNUAL': return Math.round(amount / 6);
          case 'ANNUAL': return Math.round(amount / 12);
          default: return amount; // Assume monthly
        }
      };

      const totalMrr = activeSubscriptions.reduce(
        (sum: number, sub: { amount: number; interval?: string }) => sum + calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY'),
        0
      );

      // Get new subscriptions this month
      const newSubscriptions = activeSubscriptions.filter(
        (sub: { createdAt: Date }) => sub.createdAt >= startOfCurrentMonth
      );
      const newMrr = newSubscriptions.reduce(
        (sum: number, sub: { amount: number; interval?: string }) => sum + calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY'),
        0
      );

      // Get churned subscriptions this month
      const churnedSubscriptions = await prisma.subscription.findMany({
        where: {
          clinicId,
          status: 'CANCELED',
          canceledAt: {
            gte: startOfCurrentMonth,
          },
        },
        select: {
          amount: true,
          interval: true,
        },
      });

      const churnedMrr = churnedSubscriptions.reduce(
        (sum: number, sub: { amount: number; interval?: string }) => sum + calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY'),
        0
      );

      // Get previous month's MRR for growth calculation
      const previousMrr = await this.calculateHistoricalMrr(clinicId, endOfPreviousMonth);
      
      const netNewMrr = newMrr - churnedMrr;
      const mrrGrowthRate = previousMrr > 0 
        ? ((totalMrr - previousMrr) / previousMrr) * 100 
        : totalMrr > 0 ? 100 : 0;

      return {
        totalMrr,
        newMrr,
        churnedMrr,
        expansionMrr: 0, // Would need upgrade tracking
        contractionMrr: 0, // Would need downgrade tracking
        netNewMrr,
        activeSubscriptions: activeSubscriptions.length,
        arr: totalMrr * 12,
        mrrGrowthRate: Math.round(mrrGrowthRate * 100) / 100,
      };
    });
  }

  /**
   * Get revenue breakdown by product
   */
  static async getRevenueByProduct(
    clinicId: number,
    dateRange: DateRange
  ): Promise<RevenueByProduct[]> {
    return withClinicContext(clinicId, async () => {
      const { start, end } = dateRange;

      // Get invoice items with product info
      const invoiceItems = await prisma.invoiceItem.findMany({
        where: {
          invoice: {
            clinicId,
            status: 'PAID',
            paidAt: {
              gte: start,
              lte: end,
            },
          },
        },
        include: {
          product: true,
        },
      });

      // Group by product
      const productMap = new Map<number, { name: string; revenue: number; quantity: number }>();
      let totalRevenue = 0;

      invoiceItems.forEach((item: typeof invoiceItems[number]) => {
        if (!item.productId) return;

        const existing = productMap.get(item.productId);
        const itemTotal = item.unitPrice * item.quantity;
        totalRevenue += itemTotal;

        if (existing) {
          existing.revenue += itemTotal;
          existing.quantity += item.quantity;
        } else {
          productMap.set(item.productId, {
            name: item.product?.name || `Product ${item.productId}`,
            revenue: itemTotal,
            quantity: item.quantity,
          });
        }
      });

      // Convert to array and sort by revenue
      const result: RevenueByProduct[] = Array.from(productMap.entries())
        .map(([productId, data]) => ({
          productId,
          productName: data.name,
          revenue: data.revenue,
          quantity: data.quantity,
          percentageOfTotal: totalRevenue > 0 
            ? Math.round((data.revenue / totalRevenue) * 10000) / 100 
            : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return result;
    });
  }

  /**
   * Get revenue breakdown by payment method
   */
  static async getRevenueByPaymentMethod(
    clinicId: number,
    dateRange: DateRange
  ): Promise<RevenueByPaymentMethod[]> {
    return withClinicContext(clinicId, async () => {
      const { start, end } = dateRange;

      const payments = await prisma.payment.findMany({
        where: {
          clinicId,
          status: 'SUCCEEDED',
          createdAt: {
            gte: start,
            lte: end,
          },
        },
        select: {
          amount: true,
          paymentMethod: true,
        },
      });

      // Group by payment method
      const methodMap = new Map<string, { revenue: number; count: number }>();
      let totalRevenue = 0;

      payments.forEach((payment: typeof payments[number]) => {
        const method = payment.paymentMethod || 'unknown';
        const existing = methodMap.get(method);
        totalRevenue += payment.amount;

        if (existing) {
          existing.revenue += payment.amount;
          existing.count += 1;
        } else {
          methodMap.set(method, {
            revenue: payment.amount,
            count: 1,
          });
        }
      });

      const result: RevenueByPaymentMethod[] = Array.from(methodMap.entries())
        .map(([method, data]) => ({
          method,
          revenue: data.revenue,
          count: data.count,
          percentageOfTotal: totalRevenue > 0 
            ? Math.round((data.revenue / totalRevenue) * 10000) / 100 
            : 0,
        }))
        .sort((a, b) => b.revenue - a.revenue);

      return result;
    });
  }

  /**
   * Generate revenue forecast for upcoming months
   */
  static async getForecast(
    clinicId: number,
    months: number = 6
  ): Promise<RevenueForecast[]> {
    return withClinicContext(clinicId, async () => {
      const now = new Date();
      
      // Get historical monthly revenue (last 12 months)
      const historicalMonths = 12;
      const historicalStart = subMonths(startOfMonth(now), historicalMonths);
      
      const historicalRevenue: number[] = [];
      
      for (let i = historicalMonths; i > 0; i--) {
        const monthStart = startOfMonth(subMonths(now, i));
        const monthEnd = endOfMonth(subMonths(now, i));
        
        const monthPayments = await prisma.payment.aggregate({
          where: {
            clinicId,
            status: 'SUCCEEDED',
            createdAt: {
              gte: monthStart,
              lte: monthEnd,
            },
          },
          _sum: {
            amount: true,
          },
        });
        
        historicalRevenue.push(monthPayments._sum.amount || 0);
      }

      // Simple linear regression forecast
      // In production, consider more sophisticated models
      const forecasts: RevenueForecast[] = [];
      
      // Calculate average monthly growth rate
      const growthRates: number[] = [];
      for (let i = 1; i < historicalRevenue.length; i++) {
        if (historicalRevenue[i - 1] > 0) {
          growthRates.push(
            (historicalRevenue[i] - historicalRevenue[i - 1]) / historicalRevenue[i - 1]
          );
        }
      }
      
      const avgGrowthRate = growthRates.length > 0 
        ? growthRates.reduce((a: number, b: number) => a + b, 0) / growthRates.length
        : 0;
      
      // Calculate standard deviation for confidence bounds
      const mean = historicalRevenue.reduce((a: number, b: number) => a + b, 0) / historicalRevenue.length;
      const variance = historicalRevenue.reduce((sum: number, val: number) => sum + Math.pow(val - mean, 2), 0) / historicalRevenue.length;
      const stdDev = Math.sqrt(variance);
      
      const lastMonthRevenue = historicalRevenue[historicalRevenue.length - 1] || mean;
      
      for (let i = 1; i <= months; i++) {
        const forecastMonth = addMonths(now, i);
        const predictedRevenue = Math.round(lastMonthRevenue * Math.pow(1 + avgGrowthRate, i));
        
        // Confidence decreases with distance from current month
        const confidence = Math.max(50, 95 - (i * 7.5));
        const uncertaintyFactor = 1 + (i * 0.1);
        
        forecasts.push({
          month: format(forecastMonth, 'yyyy-MM'),
          predictedRevenue,
          confidence: Math.round(confidence),
          lowerBound: Math.round(predictedRevenue - stdDev * uncertaintyFactor),
          upperBound: Math.round(predictedRevenue + stdDev * uncertaintyFactor),
        });
      }

      return forecasts;
    });
  }

  /**
   * Compare revenue between two periods
   */
  static async getComparisonReport(
    clinicId: number,
    period1: DateRange,
    period2: DateRange
  ): Promise<PeriodComparison> {
    const [currentPeriod, previousPeriod] = await Promise.all([
      this.getRevenueOverview(clinicId, period1),
      this.getRevenueOverview(clinicId, period2),
    ]);

    const calculateChange = (current: number, previous: number): number => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 10000) / 100;
    };

    return {
      currentPeriod,
      previousPeriod,
      changes: {
        grossRevenue: calculateChange(currentPeriod.grossRevenue, previousPeriod.grossRevenue),
        netRevenue: calculateChange(currentPeriod.netRevenue, previousPeriod.netRevenue),
        paymentCount: calculateChange(
          currentPeriod.successfulPayments, 
          previousPeriod.successfulPayments
        ),
        averageOrderValue: calculateChange(
          currentPeriod.averageOrderValue, 
          previousPeriod.averageOrderValue
        ),
      },
    };
  }

  /**
   * Helper: Calculate historical MRR at a specific point in time
   */
  private static async calculateHistoricalMrr(
    clinicId: number, 
    asOfDate: Date
  ): Promise<number> {
    // Get subscriptions that were active at the given date
    const subscriptions = await prisma.subscription.findMany({
      where: {
        clinicId,
        createdAt: { lte: asOfDate },
        OR: [
          { status: 'ACTIVE' },
          {
            status: 'CANCELED',
            canceledAt: { gt: asOfDate },
          },
        ],
      },
      select: {
        amount: true,
        interval: true,
      },
    });

    const calculateMonthlyAmount = (amount: number, interval: string): number => {
      switch (interval?.toUpperCase()) {
        case 'WEEKLY': return amount * 4;
        case 'MONTHLY': return amount;
        case 'QUARTERLY': return Math.round(amount / 3);
        case 'SEMI_ANNUAL': return Math.round(amount / 6);
        case 'ANNUAL': return Math.round(amount / 12);
        default: return amount;
      }
    };

    return subscriptions.reduce(
      (sum: number, sub: { amount: number; interval?: string }) => sum + calculateMonthlyAmount(sub.amount, sub.interval || 'MONTHLY'),
      0
    );
  }

  /**
   * Update daily financial metrics (called by webhook/cron)
   */
  static async updateDailyMetrics(clinicId: number, date: Date = new Date()): Promise<void> {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    
    const overview = await this.getRevenueOverview(clinicId, { start: dayStart, end: dayEnd });
    const mrr = await this.getMrrBreakdown(clinicId);

    await prisma.financialMetrics.upsert({
      where: {
        clinicId_date: {
          clinicId,
          date: dayStart,
        },
      },
      create: {
        clinicId,
        date: dayStart,
        grossRevenue: overview.grossRevenue,
        netRevenue: overview.netRevenue,
        refunds: overview.refunds,
        fees: overview.fees,
        successfulPayments: overview.successfulPayments,
        failedPayments: overview.failedPayments,
        averageOrderValue: overview.averageOrderValue,
        newMrr: mrr.newMrr,
        churnedMrr: mrr.churnedMrr,
        activeSubscriptions: mrr.activeSubscriptions,
      },
      update: {
        grossRevenue: overview.grossRevenue,
        netRevenue: overview.netRevenue,
        refunds: overview.refunds,
        fees: overview.fees,
        successfulPayments: overview.successfulPayments,
        failedPayments: overview.failedPayments,
        averageOrderValue: overview.averageOrderValue,
        newMrr: mrr.newMrr,
        churnedMrr: mrr.churnedMrr,
        activeSubscriptions: mrr.activeSubscriptions,
      },
    });

    logger.debug(`Updated financial metrics for clinic ${clinicId} on ${format(dayStart, 'yyyy-MM-dd')}`);
  }
}
