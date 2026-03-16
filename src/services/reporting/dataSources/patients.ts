import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'patients',
  name: 'Patient Acquisition',
  description: 'Patient intake, source attribution, and sales rep assignments',
  icon: 'Users',
  columns: [
    { id: 'date', label: 'Created Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'patientId', label: 'Patient ID', type: 'number', sortable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'source', label: 'Source', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'profileStatus', label: 'Profile Status', type: 'string', filterable: true, groupable: true },
    { id: 'refCode', label: 'Ref Code', type: 'string', groupable: true },
    { id: 'salesRepName', label: 'Sales Rep', type: 'string', groupable: true },
    { id: 'hasPayment', label: 'Has Payment', type: 'boolean', filterable: true, groupable: true },
  ],
  filters: [
    { field: 'source', label: 'Source', type: 'multi_select', options: [
      { value: 'manual', label: 'Manual' }, { value: 'webhook', label: 'Webhook' },
      { value: 'api', label: 'API' }, { value: 'referral', label: 'Referral' },
      { value: 'import', label: 'Import' }, { value: 'stripe', label: 'Stripe' },
    ]},
    { field: 'profileStatus', label: 'Status', type: 'multi_select', options: [
      { value: 'ACTIVE', label: 'Active' }, { value: 'LEAD', label: 'Lead' },
      { value: 'PENDING_COMPLETION', label: 'Pending' }, { value: 'ARCHIVED', label: 'Archived' },
    ]},
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'clinicName', label: 'By Clinic' }, { id: 'source', label: 'By Source' },
    { id: 'profileStatus', label: 'By Status' }, { id: 'salesRepName', label: 'By Sales Rep' },
    { id: 'month', label: 'By Month' }, { id: 'week', label: 'By Week' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.createdAt = { gte: new Date(config.dateRange.startDate), lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z') };
  }
  for (const f of config.filters) {
    if (f.field === 'source' && f.operator === 'in') where.source = { in: f.value };
    if (f.field === 'profileStatus' && f.operator === 'in') where.profileStatus = { in: f.value };
  }

  const patients = await prisma.patient.findMany({
    where,
    orderBy: { createdAt: config.sortDir || 'desc' },
    take: config.limit || 1000,
    select: {
      id: true, createdAt: true, clinicId: true, source: true, profileStatus: true,
      attributionRefCode: true,
      clinic: { select: { name: true } },
      salesRepAssignments: { where: { isActive: true }, select: { salesRep: { select: { firstName: true, lastName: true } } }, take: 1 },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true }, take: 1 },
    },
  });

  const rows: ReportRow[] = patients.map((p) => {
    const rep = p.salesRepAssignments[0]?.salesRep;
    return {
      id: p.id, date: p.createdAt.toISOString(), patientId: p.id,
      clinicName: p.clinic?.name || '', source: p.source || 'unknown',
      profileStatus: p.profileStatus || 'ACTIVE',
      refCode: p.attributionRefCode || '',
      salesRepName: rep ? `${rep.firstName || ''} ${rep.lastName || ''}`.trim() : '',
      hasPayment: p.payments.length > 0,
      month: p.createdAt.toISOString().slice(0, 7),
      week: p.createdAt.toISOString().slice(0, 10),
    };
  });

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;
  const summary = {
    totalPatients: patients.length,
    withPayment: patients.filter((p) => p.payments.length > 0).length,
    conversionRate: patients.length > 0 ? Math.round((patients.filter((p) => p.payments.length > 0).length / patients.length) * 10000) / 100 : 0,
  };

  return { rows: grouped, summary, meta: { totalRows: grouped.length, executedAt: new Date().toISOString(), dataSource: 'patients', dateRange: config.dateRange, groupBy: config.groupBy } };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, { [groupBy]: key, count: 0, withPayment: 0 });
    const g = groups.get(key)!;
    g.count++;
    if (row.hasPayment) g.withPayment++;
  }
  for (const g of groups.values()) {
    g.conversionRate = g.count > 0 ? Math.round((g.withPayment / g.count) * 10000) / 100 : 0;
  }
  return Array.from(groups.values());
}

export const patientsDataSource: DataSourceAdapter = { definition, execute };
