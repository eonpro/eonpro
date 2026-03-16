import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'revenue',
  name: 'Revenue & Payments',
  description: 'Payment and invoice data across all clinics',
  icon: 'DollarSign',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'patientId', label: 'Patient ID', type: 'number', sortable: true, filterable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'amount', label: 'Amount', type: 'currency', sortable: true },
    { id: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'paymentMethod', label: 'Payment Method', type: 'string', groupable: true },
    { id: 'refundedAmount', label: 'Refunded', type: 'currency', sortable: true },
    { id: 'hasSubscription', label: 'Recurring', type: 'boolean', filterable: true, groupable: true },
    { id: 'invoiceStatus', label: 'Invoice Status', type: 'string', groupable: true },
  ],
  filters: [
    { field: 'status', label: 'Payment Status', type: 'multi_select', options: [
      { value: 'SUCCEEDED', label: 'Succeeded' }, { value: 'PENDING', label: 'Pending' },
      { value: 'FAILED', label: 'Failed' }, { value: 'REFUNDED', label: 'Refunded' },
    ]},
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
    { field: 'amountRange', label: 'Amount Range', type: 'number_range' },
  ],
  groupByOptions: [
    { id: 'clinicName', label: 'By Clinic' },
    { id: 'status', label: 'By Status' },
    { id: 'paymentMethod', label: 'By Payment Method' },
    { id: 'month', label: 'By Month' },
    { id: 'week', label: 'By Week' },
    { id: 'hasSubscription', label: 'Recurring vs One-Time' },
  ],
};

function buildWhere(config: ReportConfig): Record<string, any> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.createdAt = {
      gte: new Date(config.dateRange.startDate),
      lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z'),
    };
  }
  for (const f of config.filters) {
    if (f.field === 'status' && f.operator === 'in') where.status = { in: f.value };
    if (f.field === 'status' && f.operator === 'eq') where.status = f.value;
  }
  return where;
}

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where = buildWhere(config);
  const payments = await prisma.payment.findMany({
    where,
    orderBy: { [config.sortBy || 'createdAt']: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: {
      clinic: { select: { name: true } },
    },
  });

  const rows: ReportRow[] = payments.map((p) => ({
    id: p.id,
    date: p.createdAt.toISOString(),
    patientId: p.patientId,
    clinicName: p.clinic?.name || '',
    amount: p.amount,
    status: p.status,
    paymentMethod: p.paymentMethod || 'Unknown',
    refundedAmount: p.refundedAmount || 0,
    hasSubscription: !!p.subscriptionId,
    month: p.createdAt.toISOString().slice(0, 7),
    week: getWeekLabel(p.createdAt),
  }));

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;

  const summary = {
    totalRevenue: payments.reduce((a, p) => a + (p.status === 'SUCCEEDED' ? p.amount : 0), 0),
    totalPayments: payments.length,
    totalRefunded: payments.reduce((a, p) => a + (p.refundedAmount || 0), 0),
    avgPayment: payments.length > 0 ? Math.round(payments.reduce((a, p) => a + p.amount, 0) / payments.length) : 0,
  };

  return {
    rows: grouped,
    summary,
    meta: {
      totalRows: grouped.length,
      executedAt: new Date().toISOString(),
      dataSource: 'revenue',
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
      groups.set(key, { [groupBy]: key, count: 0, totalAmount: 0, totalRefunded: 0 });
    }
    const g = groups.get(key)!;
    g.count++;
    g.totalAmount += row.amount || 0;
    g.totalRefunded += row.refundedAmount || 0;
  }
  return Array.from(groups.values());
}

export const revenueDataSource: DataSourceAdapter = { definition, execute };
