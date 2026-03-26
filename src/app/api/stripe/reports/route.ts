import { instantToCalendarDate, PLATFORM_FALLBACK_TIMEZONE } from '@/lib/utils/platform-calendar';
import { midnightInTz } from '@/lib/utils/timezone';
/**
 * STRIPE COMPREHENSIVE REPORTS API
 *
 * GET /api/stripe/reports - Generate comprehensive financial reports
 *
 * Provides:
 * - Revenue reports
 * - Growth metrics
 * - Cohort analysis
 * - Financial summaries
 * - Export-ready data
 *
 * PROTECTED: Requires admin authentication
 *
 * Supports multi-tenant data isolation via clinic context
 */

import { NextRequest, NextResponse } from 'next/server';
import { formatCurrency } from '@/lib/stripe';
import { getStripeContextForRequest, getNotConnectedResponse } from '@/lib/stripe/context';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';
import { withAuth, AuthUser } from '@/lib/auth/middleware';

async function getReportsHandler(request: NextRequest, user: AuthUser) {
  try {
    // Only admins can view financial reports
    if (!['admin', 'super_admin'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized - admin access required' }, { status: 403 });
    }

    // Get Stripe context for clinic
    const { context, error, notConnected } = await getStripeContextForRequest(request, user);
    if (error) return error;
    if (notConnected || !context) {
      return getNotConnectedResponse(context?.clinicId);
    }

    const { stripe, stripeAccountId, clinicId, isPlatformAccount } = context;
    const { searchParams } = new URL(request.url);

    const reportType = searchParams.get('type') || 'summary';
    const startDateParam = searchParams.get('startDate') || getDefaultStartDate();
    const endDateParam = searchParams.get('endDate') || new Date().toISOString();
    const groupBy = searchParams.get('groupBy') || 'day';

    const startTimestamp = Math.floor(parseDateToTimestamp(startDateParam) / 1000);
    const endTimestamp = Math.floor(parseDateToTimestamp(endDateParam, true) / 1000);

    let reportData: any = {};

    // Pass stripeAccountId for connected account API calls
    const accountOptions = stripeAccountId ? { stripeAccount: stripeAccountId } : undefined;

    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(
          stripe,
          startTimestamp,
          endTimestamp,
          accountOptions
        );
        break;
      case 'revenue':
        reportData = await generateRevenueReport(
          stripe,
          startTimestamp,
          endTimestamp,
          groupBy,
          accountOptions
        );
        break;
      case 'subscriptions':
        reportData = await generateSubscriptionReport(
          stripe,
          startTimestamp,
          endTimestamp,
          accountOptions
        );
        break;
      case 'products':
        reportData = await generateProductReport(
          stripe,
          startTimestamp,
          endTimestamp,
          accountOptions
        );
        break;
      case 'customers':
        reportData = await generateCustomerReport(
          stripe,
          startTimestamp,
          endTimestamp,
          accountOptions
        );
        break;
      default:
        return NextResponse.json(
          {
            error:
              'Invalid report type. Available: summary, revenue, subscriptions, products, customers',
          },
          { status: 400 }
        );
    }

    logger.info('[STRIPE REPORTS] Generated report', {
      type: reportType,
      startDate: startDateParam,
      endDate: endDateParam,
    });

    return NextResponse.json({
      success: true,
      report: {
        type: reportType,
        period: {
          start: startDateParam,
          end: endDateParam,
        },
        generatedAt: new Date().toISOString(),
        data: reportData,
      },
    });
  } catch (error: unknown) {
    logger.error('[STRIPE REPORTS] Error:', error);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getReportsHandler);

type AccountOptions = { stripeAccount: string } | undefined;

async function generateSummaryReport(
  stripe: Stripe,
  startTimestamp: number,
  endTimestamp: number,
  accountOptions?: AccountOptions
) {
  const reqOpts = accountOptions ? accountOptions : undefined;

  async function fetchAllCharges(params: Stripe.ChargeListParams): Promise<Stripe.Charge[]> {
    const allItems: Stripe.Charge[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const listParams: Stripe.ChargeListParams = {
        ...params,
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      };
      const response = await stripe.charges.list(listParams, reqOpts);
      allItems.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      if (allItems.length > 10000) break;
    }
    return allItems;
  }

  async function fetchAllRefunds(params: Stripe.RefundListParams): Promise<Stripe.Refund[]> {
    const allItems: Stripe.Refund[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const listParams: Stripe.RefundListParams = {
        ...params,
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      };
      const response = await stripe.refunds.list(listParams, reqOpts);
      allItems.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      if (allItems.length > 10000) break;
    }
    return allItems;
  }

  async function fetchAllInvoices(params: Stripe.InvoiceListParams): Promise<Stripe.Invoice[]> {
    const allItems: Stripe.Invoice[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const listParams: Stripe.InvoiceListParams = {
        ...params,
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      };
      const response = await stripe.invoices.list(listParams, reqOpts);
      allItems.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      if (allItems.length > 10000) break;
    }
    return allItems;
  }

  async function fetchAllSubscriptions(): Promise<Stripe.Subscription[]> {
    const allItems: Stripe.Subscription[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const listParams: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      };
      const response = await stripe.subscriptions.list(listParams, reqOpts);
      allItems.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) {
        startingAfter = response.data[response.data.length - 1].id;
      }
      if (allItems.length > 5000) break;
    }
    return allItems;
  }

  // Fetch date-filtered data AND current subscriptions (MRR/ARR should always be current)
  const [
    charges,
    refunds,
    balance,
    customers,
    activeSubscriptions,
    allOpenInvoices,
    dateFilteredInvoices,
    balanceTransactions,
  ] = await Promise.all([
    fetchAllCharges({ created: { gte: startTimestamp, lte: endTimestamp } }),
    fetchAllRefunds({ created: { gte: startTimestamp, lte: endTimestamp } }),
    stripe.balance.retrieve(reqOpts),
    stripe.customers.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }, reqOpts),
    fetchAllSubscriptions(),
    stripe.invoices.list({ status: 'open', limit: 100 }, reqOpts),
    fetchAllInvoices({ created: { gte: startTimestamp, lte: endTimestamp } }),
    stripe.balanceTransactions.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }, reqOpts),
  ]);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalRevenue = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = balanceTransactions.data.reduce((sum, tx) => sum + tx.fee, 0);
  const netRevenue = totalRevenue - totalRefunds - totalFees;

  const paidInvoices = dateFilteredInvoices.filter((i) => i.status === 'paid');

  const currentMRR = calculateMRR(activeSubscriptions);

  return {
    revenue: {
      gross: totalRevenue,
      grossFormatted: formatCurrency(totalRevenue),
      refunds: totalRefunds,
      refundsFormatted: formatCurrency(totalRefunds),
      fees: totalFees,
      feesFormatted: formatCurrency(totalFees),
      net: netRevenue,
      netFormatted: formatCurrency(netRevenue),
      transactionCount: successfulCharges.length,
      averageTransactionValue:
        successfulCharges.length > 0 ? Math.round(totalRevenue / successfulCharges.length) : 0,
      averageTransactionValueFormatted:
        successfulCharges.length > 0
          ? formatCurrency(Math.round(totalRevenue / successfulCharges.length))
          : '$0.00',
    },
    balance: {
      available: balance.available.reduce((sum, b) => sum + b.amount, 0),
      availableFormatted: formatCurrency(balance.available.reduce((sum, b) => sum + b.amount, 0)),
      pending: balance.pending.reduce((sum, b) => sum + b.amount, 0),
      pendingFormatted: formatCurrency(balance.pending.reduce((sum, b) => sum + b.amount, 0)),
    },
    customers: {
      new: customers.data.length,
      total: 'N/A (requires full count)',
    },
    subscriptions: {
      active: activeSubscriptions.length,
      canceled: 0,
      mrr: currentMRR,
      mrrFormatted: formatCurrency(currentMRR),
      arr: currentMRR * 12,
      arrFormatted: formatCurrency(currentMRR * 12),
    },
    invoices: {
      total: dateFilteredInvoices.length,
      paid: paidInvoices.length,
      open: allOpenInvoices.data.length,
      paidAmount: paidInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0),
      paidAmountFormatted: formatCurrency(
        paidInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0)
      ),
      openAmount: allOpenInvoices.data.reduce((sum, i) => sum + (i.amount_due || 0), 0),
      openAmountFormatted: formatCurrency(
        allOpenInvoices.data.reduce((sum, i) => sum + (i.amount_due || 0), 0)
      ),
    },
    refunds: {
      count: refunds.length,
      total: totalRefunds,
      totalFormatted: formatCurrency(totalRefunds),
      refundRate:
        successfulCharges.length > 0
          ? ((refunds.length / successfulCharges.length) * 100).toFixed(2) + '%'
          : '0%',
    },
  };
}

