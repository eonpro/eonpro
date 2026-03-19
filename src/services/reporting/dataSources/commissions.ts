import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'commissions',
  name: 'Sales Commissions',
  description: 'Sales rep and manager override commission data for payroll',
  icon: 'BadgeDollarSign',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'salesRepName', label: 'Sales Rep', type: 'string', sortable: true, groupable: true },
    { id: 'salesRepEmail', label: 'Email', type: 'string' },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'revenue', label: 'Revenue', type: 'currency', sortable: true },
    { id: 'commission', label: 'Commission', type: 'currency', sortable: true },
    { id: 'baseCommission', label: 'Base Commission', type: 'currency' },
    { id: 'volumeTierBonus', label: 'Volume Tier Bonus', type: 'currency' },
    { id: 'productBonus', label: 'Product Bonus', type: 'currency' },
    { id: 'multiItemBonus', label: 'Multi-Item Bonus', type: 'currency' },
    { id: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'isRecurring', label: 'Recurring', type: 'boolean', filterable: true, groupable: true },
    { id: 'isManual', label: 'Manual', type: 'boolean', filterable: true },
    { id: 'planName', label: 'Plan', type: 'string', groupable: true },
    { id: 'type', label: 'Type', type: 'string', groupable: true },
  ],
  filters: [
    { field: 'status', label: 'Status', type: 'multi_select', options: [
      { value: 'PENDING', label: 'Pending' }, { value: 'APPROVED', label: 'Approved' },
      { value: 'PAID', label: 'Paid' }, { value: 'REVERSED', label: 'Reversed' },
    ]},
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'salesRepId', label: 'Sales Rep', type: 'select' },
    { field: 'isRecurring', label: 'New vs Recurring', type: 'select', options: [
      { value: 'false', label: 'New Sale' }, { value: 'true', label: 'Recurring' },
    ]},
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'salesRepName', label: 'By Sales Rep' },
    { id: 'clinicName', label: 'By Clinic' },
    { id: 'status', label: 'By Status' },
    { id: 'isRecurring', label: 'New vs Recurring' },
    { id: 'planName', label: 'By Plan' },
    { id: 'month', label: 'By Month' },
    { id: 'week', label: 'By Week' },
  ],
};

function buildWhere(config: ReportConfig): Record<string, any> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    const endDateStr = config.dateRange.endDate;
    const endDateNormalized = endDateStr.includes('T')
      ? new Date(endDateStr)
      : new Date(endDateStr + 'T23:59:59.999Z');
    where.occurredAt = {
      gte: new Date(config.dateRange.startDate),
      lte: endDateNormalized,
    };
  }
  for (const f of config.filters) {
    if (f.field === 'status' && f.operator === 'in') where.status = { in: f.value };
    if (f.field === 'status' && f.operator === 'eq') where.status = f.value;
    if (f.field === 'salesRepId' && f.operator === 'eq') {
      const repId = Number(f.value);
      if (!Number.isNaN(repId)) where.salesRepId = repId;
    }
    if (f.field === 'isRecurring' && f.operator === 'eq') where.isRecurring = f.value === 'true';
  }
  if (!where.status) where.status = { in: ['PENDING', 'APPROVED', 'PAID'] };
  return where;
}

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where = buildWhere(config);
  const events = await prisma.salesRepCommissionEvent.findMany({
    where,
    orderBy: { [config.sortBy === 'commission' ? 'commissionAmountCents' : config.sortBy === 'revenue' ? 'eventAmountCents' : 'occurredAt']: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: {
      salesRep: { select: { id: true, firstName: true, lastName: true, email: true } },
      clinic: { select: { name: true } },
    },
  });

  const rows: ReportRow[] = events.map((e) => ({
    id: e.id,
    date: e.occurredAt.toISOString(),
    salesRepName: `${e.salesRep?.firstName || ''} ${e.salesRep?.lastName || ''}`.trim() || e.salesRep?.email || '',
    salesRepEmail: e.salesRep?.email || '',
    clinicName: e.clinic?.name || '',
    revenue: e.eventAmountCents,
    commission: e.commissionAmountCents,
    baseCommission: e.baseCommissionCents,
    volumeTierBonus: e.volumeTierBonusCents,
    productBonus: e.productBonusCents,
    multiItemBonus: e.multiItemBonusCents,
    status: e.status,
    isRecurring: e.isRecurring,
    isManual: e.isManual,
    planName: (e.metadata as any)?.planName || '',
    type: e.isManual ? 'Manual' : e.isRecurring ? 'Recurring' : 'New Sale',
    month: e.occurredAt.toISOString().slice(0, 7),
    week: e.occurredAt.toISOString().slice(0, 10),
  }));

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;

  const summary = {
    totalRevenue: events.reduce((a, e) => a + e.eventAmountCents, 0),
    totalCommission: events.reduce((a, e) => a + e.commissionAmountCents, 0),
    totalEvents: events.length,
    newSaleCommission: events.filter((e) => !e.isRecurring).reduce((a, e) => a + e.commissionAmountCents, 0),
    recurringCommission: events.filter((e) => e.isRecurring).reduce((a, e) => a + e.commissionAmountCents, 0),
  };

  return { rows: grouped, summary, meta: { totalRows: grouped.length, executedAt: new Date().toISOString(), dataSource: 'commissions', dateRange: config.dateRange, groupBy: config.groupBy } };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) {
      groups.set(key, { [groupBy]: key, count: 0, totalRevenue: 0, totalCommission: 0 });
    }
    const g = groups.get(key)!;
    g.count++;
    g.totalRevenue += row.revenue || 0;
    g.totalCommission += row.commission || 0;
  }
  return Array.from(groups.values());
}

export const commissionsDataSource: DataSourceAdapter = { definition, execute };
