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
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe, formatCurrency } from '@/lib/stripe';
import { logger } from '@/lib/logger';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  try {
    const stripe = getStripe();
    const { searchParams } = new URL(request.url);
    
    const reportType = searchParams.get('type') || 'summary';
    const startDate = searchParams.get('startDate') || getDefaultStartDate();
    const endDate = searchParams.get('endDate') || new Date().toISOString();
    const groupBy = searchParams.get('groupBy') || 'day'; // day, week, month
    
    const startTimestamp = Math.floor(new Date(startDate).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endDate).getTime() / 1000);
    
    let reportData: any = {};
    
    switch (reportType) {
      case 'summary':
        reportData = await generateSummaryReport(stripe, startTimestamp, endTimestamp);
        break;
      case 'revenue':
        reportData = await generateRevenueReport(stripe, startTimestamp, endTimestamp, groupBy);
        break;
      case 'subscriptions':
        reportData = await generateSubscriptionReport(stripe, startTimestamp, endTimestamp);
        break;
      case 'products':
        reportData = await generateProductReport(stripe, startTimestamp, endTimestamp);
        break;
      case 'customers':
        reportData = await generateCustomerReport(stripe, startTimestamp, endTimestamp);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid report type. Available: summary, revenue, subscriptions, products, customers' },
          { status: 400 }
        );
    }
    
    logger.info('[STRIPE REPORTS] Generated report', {
      type: reportType,
      startDate,
      endDate,
    });
    
    return NextResponse.json({
      success: true,
      report: {
        type: reportType,
        period: {
          start: startDate,
          end: endDate,
        },
        generatedAt: new Date().toISOString(),
        data: reportData,
      },
    });
    
  } catch (error: any) {
    logger.error('[STRIPE REPORTS] Error:', error);
    
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

async function generateSummaryReport(stripe: Stripe, startTimestamp: number, endTimestamp: number) {
  // Fetch all data in parallel
  const [charges, refunds, balance, customers, subscriptions, invoices] = await Promise.all([
    stripe.charges.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
    stripe.refunds.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
    stripe.balance.retrieve(),
    stripe.customers.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
    stripe.subscriptions.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
    stripe.invoices.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
  ]);
  
  const successfulCharges = charges.data.filter(c => c.status === 'succeeded');
  const totalRevenue = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunds = refunds.data.reduce((sum, r) => sum + r.amount, 0);
  const netRevenue = totalRevenue - totalRefunds;
  
  const paidInvoices = invoices.data.filter(i => i.status === 'paid');
  const openInvoices = invoices.data.filter(i => i.status === 'open');
  
  return {
    revenue: {
      gross: totalRevenue,
      grossFormatted: formatCurrency(totalRevenue),
      refunds: totalRefunds,
      refundsFormatted: formatCurrency(totalRefunds),
      net: netRevenue,
      netFormatted: formatCurrency(netRevenue),
      transactionCount: successfulCharges.length,
      averageTransactionValue: successfulCharges.length > 0 
        ? Math.round(totalRevenue / successfulCharges.length) 
        : 0,
      averageTransactionValueFormatted: successfulCharges.length > 0 
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
      new: subscriptions.data.length,
      active: subscriptions.data.filter(s => s.status === 'active').length,
      canceled: subscriptions.data.filter(s => s.status === 'canceled').length,
      mrr: calculateMRR(subscriptions.data.filter(s => s.status === 'active')),
      mrrFormatted: formatCurrency(calculateMRR(subscriptions.data.filter(s => s.status === 'active'))),
    },
    invoices: {
      total: invoices.data.length,
      paid: paidInvoices.length,
      open: openInvoices.length,
      paidAmount: paidInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0),
      paidAmountFormatted: formatCurrency(paidInvoices.reduce((sum, i) => sum + (i.amount_paid || 0), 0)),
      openAmount: openInvoices.reduce((sum, i) => sum + (i.amount_due || 0), 0),
      openAmountFormatted: formatCurrency(openInvoices.reduce((sum, i) => sum + (i.amount_due || 0), 0)),
    },
    refunds: {
      count: refunds.data.length,
      total: totalRefunds,
      totalFormatted: formatCurrency(totalRefunds),
      refundRate: successfulCharges.length > 0 
        ? ((refunds.data.length / successfulCharges.length) * 100).toFixed(2) + '%'
        : '0%',
    },
  };
}