async function generateRevenueReport(
  stripe: Stripe,
  startTimestamp: number,
  endTimestamp: number,
  groupBy: string,
  accountOptions?: AccountOptions
) {
  const reqOpts = accountOptions ? accountOptions : undefined;
  const allCharges: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore) {
    const params: Stripe.ChargeListParams = {
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    };
    const response = await stripe.charges.list(params, reqOpts);
    allCharges.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
    if (allCharges.length > 10000) break;
  }

  const successfulCharges = allCharges.filter((c) => c.status === 'succeeded');

  // Group by time period
  const grouped: Record<string, { revenue: number; count: number; refunds: number }> = {};

  successfulCharges.forEach((charge) => {
    const date = new Date(charge.created * 1000);
    let key: string;

    switch (groupBy) {
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = instantToCalendarDate(weekStart);
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default: // day
        key = instantToCalendarDate(date);
    }

    if (!grouped[key]) {
      grouped[key] = { revenue: 0, count: 0, refunds: 0 };
    }
    grouped[key].revenue += charge.amount;
    grouped[key].count++;
    grouped[key].refunds += charge.amount_refunded || 0;
  });

  const periods = Object.entries(grouped)
    .map(([period, data]) => ({
      period,
      revenue: data.revenue,
      revenueFormatted: formatCurrency(data.revenue),
      transactionCount: data.count,
      refunds: data.refunds,
      refundsFormatted: formatCurrency(data.refunds),
      netRevenue: data.revenue - data.refunds,
      netRevenueFormatted: formatCurrency(data.revenue - data.refunds),
    }))
    .sort((a, b) => a.period.localeCompare(b.period));

  // Calculate growth
  const growth =
    periods.length >= 2
      ? {
          revenueChange: periods[periods.length - 1].revenue - periods[periods.length - 2].revenue,
          revenueChangePercent:
            periods[periods.length - 2].revenue > 0
              ? (
                  ((periods[periods.length - 1].revenue - periods[periods.length - 2].revenue) /
                    periods[periods.length - 2].revenue) *
                  100
                ).toFixed(1) + '%'
              : 'N/A',
        }
      : null;

  return {
    periods,
    totals: {
      revenue: successfulCharges.reduce((sum, c) => sum + c.amount, 0),
      revenueFormatted: formatCurrency(successfulCharges.reduce((sum, c) => sum + c.amount, 0)),
      transactionCount: successfulCharges.length,
    },
    growth,
    groupBy,
  };
}

