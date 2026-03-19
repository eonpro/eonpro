import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'provider',
  name: 'Provider Productivity',
  description: 'Appointment utilization, telehealth sessions, and SOAP note completion',
  icon: 'Stethoscope',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'providerName', label: 'Provider', type: 'string', sortable: true, groupable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'appointmentType', label: 'Type', type: 'string', groupable: true },
    { id: 'appointmentStatus', label: 'Status', type: 'string', filterable: true, groupable: true },
    { id: 'duration', label: 'Duration (min)', type: 'number', sortable: true },
    { id: 'patientId', label: 'Patient ID', type: 'number' },
    { id: 'hasSoapNote', label: 'SOAP Note', type: 'boolean', groupable: true },
    { id: 'isTelehealth', label: 'Telehealth', type: 'boolean', filterable: true, groupable: true },
  ],
  filters: [
    { field: 'appointmentStatus', label: 'Status', type: 'multi_select', options: [
      { value: 'SCHEDULED', label: 'Scheduled' }, { value: 'COMPLETED', label: 'Completed' },
      { value: 'CANCELLED', label: 'Cancelled' }, { value: 'NO_SHOW', label: 'No Show' },
    ]},
    { field: 'appointmentType', label: 'Type', type: 'multi_select', options: [
      { value: 'IN_PERSON', label: 'In Person' }, { value: 'VIDEO', label: 'Video' }, { value: 'PHONE', label: 'Phone' },
    ]},
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'providerName', label: 'By Provider' }, { id: 'clinicName', label: 'By Clinic' },
    { id: 'appointmentType', label: 'By Type' }, { id: 'appointmentStatus', label: 'By Status' },
    { id: 'month', label: 'By Month' }, { id: 'week', label: 'By Week' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.startTime = { gte: new Date(config.dateRange.startDate), lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z') };
  }
  for (const f of config.filters) {
    if (f.field === 'appointmentStatus' && f.operator === 'in') where.status = { in: f.value };
    if (f.field === 'appointmentType' && f.operator === 'in') where.type = { in: f.value };
  }

  const appointments = await prisma.appointment.findMany({
    where,
    orderBy: { startTime: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: {
      provider: { select: { id: true, firstName: true, lastName: true } },
      clinic: { select: { name: true } },
      patient: { select: { soapNotes: { select: { id: true }, take: 1 } } },
    },
  });

  const rows: ReportRow[] = appointments.map((a) => ({
    id: a.id, date: a.startTime.toISOString(),
    providerName: `${a.provider?.firstName || ''} ${a.provider?.lastName || ''}`.trim(),
    clinicName: a.clinic?.name || '', appointmentType: a.type, appointmentStatus: a.status,
    duration: a.duration || 0, patientId: a.patientId,
    hasSoapNote: (a.patient?.soapNotes?.length ?? 0) > 0, isTelehealth: a.type === 'VIDEO',
    month: a.startTime.toISOString().slice(0, 7),
    week: a.startTime.toISOString().slice(0, 10),
  }));

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;
  const completed = appointments.filter((a) => a.status === 'COMPLETED').length;
  const noShows = appointments.filter((a) => a.status === 'NO_SHOW').length;
  const summary = {
    totalAppointments: appointments.length, completed, noShows,
    completionRate: appointments.length > 0 ? Math.round((completed / appointments.length) * 10000) / 100 : 0,
    noShowRate: appointments.length > 0 ? Math.round((noShows / appointments.length) * 10000) / 100 : 0,
    avgDuration: appointments.length > 0 ? Math.round(appointments.reduce((a, ap) => a + (ap.duration || 0), 0) / appointments.length) : 0,
  };

  return { rows: grouped, summary, meta: { totalRows: grouped.length, executedAt: new Date().toISOString(), dataSource: 'provider', dateRange: config.dateRange, groupBy: config.groupBy } };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, { [groupBy]: key, count: 0, completed: 0, noShows: 0, totalDuration: 0 });
    const g = groups.get(key)!;
    g.count++;
    if (row.appointmentStatus === 'COMPLETED') g.completed++;
    if (row.appointmentStatus === 'NO_SHOW') g.noShows++;
    g.totalDuration += row.duration || 0;
  }
  for (const g of groups.values()) {
    g.completionRate = g.count > 0 ? Math.round((g.completed / g.count) * 10000) / 100 : 0;
    g.avgDuration = g.count > 0 ? Math.round(g.totalDuration / g.count) : 0;
  }
  return Array.from(groups.values());
}

export const providerDataSource: DataSourceAdapter = { definition, execute };