async function generateRevenueReport(stripe: Stripe, startTimestamp: number, endTimestamp: number, groupBy: string) {
  const charges = await stripe.charges.list({ 
    created: { gte: startTimestamp, lte: endTimestamp }, 
    limit: 100,
  });
  
  const successfulCharges = charges.data.filter(c => c.status === 'succeeded');
  
  // Group by time period
  const grouped: Record<string, { revenue: number; count: number; refunds: number }> = {};
  
  successfulCharges.forEach(charge => {
    const date = new Date(charge.created * 1000);
    let key: string;
    
    switch (groupBy) {
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      default: // day
        key = date.toISOString().split('T')[0];
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
  const growth = periods.length >= 2 ? {
    revenueChange: periods[periods.length - 1].revenue - periods[periods.length - 2].revenue,
    revenueChangePercent: periods[periods.length - 2].revenue > 0
      ? (((periods[periods.length - 1].revenue - periods[periods.length - 2].revenue) / periods[periods.length - 2].revenue) * 100).toFixed(1) + '%'
      : 'N/A',
  } : null;
  
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

async function generateSubscriptionReport(stripe: Stripe, startTimestamp: number, endTimestamp: number) {
  const subscriptions = await stripe.subscriptions.list({
    created: { gte: startTimestamp, lte: endTimestamp },
    limit: 100,
    expand: ['data.items.data.price'],
  });
  
  const statusBreakdown: Record<string, number> = {};
  let totalMRR = 0;
  
  subscriptions.data.forEach(sub => {
    statusBreakdown[sub.status] = (statusBreakdown[sub.status] || 0) + 1;
    
    if (sub.status === 'active') {
      sub.items.data.forEach(item => {
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
    churnedCount: subscriptions.data.filter(s => s.status === 'canceled').length,
  };
}

async function generateProductReport(stripe: Stripe, startTimestamp: number, endTimestamp: number) {
  const charges = await stripe.charges.list({
    created: { gte: startTimestamp, lte: endTimestamp },
    limit: 100,
    expand: ['data.invoice'],
  });
  
  const productRevenue: Record<string, { name: string; revenue: number; count: number }> = {};
  
  charges.data
    .filter(c => c.status === 'succeeded')
    .forEach(charge => {
      // Try to extract product info from description or metadata
      const productName = charge.description || charge.metadata?.product_name || 'Other';
      
      if (!productRevenue[productName]) {
        productRevenue[productName] = { name: productName, revenue: 0, count: 0 };
      }
      productRevenue[productName].revenue += charge.amount;
      productRevenue[productName].count++;
    });
  
  const products = Object.values(productRevenue)
    .map(p => ({
      name: p.name,
      revenue: p.revenue,
      revenueFormatted: formatCurrency(p.revenue),
      transactionCount: p.count,
      averagePrice: p.count > 0 ? Math.round(p.revenue / p.count) : 0,
      averagePriceFormatted: p.count > 0 ? formatCurrency(Math.round(p.revenue / p.count)) : '$0.00',
    }))
    .sort((a, b) => b.revenue - a.revenue);
  
  const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
  
  return {
    products: products.map(p => ({
      ...p,
      revenueShare: totalRevenue > 0 ? ((p.revenue / totalRevenue) * 100).toFixed(1) + '%' : '0%',
    })),
    totalRevenue,
    totalRevenueFormatted: formatCurrency(totalRevenue),
    productCount: products.length,
  };
}

async function generateCustomerReport(stripe: Stripe, startTimestamp: number, endTimestamp: number) {
  const [newCustomers, charges] = await Promise.all([
    stripe.customers.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
    stripe.charges.list({ created: { gte: startTimestamp, lte: endTimestamp }, limit: 100 }),
  ]);
  
  const successfulCharges = charges.data.filter(c => c.status === 'succeeded');
  const customerSpending: Record<string, number> = {};
  
  successfulCharges.forEach(charge => {
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
    'Under $100': spendingValues.filter(s => s < 10000).length,
    '$100-$500': spendingValues.filter(s => s >= 10000 && s < 50000).length,
    '$500-$1000': spendingValues.filter(s => s >= 50000 && s < 100000).length,
    'Over $1000': spendingValues.filter(s => s >= 100000).length,
  };
  
  return {
    newCustomers: newCustomers.data.length,
    activeCustomers: uniqueCustomers,
    totalSpending,
    totalSpendingFormatted: formatCurrency(totalSpending),
    averageSpending: uniqueCustomers > 0 ? Math.round(totalSpending / uniqueCustomers) : 0,
    averageSpendingFormatted: uniqueCustomers > 0 ? formatCurrency(Math.round(totalSpending / uniqueCustomers)) : '$0.00',
    spendingDistribution: Object.entries(spendingBuckets).map(([bucket, count]) => ({
      bucket,
      count,
      percentage: uniqueCustomers > 0 ? ((count / uniqueCustomers) * 100).toFixed(1) + '%' : '0%',
    })),
    topCustomers: Object.entries(customerSpending)
      .map(([id, spending]) => ({ customerId: id, spending, spendingFormatted: formatCurrency(spending) }))
      .sort((a, b) => b.spending - a.spending)
      .slice(0, 10),
  };
}

function calculateMRR(subscriptions: Stripe.Subscription[]): number {
  return subscriptions.reduce((mrr, sub) => {
    return mrr + sub.items.data.reduce((itemMrr, item) => {
      const price = item.price;
      if (!price.unit_amount) return itemMrr;
      
      let monthlyAmount = price.unit_amount;
      if (price.recurring?.interval === 'year') {
        monthlyAmount = monthlyAmount / 12;
      } else if (price.recurring?.interval === 'week') {
        monthlyAmount = monthlyAmount * 4;
      }
      
      return itemMrr + (monthlyAmount * (item.quantity || 1));
    }, 0);
  }, 0);
}

function getDefaultStartDate(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString();
}