async function generateSubscriptionReport(
  stripe: Stripe,
  startTimestamp: number,
  endTimestamp: number,
  accountOptions?: AccountOptions
) {
  const reqOpts = accountOptions ? accountOptions : undefined;
  const allSubs: Stripe.Subscription[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore) {
    const params: Stripe.SubscriptionListParams = {
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
      expand: ['data.items.data.price'],
      ...(startingAfter && { starting_after: startingAfter }),
    };
    const response = await stripe.subscriptions.list(params, reqOpts);
    allSubs.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
    if (allSubs.length > 5000) break;
  }
  const subscriptions = { data: allSubs };

  const statusBreakdown: Record<string, number> = {};
  let totalMRR = 0;

  subscriptions.data.forEach((sub) => {
    statusBreakdown[sub.status] = (statusBreakdown[sub.status] || 0) + 1;

    if (sub.status === 'active') {
      sub.items.data.forEach((item) => {
        const price = item.price;
        if (price.recurring) {
          let monthlyAmount = price.unit_amount || 0;
          if (price.recurring.interval === 'year') {
            monthlyAmount = monthlyAmount / 12;
          } else if (price.recurring.interval === 'week') {
            monthlyAmount = monthlyAmount * 4;
          }
          totalMRR += monthlyAmount * (item.quantity || 1);
        }
      });
    }
  });

  return {
    totalSubscriptions: subscriptions.data.length,
    byStatus: Object.entries(statusBreakdown).map(([status, count]) => ({
      status,
      count,
      percentage: ((count / subscriptions.data.length) * 100).toFixed(1) + '%',
    })),
    mrr: totalMRR,
    mrrFormatted: formatCurrency(totalMRR),
    arr: totalMRR * 12,
    arrFormatted: formatCurrency(totalMRR * 12),
    churnedCount: subscriptions.data.filter((s) => s.status === 'canceled').length,
  };
}

