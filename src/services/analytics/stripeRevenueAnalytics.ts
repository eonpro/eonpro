/**
 * Stripe Revenue Analytics Service
 *
 * Provides MRR/ARR time series, churn analytics, cohort revenue analysis,
 * net revenue trends, and simple linear forecasting from Stripe data.
 */

import {
  getStripeForClinic,
  getStripeForPlatform,
  withConnectedAccount,
} from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import type { StripeContext } from '@/lib/stripe/connect';
import { logger } from '@/lib/logger';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface MRRDataPoint {
  month: string;
  mrr: number;
  mrrFormatted: string;
  arr: number;
  arrFormatted: string;
  activeSubscriptions: number;
  newSubscriptions: number;
  canceledSubscriptions: number;
}

export interface ChurnDataPoint {
  month: string;
  churnRate: number;
  churnRateFormatted: string;
  churned: number;
  activeAtStart: number;
  retentionRate: number;
  retentionRateFormatted: string;
}

export interface CohortRow {
  cohortMonth: string;
  customerCount: number;
  months: { month: number; revenue: number; revenueFormatted: string; customers: number }[];
}

export interface RevenueTrendPoint {
  month: string;
  gross: number;
  grossFormatted: string;
  refunds: number;
  refundsFormatted: string;
  fees: number;
  feesFormatted: string;
  net: number;
  netFormatted: string;
  transactionCount: number;
}

export interface ForecastPoint {
  month: string;
  projected: number;
  projectedFormatted: string;
  lowerBound: number;
  lowerBoundFormatted: string;
  upperBound: number;
  upperBoundFormatted: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const fmt = (cents: number) => {
  const abs = Math.abs(cents);
  const formatted = `$${(abs / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return cents < 0 ? `-${formatted}` : formatted;
};

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(monthKey(d));
  }
  return result;
}

function addMonths(monthStr: string, n: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return monthKey(d);
}

async function getContext(clinicId?: number): Promise<StripeContext> {
  return clinicId ? getStripeForClinic(clinicId) : getStripeForPlatform();
}

function connOpts(ctx: StripeContext): Record<string, string> {
  return ctx.stripeAccountId ? { stripeAccount: ctx.stripeAccountId } : {};
}

async function fetchAllSubscriptions(
  stripe: Stripe,
  opts: Record<string, any>
): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const params: any = { limit: 100, status: 'all', expand: ['data.items.data.price'], ...opts };
    if (startingAfter) params.starting_after = startingAfter;
    const response = await stripe.subscriptions.list(params);
    all.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
    if (all.length > 5000) break;
  }
  return all;
}

async function fetchAllCharges(
  stripe: Stripe,
  params: Stripe.ChargeListParams,
  opts: Record<string, any>
): Promise<Stripe.Charge[]> {
  const all: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const listParams: any = { ...params, ...opts, limit: 100 };
    if (startingAfter) listParams.starting_after = startingAfter;
    const response = await stripe.charges.list(listParams);
    all.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
    if (all.length > 5000) break;
  }
  return all;
}

// ═══════════════════════════════════════════════════════════════════════════
// MRR TIME SERIES
// ═══════════════════════════════════════════════════════════════════════════

export async function getMRRTimeSeries(clinicId?: number, months = 12): Promise<MRRDataPoint[]> {
  const ctx = await getContext(clinicId);
  const subs = await fetchAllSubscriptions(ctx.stripe, connOpts(ctx));
  const monthRange = getMonthRange(months);

  const result: MRRDataPoint[] = monthRange.map((m) => {
    const monthStart = new Date(`${m}-01T00:00:00Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    let mrr = 0;
    let active = 0;
    let newSubs = 0;
    let canceled = 0;

    for (const sub of subs) {
      const startDate = new Date(sub.created * 1000);
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
      const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000) : null;

      const wasActiveAtMonthEnd =
        startDate < nextMonth &&
        (!canceledAt || canceledAt >= monthStart) &&
        (!endedAt || endedAt >= monthStart);

      if (wasActiveAtMonthEnd) {
        active++;
        const item = sub.items?.data?.[0];
        const price = item?.price;
        if (price?.unit_amount && price.recurring) {
          const amount = price.unit_amount * (item.quantity || 1);
          if (price.recurring.interval === 'year') {
            mrr += Math.round(amount / 12);
          } else if (price.recurring.interval === 'month') {
            mrr +=
              amount * (price.recurring.interval_count || 1) === 1
                ? amount
                : Math.round(amount / (price.recurring.interval_count || 1));
          } else {
            mrr += amount;
          }
        }
      }

      if (monthKey(startDate) === m) newSubs++;
      if (canceledAt && monthKey(canceledAt) === m) canceled++;
    }

