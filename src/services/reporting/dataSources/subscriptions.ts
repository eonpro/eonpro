import { prisma } from '@/lib/db';
import type {
  DataSourceAdapter,
  ReportConfig,
  ReportResult,
  DataSourceDef,
  ReportRow,
} from '../types';

const definition: DataSourceDef = {
  id: 'subscriptions',
  name: 'Subscriptions',
  description: 'Active subscriptions, churn, MRR, and billing cycles',
  icon: 'Repeat',
  columns: [
    {
      id: 'date',
      label: 'Start Date',
      type: 'date',
      sortable: true,
      filterable: true,
      groupable: true,
    },
    { id: 'patientId', label: 'Patient ID', type: 'number', sortable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    {
      id: 'status',
      label: 'Status',
      type: 'string',
      sortable: true,
      filterable: true,
      groupable: true,
    },
    { id: 'amount', label: 'Amount', type: 'currency', sortable: true },
    { id: 'interval', label: 'Interval', type: 'string', groupable: true },
    { id: 'currentPeriodEnd', label: 'Period End', type: 'date' },
    { id: 'canceledAt', label: 'Canceled At', type: 'date' },
    { id: 'failedAttempts', label: 'Failed Attempts', type: 'number', sortable: true },
    { id: 'daysSinceStart', label: 'Age (Days)', type: 'number', sortable: true },
  ],
  filters: [
    {
      field: 'status',
      label: 'Status',
      type: 'multi_select',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'PAUSED', label: 'Paused' },
        { value: 'CANCELED', label: 'Canceled' },
        { value: 'PAST_DUE', label: 'Past Due' },
        { value: 'EXPIRED', label: 'Expired' },
      ],
    },
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'clinicName', label: 'By Clinic' },
    { id: 'status', label: 'By Status' },
    { id: 'interval', label: 'By Interval' },
    { id: 'month', label: 'By Start Month' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.startDate = {
      gte: new Date(config.dateRange.startDate),
      lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z'),
    };
  }
  for (const f of config.filters) {
    if (f.field === 'status' && f.operator === 'in') where.status = { in: f.value };
  }

  const subs = await prisma.subscription.findMany({
    where,
    orderBy: { startDate: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: { clinic: { select: { name: true } } },
  });

  const now = Date.now();
  const rows: ReportRow[] = subs.map((s) => ({
    id: s.id,
    date: s.startDate.toISOString(),
    patientId: s.patientId,
    clinicName: s.clinic?.name || '',
    status: s.status,
    amount: s.amount,
    interval: s.interval || 'month',
    currentPeriodEnd: s.currentPeriodEnd?.toISOString() || null,
    canceledAt: s.canceledAt?.toISOString() || null,
    failedAttempts: s.failedAttempts || 0,
    daysSinceStart: Math.round((now - s.startDate.getTime()) / 86_400_000),
    month: s.startDate.toISOString().slice(0, 7),
  }));

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;
  const activeSubs = subs.filter((s) => s.status === 'ACTIVE');
  const summary = {
    totalSubscriptions: subs.length,
    active: activeSubs.length,
    canceled: subs.filter((s) => s.status === 'CANCELED').length,
    pastDue: subs.filter((s) => s.status === 'PAST_DUE').length,
    mrr: activeSubs.reduce((a, s) => a + s.amount, 0),
    churnRate:
      subs.length > 0
        ? Math.round((subs.filter((s) => s.status === 'CANCELED').length / subs.length) * 10000) /
          100
        : 0,
  };

  return {
    rows: grouped,
    summary,
    meta: {
      totalRows: grouped.length,
      executedAt: new Date().toISOString(),
      dataSource: 'subscriptions',
      dateRange: config.dateRange,
      groupBy: config.groupBy,
    },
  };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, { [groupBy]: key, count: 0, totalAmount: 0, active: 0 });
    const g = groups.get(key)!;
    g.count++;
    g.totalAmount += row.amount || 0;
    if (row.status === 'ACTIVE') g.active++;
  }
  return Array.from(groups.values());
}

export const subscriptionsDataSource: DataSourceAdapter = { definition, execute };
