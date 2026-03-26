import { getStripeForClinic, getStripeForPlatform, withConnectedAccount } from '@/lib/stripe/connect';
import type Stripe from 'stripe';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'stripe-payouts',
  name: 'Stripe Payouts',
  description: 'Payout history showing bank deposits with status and timing',
  icon: 'Landmark',
  columns: [
    { id: 'date', label: 'Created', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'payoutId', label: 'Payout ID', type: 'string' },
    { id: 'amount', label: 'Amount', type: 'currency', sortable: true },
    { id: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'arrivalDate', label: 'Arrival Date', type: 'date', sortable: true },
    { id: 'method', label: 'Method', type: 'string', groupable: true },
    { id: 'description', label: 'Description', type: 'string' },
    { id: 'destination', label: 'Destination', type: 'string' },
  ],
  filters: [
    { field: 'status', label: 'Status', type: 'multi_select', options: [
      { value: 'paid', label: 'Paid' }, { value: 'pending', label: 'Pending' },
      { value: 'in_transit', label: 'In Transit' }, { value: 'canceled', label: 'Canceled' },
      { value: 'failed', label: 'Failed' },
    ]},
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'status', label: 'By Status' },
    { id: 'method', label: 'By Method' },
    { id: 'month', label: 'By Month' },
    { id: 'week', label: 'By Week' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const context = config.clinicId
    ? await getStripeForClinic(config.clinicId)
    : getStripeForPlatform();

  const { stripe } = context;
  const limit = config.limit || 500;

  const listParams: Stripe.PayoutListParams = { limit: 100 };
  if (config.dateRange) {
    listParams.created = {
      gte: Math.floor(new Date(config.dateRange.startDate).getTime() / 1000),
      lte: Math.floor(new Date(config.dateRange.endDate + 'T23:59:59Z').getTime() / 1000),
    };
  }

  const statusFilters = config.filters
    .filter((f) => f.field === 'status')
    .map((f) => f.value)
    .flat();
  if (statusFilters.length === 1) {
    listParams.status = statusFilters[0] as Stripe.PayoutListParams['status'];
  }

  const allRows: ReportRow[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && allRows.length < limit) {
    const params = {
      ...listParams,
      ...(startingAfter && { starting_after: startingAfter }),
    };

    const response = await stripe.payouts.list(
      context.stripeAccountId ? withConnectedAccount(context, params) : params
    );

    for (const payout of response.data) {
      if (statusFilters.length > 1 && !statusFilters.includes(payout.status)) continue;

      const dest = payout.destination;
      let destinationLabel = '';
      if (typeof dest === 'object' && dest !== null && 'last4' in dest) {
        destinationLabel = `****${(dest as any).last4}`;
      }

      allRows.push({
        id: payout.id,
        date: new Date(payout.created * 1000).toISOString(),
        payoutId: payout.id,
        amount: payout.amount,
        status: payout.status,
        arrivalDate: payout.arrival_date ? new Date(payout.arrival_date * 1000).toISOString() : '',
        method: payout.type || 'bank_account',
        description: payout.description || '',
        destination: destinationLabel,
        month: new Date(payout.created * 1000).toISOString().slice(0, 7),
        week: getWeekLabel(new Date(payout.created * 1000)),
      });
    }

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
  }

  const rows = config.groupBy ? groupRows(allRows, config.groupBy) : allRows;

  const paid = allRows.filter((r) => r.status === 'paid');
  const summary = {
    totalPaid: paid.reduce((a, r) => a + (r.amount as number), 0),
    totalPending: allRows.filter((r) => r.status === 'pending').reduce((a, r) => a + (r.amount as number), 0),
    payoutCount: allRows.length,
    paidCount: paid.length,
    avgPayoutAmount: paid.length > 0 ? Math.round(paid.reduce((a, r) => a + (r.amount as number), 0) / paid.length) : 0,
  };

  return {
    rows,
    summary,
    meta: {
      totalRows: rows.length,
      executedAt: new Date().toISOString(),
      dataSource: 'stripe-payouts',
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
      groups.set(key, { [groupBy]: key, count: 0, totalAmount: 0 });
    }
    const g = groups.get(key)!;
    g.count++;
    g.totalAmount += row.amount || 0;
  }
  return Array.from(groups.values());
}

export const stripePayoutsDataSource: DataSourceAdapter = { definition, execute };