    return {
      month: m,
      mrr,
      mrrFormatted: fmt(mrr),
      arr: mrr * 12,
      arrFormatted: fmt(mrr * 12),
      activeSubscriptions: active,
      newSubscriptions: newSubs,
      canceledSubscriptions: canceled,
    };
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHURN ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════

export async function getChurnAnalytics(clinicId?: number, months = 12): Promise<ChurnDataPoint[]> {
  const ctx = await getContext(clinicId);
  const subs = await fetchAllSubscriptions(ctx.stripe, connOpts(ctx));
  const monthRange = getMonthRange(months);

  return monthRange.map((m) => {
    const monthStart = new Date(`${m}-01T00:00:00Z`);
    const nextMonth = new Date(monthStart);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    let activeAtStart = 0;
    let churned = 0;

    for (const sub of subs) {
      const startDate = new Date(sub.created * 1000);
      const canceledAt = sub.canceled_at ? new Date(sub.canceled_at * 1000) : null;
      const endedAt = sub.ended_at ? new Date(sub.ended_at * 1000) : null;

      const wasActiveAtMonthStart =
        startDate < monthStart &&
        (!canceledAt || canceledAt >= monthStart) &&
        (!endedAt || endedAt >= monthStart);

      if (wasActiveAtMonthStart) {
        activeAtStart++;
        if (
          (canceledAt && canceledAt >= monthStart && canceledAt < nextMonth) ||
          (endedAt && endedAt >= monthStart && endedAt < nextMonth)
        ) {
          churned++;
        }
      }
    }

    const churnRate = activeAtStart > 0 ? (churned / activeAtStart) * 100 : 0;
    const retentionRate = 100 - churnRate;

    return {
      month: m,
      churnRate: Math.round(churnRate * 100) / 100,
      churnRateFormatted: `${churnRate.toFixed(1)}%`,
      churned,
      activeAtStart,
      retentionRate: Math.round(retentionRate * 100) / 100,
      retentionRateFormatted: `${retentionRate.toFixed(1)}%`,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// COHORT REVENUE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

export async function getCohortRevenue(clinicId?: number, months = 12): Promise<CohortRow[]> {
  const ctx = await getContext(clinicId);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startTs = Math.floor(startDate.getTime() / 1000);

  const charges = await fetchAllCharges(ctx.stripe, { created: { gte: startTs } }, connOpts(ctx));

  const succeeded = charges.filter((c) => c.status === 'succeeded');

  // Build customer first-charge month map
  const customerFirstMonth: Map<string, string> = new Map();
  const customerCharges: Map<string, { month: string; amount: number }[]> = new Map();

  for (const charge of succeeded) {
    const customerId =
      typeof charge.customer === 'string'
        ? charge.customer
        : charge.customer?.id || charge.billing_details?.email || charge.id;
    const chargeMonth = monthKey(new Date(charge.created * 1000));

    if (!customerFirstMonth.has(customerId) || chargeMonth < customerFirstMonth.get(customerId)!) {
      customerFirstMonth.set(customerId, chargeMonth);
    }

    if (!customerCharges.has(customerId)) customerCharges.set(customerId, []);
    customerCharges.get(customerId)!.push({ month: chargeMonth, amount: charge.amount });
  }

  // Build cohort rows
  const cohortMonths = getMonthRange(months);
  const cohorts: CohortRow[] = [];

  for (const cohortMonth of cohortMonths) {
    const cohortCustomers = Array.from(customerFirstMonth.entries())
      .filter(([, firstMonth]) => firstMonth === cohortMonth)
      .map(([id]) => id);

    if (cohortCustomers.length === 0) continue;

    const monthData: CohortRow['months'] = [];
    for (let i = 0; i < Math.min(months, 12); i++) {
      const targetMonth = addMonths(cohortMonth, i);
      let revenue = 0;
      let customers = 0;

      for (const cid of cohortCustomers) {
        const cCharges = customerCharges.get(cid) || [];
        const monthCharges = cCharges.filter((c) => c.month === targetMonth);
        if (monthCharges.length > 0) {
          customers++;
          revenue += monthCharges.reduce((s, c) => s + c.amount, 0);
        }
      }

      monthData.push({
        month: i,
        revenue,
        revenueFormatted: fmt(revenue),
        customers,
      });
    }

    cohorts.push({
      cohortMonth,
      customerCount: cohortCustomers.length,
      months: monthData,
    });
  }

  return cohorts;
}

// ═══════════════════════════════════════════════════════════════════════════
// NET REVENUE TRENDS
// ═══════════════════════════════════════════════════════════════════════════

export async function getNetRevenueTrend(
  clinicId?: number,
  months = 12
): Promise<RevenueTrendPoint[]> {
  const ctx = await getContext(clinicId);
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startTs = Math.floor(startDate.getTime() / 1000);

  const [charges, balanceTxns] = await Promise.all([
    fetchAllCharges(ctx.stripe, { created: { gte: startTs } }, connOpts(ctx)),
    (async () => {
      const txns: Stripe.BalanceTransaction[] = [];
      let hasMore = true;
      let startingAfter: string | undefined;
      while (hasMore && txns.length < 5000) {
        const params: any = { created: { gte: startTs }, limit: 100, ...connOpts(ctx) };
        if (startingAfter) params.starting_after = startingAfter;
        const response = await ctx.stripe.balanceTransactions.list(params);
        txns.push(...response.data);
        hasMore = response.has_more;
        if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
      }
      return txns;
    })(),
  ]);

  const monthRange = getMonthRange(months);
  const succeeded = charges.filter((c) => c.status === 'succeeded');

  // Pre-compute fees per month from balance transactions
  const feesByMonth: Map<string, number> = new Map();
  for (const tx of balanceTxns) {
    const m = monthKey(new Date(tx.created * 1000));
    feesByMonth.set(m, (feesByMonth.get(m) || 0) + tx.fee);
  }

  return monthRange.map((m) => {
    const monthCharges = succeeded.filter((c) => monthKey(new Date(c.created * 1000)) === m);
    const gross = monthCharges.reduce((s, c) => s + c.amount, 0);
    const refunds = monthCharges.reduce((s, c) => s + (c.amount_refunded || 0), 0);
    const fees = feesByMonth.get(m) || 0;
    const net = gross - refunds - fees;

    return {
      month: m,
      gross,
      grossFormatted: fmt(gross),
      refunds,
      refundsFormatted: fmt(refunds),
      fees,
      feesFormatted: fmt(fees),
      net,
      netFormatted: fmt(net),
      transactionCount: monthCharges.length,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// REVENUE FORECASTING (linear regression)
// ═══════════════════════════════════════════════════════════════════════════

export async function getRevenueForecasting(
  clinicId?: number,
  historicalMonths = 12
): Promise<ForecastPoint[]> {
  const trends = await getNetRevenueTrend(clinicId, historicalMonths);

  if (trends.length < 3) return [];

  // Simple linear regression on net revenue
  const n = trends.length;
  const xs = trends.map((_, i) => i);
  const ys = trends.map((t) => t.net);

  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Standard error for confidence band
  const predicted = xs.map((x) => slope * x + intercept);
  const residuals = ys.map((y, i) => y - predicted[i]);
  const sse = residuals.reduce((a, r) => a + r * r, 0);
  const se = Math.sqrt(sse / (n - 2));

  const lastMonth = trends[trends.length - 1].month;
  const forecastMonths = 3;
  const forecasts: ForecastPoint[] = [];

  for (let i = 1; i <= forecastMonths; i++) {
    const x = n - 1 + i;
    const projected = Math.round(slope * x + intercept);
    const margin = Math.round(
      1.96 * se * Math.sqrt(1 + 1 / n + (x - sumX / n) ** 2 / (sumX2 - (sumX * sumX) / n))
    );

    forecasts.push({
      month: addMonths(lastMonth, i),
      projected,
      projectedFormatted: fmt(projected),
      lowerBound: Math.max(0, projected - margin),
      lowerBoundFormatted: fmt(Math.max(0, projected - margin)),
      upperBound: projected + margin,
      upperBoundFormatted: fmt(projected + margin),
    });
  }

  return forecasts;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMBINED ANALYTICS (all-in-one)
// ═══════════════════════════════════════════════════════════════════════════

export async function getAllAnalytics(clinicId?: number, months = 12) {
  const [mrr, churn, cohorts, trends, forecast] = await Promise.all([
    getMRRTimeSeries(clinicId, months).catch((e) => {
      logger.error('[StripeAnalytics] MRR failed', { error: e.message });
      return [];
    }),
    getChurnAnalytics(clinicId, months).catch((e) => {
      logger.error('[StripeAnalytics] Churn failed', { error: e.message });
      return [];
    }),
    getCohortRevenue(clinicId, months).catch((e) => {
      logger.error('[StripeAnalytics] Cohorts failed', { error: e.message });
      return [];
    }),
    getNetRevenueTrend(clinicId, months).catch((e) => {
      logger.error('[StripeAnalytics] Trends failed', { error: e.message });
      return [];
    }),
    getRevenueForecasting(clinicId, months).catch((e) => {
      logger.error('[StripeAnalytics] Forecast failed', { error: e.message });
      return [];
    }),
  ]);

  const currentMrr = mrr.length > 0 ? mrr[mrr.length - 1] : null;
  const avgChurn = churn.length > 0 ? churn.reduce((s, c) => s + c.churnRate, 0) / churn.length : 0;
  const totalNetRevenue = trends.reduce((s, t) => s + t.net, 0);

  return {
    mrr,
    churn,
    cohorts,
    trends,
    forecast,
    summary: {
      currentMRR: currentMrr?.mrr || 0,
      currentMRRFormatted: fmt(currentMrr?.mrr || 0),
      currentARR: currentMrr?.arr || 0,
      currentARRFormatted: fmt(currentMrr?.arr || 0),
      activeSubscriptions: currentMrr?.activeSubscriptions || 0,
      avgMonthlyChurn: Math.round(avgChurn * 100) / 100,
      avgMonthlyChurnFormatted: `${avgChurn.toFixed(1)}%`,
      totalNetRevenue,
      totalNetRevenueFormatted: fmt(totalNetRevenue),
      months,
    },
  };
}
