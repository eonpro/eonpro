import { getStripeForClinic, getStripeForPlatform, withConnectedAccount } from '@/lib/stripe/connect';
import { logger } from '@/lib/logger';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'stripe-balance',
  name: 'Stripe Balance & Transactions',
  description: 'Balance transactions from Stripe including charges, fees, refunds, and transfers',
  icon: 'Wallet',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'type', label: 'Type', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'description', label: 'Description', type: 'string' },
    { id: 'gross', label: 'Gross', type: 'currency', sortable: true },
    { id: 'fee', label: 'Fee', type: 'currency', sortable: true },
    { id: 'net', label: 'Net', type: 'currency', sortable: true },
    { id: 'status', label: 'Status', type: 'string', filterable: true, groupable: true },
    { id: 'sourceId', label: 'Source ID', type: 'string' },
  ],
  filters: [
    { field: 'type', label: 'Transaction Type', type: 'multi_select', options: [
      { value: 'charge', label: 'Charge' }, { value: 'refund', label: 'Refund' },
      { value: 'payout', label: 'Payout' }, { value: 'transfer', label: 'Transfer' },
      { value: 'adjustment', label: 'Adjustment' }, { value: 'stripe_fee', label: 'Stripe Fee' },
    ]},
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'type', label: 'By Type' },
    { id: 'month', label: 'By Month' },
    { id: 'week', label: 'By Week' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const context = config.clinicId
    ? await getStripeForClinic(config.clinicId)
    : getStripeForPlatform();

  const { stripe } = context;

  const params: Record<string, any> = { limit: 100 };
  if (config.dateRange) {
    params.created = {
      gte: Math.floor(new Date(config.dateRange.startDate).getTime() / 1000),
      lte: Math.floor(new Date(config.dateRange.endDate + 'T23:59:59Z').getTime() / 1000),
    };
  }

  const typeFilters = config.filters
    .filter((f) => f.field === 'type')
    .map((f) => f.value)
    .flat();
  if (typeFilters.length === 1) {
    params.type = typeFilters[0];
  }

  const allTxns: ReportRow[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore && allTxns.length < (config.limit || 1000)) {
    const listParams = {
      ...params,
      ...(startingAfter && { starting_after: startingAfter }),
    };

    const response = await stripe.balanceTransactions.list(
      context.stripeAccountId
        ? withConnectedAccount(context, listParams)
        : listParams
    );

    for (const tx of response.data) {
      if (typeFilters.length > 1 && !typeFilters.includes(tx.type)) continue;

      allTxns.push({
        id: tx.id,
        date: new Date(tx.created * 1000).toISOString(),
        type: tx.type,
        description: tx.description || '',
        gross: tx.amount,
        fee: tx.fee,
        net: tx.net,
        status: tx.status,
        sourceId: typeof tx.source === 'string' ? tx.source : tx.source?.id || '',
        month: new Date(tx.created * 1000).toISOString().slice(0, 7),
        week: getWeekLabel(new Date(tx.created * 1000)),
      });
    }

    hasMore = response.has_more;
    if (response.data.length > 0) {
      startingAfter = response.data[response.data.length - 1].id;
    }
    if (allTxns.length >= (config.limit || 1000)) break;
  }

  const rows = config.groupBy ? groupRows(allTxns, config.groupBy) : allTxns;

  const summary = {
    totalGross: allTxns.reduce((a, r) => a + (r.gross as number), 0),
    totalFees: allTxns.reduce((a, r) => a + (r.fee as number), 0),
    totalNet: allTxns.reduce((a, r) => a + (r.net as number), 0),
    transactionCount: allTxns.length,
  };

  return {
    rows,
    summary,
    meta: {
      totalRows: rows.length,
      executedAt: new Date().toISOString(),
      dataSource: 'stripe-balance',
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
      groups.set(key, { [groupBy]: key, count: 0, totalGross: 0, totalFees: 0, totalNet: 0 });
    }
    const g = groups.get(key)!;
    g.count++;
    g.totalGross += row.gross || 0;
    g.totalFees += row.fee || 0;
    g.totalNet += row.net || 0;
  }
  return Array.from(groups.values());
}

export const stripeBalanceDataSource: DataSourceAdapter = { definition, execute };
