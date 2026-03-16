import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'affiliates',
  name: 'Affiliate Commissions',
  description: 'Affiliate commission events, performance, and payouts',
  icon: 'Link',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'affiliateId', label: 'Affiliate ID', type: 'number', sortable: true, groupable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'revenue', label: 'Revenue', type: 'currency', sortable: true },
    { id: 'commission', label: 'Commission', type: 'currency', sortable: true },
    { id: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'isRecurring', label: 'Recurring', type: 'boolean', filterable: true, groupable: true },
    { id: 'recurringMonth', label: 'Month #', type: 'number' },
  ],
  filters: [
    { field: 'status', label: 'Status', type: 'multi_select', options: [
      { value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' },
      { value: 'PAID', label: 'Paid' }, { value: 'REVERSED', label: 'Reversed' },
    ]},
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'affiliateId', label: 'By Affiliate' }, { id: 'clinicName', label: 'By Clinic' },
    { id: 'status', label: 'By Status' }, { id: 'isRecurring', label: 'New vs Recurring' },
    { id: 'month', label: 'By Month' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.occurredAt = { gte: new Date(config.dateRange.startDate), lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z') };
  }
  for (const f of config.filters) {
    if (f.field === 'status' && f.operator === 'in') where.status = { in: f.value };
  }
  if (!where.status) where.status = { in: ['PENDING', 'APPROVED', 'PAID'] };

  const events = await prisma.affiliateCommissionEvent.findMany({
    where,
    orderBy: { occurredAt: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: { clinic: { select: { name: true } } },
  });

  const rows: ReportRow[] = events.map((e) => ({
    id: e.id, date: e.occurredAt.toISOString(), affiliateId: e.affiliateId,
    clinicName: e.clinic?.name || '', revenue: e.eventAmountCents,
    commission: e.commissionAmountCents, status: e.status,
    isRecurring: e.isRecurring, recurringMonth: e.recurringMonth,
    month: e.occurredAt.toISOString().slice(0, 7),
  }));

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;
  const summary = {
    totalRevenue: events.reduce((a, e) => a + e.eventAmountCents, 0),
    totalCommission: events.reduce((a, e) => a + e.commissionAmountCents, 0),
    totalEvents: events.length,
  };

  return { rows: grouped, summary, meta: { totalRows: grouped.length, executedAt: new Date().toISOString(), dataSource: 'affiliates', dateRange: config.dateRange, groupBy: config.groupBy } };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, { [groupBy]: key, count: 0, totalRevenue: 0, totalCommission: 0 });
    const g = groups.get(key)!;
    g.count++;
    g.totalRevenue += row.revenue || 0;
    g.totalCommission += row.commission || 0;
  }
  return Array.from(groups.values());
}

export const affiliatesDataSource: DataSourceAdapter = { definition, execute };
