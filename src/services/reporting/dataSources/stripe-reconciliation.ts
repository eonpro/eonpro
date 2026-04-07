import { getStripeForClinic, getStripeForPlatform, withConnectedAccount } from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'stripe-reconciliation',
  name: 'Stripe Reconciliation',
  description: 'Payment reconciliation report comparing charges, refunds, fees, and payouts for accounting',
  icon: 'Scale',
  columns: [
    { id: 'category', label: 'Category', type: 'string', groupable: true },
    { id: 'description', label: 'Description', type: 'string' },
    { id: 'amount', label: 'Amount', type: 'currency', sortable: true },
    { id: 'count', label: 'Count', type: 'number', sortable: true },
    { id: 'date', label: 'Date', type: 'date', sortable: true },
    { id: 'referenceId', label: 'Reference ID', type: 'string' },
  ],
  filters: [
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
    { field: 'category', label: 'Category', type: 'multi_select', options: [
      { value: 'charges', label: 'Charges' }, { value: 'refunds', label: 'Refunds' },
      { value: 'fees', label: 'Fees' }, { value: 'payouts', label: 'Payouts' },
      { value: 'balance', label: 'Balance' },
    ]},
  ],
  groupByOptions: [
    { id: 'category', label: 'By Category' },
  ],
};

async function fetchAllCharges(stripe: Stripe, params: Stripe.ChargeListParams, connectedOpts?: object): Promise<Stripe.Charge[]> {
  const all: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && all.length < 2000) {
    const listParams: any = {
      ...params,
      ...(connectedOpts || {}),
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    };
    const response = await stripe.charges.list(listParams);
    all.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  return all;
}

async function fetchAllRefunds(stripe: Stripe, params: Stripe.RefundListParams, connectedOpts?: object): Promise<Stripe.Refund[]> {
  const all: Stripe.Refund[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && all.length < 1000) {
    const listParams: any = {
      ...params,
      ...(connectedOpts || {}),
      limit: 100,
      ...(startingAfter && { starting_after: startingAfter }),
    };
    const response = await stripe.refunds.list(listParams);
    all.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  return all;
}

async function execute(config: ReportConfig): Promise<ReportResult> {
  const context = config.clinicId
    ? await getStripeForClinic(config.clinicId)
    : getStripeForPlatform();

  const { stripe } = context;
  const connectedOpts = context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : {};

  if (!config.dateRange) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    config.dateRange = {
      startDate: thirtyDaysAgo.toISOString().slice(0, 10),
      endDate: new Date().toISOString().slice(0, 10),
    };
  }

  const startTs = Math.floor(new Date(config.dateRange.startDate).getTime() / 1000);
  const endTs = Math.floor(new Date(config.dateRange.endDate + 'T23:59:59Z').getTime() / 1000);
  const createdFilter = { gte: startTs, lte: endTs };

  const [balance, balanceTransactions, payouts, charges, refunds] = await Promise.all([
    stripe.balance.retrieve({}, context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : undefined),
    stripe.balanceTransactions.list({
      created: createdFilter, limit: 100,
      ...(context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : {}),
    } as any),
    stripe.payouts.list({
      created: createdFilter, limit: 100,
      ...(context.stripeAccountId ? { stripeAccount: context.stripeAccountId } : {}),
    } as any),
    fetchAllCharges(stripe, { created: createdFilter }, connectedOpts),
    fetchAllRefunds(stripe, { created: createdFilter }, connectedOpts),
  ]);

  const successfulCharges = charges.filter((c) => c.status === 'succeeded');
  const totalCharges = successfulCharges.reduce((sum, c) => sum + c.amount, 0);
  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);
  const totalFees = balanceTransactions.data.reduce((sum, tx) => sum + tx.fee, 0);
  const paidPayouts = payouts.data.filter((p) => p.status === 'paid');
  const totalPayouts = paidPayouts.reduce((sum, p) => sum + p.amount, 0);

  const expectedBalance = totalCharges - totalRefunds - totalFees - totalPayouts;
  const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0);
  const pendingBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0);
  const actualBalance = availableBalance + pendingBalance;

  const feeBreakdown: Record<string, number> = {};
  balanceTransactions.data.forEach((tx) => {
    tx.fee_details?.forEach((fee) => {
      feeBreakdown[fee.type] = (feeBreakdown[fee.type] || 0) + fee.amount;
    });
  });

  const rows: ReportRow[] = [
    { id: 'charges', category: 'charges', description: 'Total Charges (Succeeded)', amount: totalCharges, count: successfulCharges.length, date: '', referenceId: '' },
    { id: 'refunds', category: 'refunds', description: 'Total Refunds', amount: -totalRefunds, count: refunds.length, date: '', referenceId: '' },
    { id: 'fees', category: 'fees', description: 'Total Stripe Fees', amount: -totalFees, count: balanceTransactions.data.length, date: '', referenceId: '' },
    ...Object.entries(feeBreakdown).map(([type, amount]) => ({
      id: `fee_${type}`, category: 'fees', description: `Fee: ${type}`, amount: -amount, count: 0, date: '', referenceId: '',
    })),
    { id: 'payouts', category: 'payouts', description: 'Total Payouts (Paid)', amount: -totalPayouts, count: paidPayouts.length, date: '', referenceId: '' },
    ...paidPayouts.map((p) => ({
      id: p.id, category: 'payouts', description: p.description || 'Payout', amount: -p.amount, count: 1,
      date: new Date(p.created * 1000).toISOString(), referenceId: p.id,
    })),
    { id: 'balance_expected', category: 'balance', description: 'Expected Balance', amount: expectedBalance, count: 0, date: '', referenceId: '' },
    { id: 'balance_actual', category: 'balance', description: 'Actual Balance (Available + Pending)', amount: actualBalance, count: 0, date: '', referenceId: '' },
    { id: 'balance_available', category: 'balance', description: 'Available Balance', amount: availableBalance, count: 0, date: '', referenceId: '' },
    { id: 'balance_pending', category: 'balance', description: 'Pending Balance', amount: pendingBalance, count: 0, date: '', referenceId: '' },
    { id: 'balance_diff', category: 'balance', description: 'Reconciliation Difference', amount: actualBalance - expectedBalance, count: 0, date: '', referenceId: '' },
  ];

  const categoryFilters = config.filters.filter((f) => f.field === 'category').map((f) => f.value).flat();
  const filteredRows = categoryFilters.length > 0
    ? rows.filter((r) => categoryFilters.includes(r.category as string))
    : rows;

  const summary: Record<string, number> = {
    totalCharges,
    totalRefunds,
    totalFees,
    totalPayouts,
    expectedBalance,
    actualBalance,
    reconciliationDifference: actualBalance - expectedBalance,
    isReconciled: Math.abs(actualBalance - expectedBalance) < 100 ? 1 : 0,
  };

  return {
    rows: filteredRows,
    summary,
    meta: {
      totalRows: filteredRows.length,
      executedAt: new Date().toISOString(),
      dataSource: 'stripe-reconciliation',
      dateRange: config.dateRange,
      groupBy: config.groupBy,
    },
  };
}

export const stripeReconciliationDataSource: DataSourceAdapter = { definition, execute };
