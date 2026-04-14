import {
  getStripeForClinic,
  getStripeForPlatform,
  withConnectedAccount,
} from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import type {
  DataSourceAdapter,
  ReportConfig,
  ReportResult,
  DataSourceDef,
  ReportRow,
} from '../types';

const definition: DataSourceDef = {
  id: 'stripe-transactions',
  name: 'Stripe Charges & Refunds',
  description:
    'Detailed charge and refund transactions with customer, payment method, and fee data',
  icon: 'CreditCard',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'chargeId', label: 'Charge ID', type: 'string' },
    { id: 'amount', label: 'Amount', type: 'currency', sortable: true },
    { id: 'fees', label: 'Fees', type: 'currency', sortable: true },
    { id: 'net', label: 'Net', type: 'currency', sortable: true },
    {
      id: 'status',
      label: 'Status',
      type: 'string',
      sortable: true,
      filterable: true,
      groupable: true,
    },
    { id: 'customerEmail', label: 'Customer Email', type: 'string' },
    { id: 'paymentMethod', label: 'Payment Method', type: 'string', groupable: true },
    { id: 'description', label: 'Description', type: 'string' },
    { id: 'refundedAmount', label: 'Refunded', type: 'currency', sortable: true },
    { id: 'disputed', label: 'Disputed', type: 'boolean', filterable: true },
  ],
  filters: [
    {
      field: 'status',
      label: 'Status',
      type: 'multi_select',
      options: [
        { value: 'succeeded', label: 'Succeeded' },
        { value: 'pending', label: 'Pending' },
        { value: 'failed', label: 'Failed' },
      ],
    },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
    { field: 'amountRange', label: 'Amount Range', type: 'number_range' },
  ],
  groupByOptions: [
    { id: 'status', label: 'By Status' },
    { id: 'paymentMethod', label: 'By Payment Method' },
    { id: 'month', label: 'By Month' },
    { id: 'week', label: 'By Week' },
  ],
};

async function fetchAllCharges(
  stripe: Stripe,
  params: Stripe.ChargeListParams,
  limit: number
): Promise<Stripe.Charge[]> {
  const all: Stripe.Charge[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && all.length < limit) {
    const response = await stripe.charges.list({
      ...params,
      limit: 100,
      expand: ['data.balance_transaction'],
      ...(startingAfter && { starting_after: startingAfter }),
    });
    all.push(...response.data);
    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }
  return all.slice(0, limit);
}

async function execute(config: ReportConfig): Promise<ReportResult> {
  const context = config.clinicId
    ? await getStripeForClinic(config.clinicId)
    : getStripeForPlatform();

  const { stripe } = context;
  const limit = config.limit || 1000;

  const chargeParams: Stripe.ChargeListParams = {};
  if (config.dateRange) {
    chargeParams.created = {
      gte: Math.floor(new Date(config.dateRange.startDate).getTime() / 1000),
      lte: Math.floor(new Date(config.dateRange.endDate + 'T23:59:59Z').getTime() / 1000),
    };
  }

  if (context.stripeAccountId) {
    (chargeParams as any).stripeAccount = context.stripeAccountId;
  }

  const charges = await fetchAllCharges(stripe, chargeParams, limit);

  const statusFilters = config.filters
    .filter((f) => f.field === 'status')
    .map((f) => f.value)
    .flat();

  const allRows: ReportRow[] = [];
  for (const charge of charges) {
    if (statusFilters.length > 0 && !statusFilters.includes(charge.status)) continue;

    const balanceTx = charge.balance_transaction as Stripe.BalanceTransaction | null;

    allRows.push({
      id: charge.id,
      date: new Date(charge.created * 1000).toISOString(),
      chargeId: charge.id,
      amount: charge.amount,
      fees: balanceTx?.fee || 0,
      net: balanceTx?.net || charge.amount,
      status: charge.status,
      customerEmail: charge.billing_details?.email || charge.receipt_email || '',
      paymentMethod: charge.payment_method_details?.type || 'unknown',
      description: charge.description || '',
      refundedAmount: charge.amount_refunded || 0,
      disputed: charge.disputed,
      month: new Date(charge.created * 1000).toISOString().slice(0, 7),
      week: getWeekLabel(new Date(charge.created * 1000)),
    });
  }

  const rows = config.groupBy ? groupRows(allRows, config.groupBy) : allRows;

  const succeeded = allRows.filter((r) => r.status === 'succeeded');
  const summary = {
    totalAmount: succeeded.reduce((a, r) => a + (r.amount as number), 0),
    totalFees: succeeded.reduce((a, r) => a + (r.fees as number), 0),
    totalNet: succeeded.reduce((a, r) => a + (r.net as number), 0),
    totalRefunded: allRows.reduce((a, r) => a + (r.refundedAmount as number), 0),
    chargeCount: allRows.length,
    succeededCount: succeeded.length,
    failedCount: allRows.filter((r) => r.status === 'failed').length,
  };

  return {
    rows,
    summary,
    meta: {
      totalRows: rows.length,
      executedAt: new Date().toISOString(),
      dataSource: 'stripe-transactions',
      dateRange: config.dateRange,
      groupBy: config.groupBy,
    },
  };
}

function getWeekLabel(d: Date): string {
  const start = new Date(d);
  start.setDate(start.getDate() - start.getDay());
  return start.toISOString().slice(0, 10);
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) {
      groups.set(key, {
        [groupBy]: key,
        count: 0,
        totalAmount: 0,
        totalFees: 0,
        totalNet: 0,
        totalRefunded: 0,
      });
    }
    const g = groups.get(key)!;
    g.count++;
    g.totalAmount += row.amount || 0;
    g.totalFees += row.fees || 0;
    g.totalNet += row.net || 0;
    g.totalRefunded += row.refundedAmount || 0;
  }
  return Array.from(groups.values());
}

export const stripeTransactionsDataSource: DataSourceAdapter = { definition, execute };