async function generateProductReport(
  stripe: Stripe,
  startTimestamp: number,
  endTimestamp: number,
  accountOptions?: AccountOptions
) {
  const reqOpts = accountOptions ? accountOptions : undefined;
  const allCharges: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore) {
    const params: Stripe.ChargeListParams = {
      created: { gte: startTimestamp, lte: endTimestamp },
      limit: 100,
      expand: ['data.invoice'],
      ...(startingAfter && { starting_after: startingAfter }),
    };
    const response = await stripe.charges.list(params, reqOpts);
    allCharges.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
    if (allCharges.length > 10000) break;
  }
  const charges = { data: allCharges };

  const productRevenue: Record<string, { name: string; revenue: number; count: number }> = {};

  charges.data
    .filter((c) => c.status === 'succeeded')
    .forEach((charge) => {
      // Try to extract product info from description or metadata
      const productName = charge.description || charge.metadata?.product_name || 'Other';

      if (!productRevenue[productName]) {
        productRevenue[productName] = { name: productName, revenue: 0, count: 0 };
      }
      productRevenue[productName].revenue += charge.amount;
      productRevenue[productName].count++;
    });

  const products = Object.values(productRevenue)
    .map((p) => ({
      name: p.name,
      revenue: p.revenue,
      revenueFormatted: formatCurrency(p.revenue),
      transactionCount: p.count,
      averagePrice: p.count > 0 ? Math.round(p.revenue / p.count) : 0,
      averagePriceFormatted:
        p.count > 0 ? formatCurrency(Math.round(p.revenue / p.count)) : '$0.00',
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);

  return {
    products: products.map((p) => ({
      ...p,
      revenueShare: totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
    })),
    totalRevenue,
    totalRevenueFormatted: formatCurrency(totalRevenue),
    productCount: products.length,
  };
}

async function generateCustomerReport(
  stripe: Stripe,
  startTimestamp: number,
  endTimestamp: number,
  accountOptions?: AccountOptions
) {
  const reqOpts = accountOptions ? accountOptions : undefined;

  async function fetchAllPaginated<T extends { id: string }>(
    listFn: (params: any, opts?: any) => Promise<{ data: T[]; has_more: boolean }>,
    baseParams: Record<string, any>,
  ): Promise<T[]> {
    const all: T[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const params = { ...baseParams, limit: 100, ...(startingAfter && { starting_after: startingAfter }) };
      const response = await listFn(params, reqOpts);
      all.push(...response.data);
      hasMore = response.has_more;
      if (response.data.length > 0) startingAfter = response.data[response.data.length - 1].id;
      if (all.length > 10000) break;
    }
    return all;
  }

  const [newCustomersList, chargesList] = await Promise.all([
    fetchAllPaginated(
      stripe.customers.list.bind(stripe.customers),
      { created: { gte: startTimestamp, lte: endTimestamp } },
    ),
    fetchAllPaginated(
      stripe.charges.list.bind(stripe.charges),
      { created: { gte: startTimestamp, lte: endTimestamp } },
    ),
  ]);
  const newCustomers = { data: newCustomersList };
  const charges = { data: chargesList };

  const successfulCharges = charges.data.filter((c) => c.status === 'succeeded');
  const customerSpending: Record<string, number> = {};

  successfulCharges.forEach((charge) => {
    const customerId = typeof charge.customer === 'string' ? charge.customer : charge.customer?.id;
    if (customerId) {
      customerSpending[customerId] = (customerSpending[customerId] || 0) + charge.amount;
    }
  });

  const spendingValues = Object.values(customerSpending);
  const totalSpending = spendingValues.reduce((sum, s) => sum + s, 0);
  const uniqueCustomers = Object.keys(customerSpending).length;

  // Calculate spending distribution
  const spendingBuckets = {
    'Under $100': spendingValues.filter((s) => s < 10000).length,
    '$100-$500': spendingValues.filter((s) => s >= 10000 && s < 50000).length,
    '$500-$1000': spendingValues.filter((s) => s >= 50000 && s < 100000).length,
    'Over $1000': spendingValues.filter((s) => s >= 100000).length,
  };

  return {
    newCustomers: newCustomers.data.length,
    activeCustomers: uniqueCustomers,
    totalSpending,
    totalSpendingFormatted: formatCurrency(totalSpending),
    averageSpending: uniqueCustomers > 0 ? Math.round(totalSpending / uniqueCustomers) : 0,
    averageSpendingFormatted:
      uniqueCustomers > 0 ? formatCurrency(Math.round(totalSpending / uniqueCustomers)) : '$0.00',
    spendingDistribution: Object.entries(spendingBuckets).map(([bucket, count]) => ({
      bucket,
      count,
      percentage: uniqueCustomers > 0 ? ((count / uniqueCustomers) * 100).toFixed(1) + '%' : '0%',
    })),
    topCustomers: Object.entries(customerSpending)
      .map(([id, spending]) => ({
        customerId: id,
        spending,
        spendingFormatted: formatCurrency(spending),
      }))
      .sort((a, b) => b.spending - a.spending)
      .slice(0, 10),
  };
}

function calculateMRR(subscriptions: Stripe.Subscription[]): number {
  return subscriptions.reduce((mrr, sub) => {
    return (
      mrr +
      sub.items.data.reduce((itemMrr, item) => {
        const price = item.price;
        if (!price.unit_amount) return itemMrr;

        let monthlyAmount = price.unit_amount;
        if (price.recurring?.interval === 'year') {
          monthlyAmount = monthlyAmount / 12;
        } else if (price.recurring?.interval === 'week') {
          monthlyAmount = monthlyAmount * 4;
        }

        return itemMrr + monthlyAmount * (item.quantity || 1);
      }, 0)
    );
  }, 0);
}

/**
 * Parse a date string to a Unix-millisecond timestamp.
 * If the input is a plain YYYY-MM-DD string, interpret it in US/Eastern
 * (matching Stripe's typical account timezone) rather than UTC.
 * If `endOfDay` is true, use 23:59:59 in that timezone.
 */
function parseDateToTimestamp(dateStr: string, endOfDay = false): number {
  const dateOnlyMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch.map(Number);
    const midnight = midnightInTz(y, m, d, PLATFORM_FALLBACK_TIMEZONE);
    if (endOfDay) {
      return midnight.getTime() + 24 * 60 * 60 * 1000 - 1;
    }
    return midnight.getTime();
  }
  return new Date(dateStr).getTime();
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString();
}
