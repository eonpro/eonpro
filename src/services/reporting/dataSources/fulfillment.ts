import { prisma } from '@/lib/db';
import type { DataSourceAdapter, ReportConfig, ReportResult, DataSourceDef, ReportRow } from '../types';

const definition: DataSourceDef = {
  id: 'fulfillment',
  name: 'Shipping & Fulfillment',
  description: 'Order shipments, delivery status, and carrier performance',
  icon: 'Truck',
  columns: [
    { id: 'date', label: 'Date', type: 'date', sortable: true, filterable: true, groupable: true },
    { id: 'patientId', label: 'Patient ID', type: 'number', sortable: true },
    { id: 'clinicName', label: 'Clinic', type: 'string', sortable: true, groupable: true },
    { id: 'trackingNumber', label: 'Tracking #', type: 'string' },
    { id: 'carrier', label: 'Carrier', type: 'string', groupable: true },
    { id: 'status', label: 'Status', type: 'string', sortable: true, filterable: true, groupable: true },
    { id: 'source', label: 'Source', type: 'string', groupable: true },
    { id: 'estimatedDelivery', label: 'Est. Delivery', type: 'date' },
    { id: 'actualDelivery', label: 'Actual Delivery', type: 'date' },
    { id: 'daysInTransit', label: 'Days in Transit', type: 'number', sortable: true },
  ],
  filters: [
    { field: 'status', label: 'Shipping Status', type: 'multi_select', options: [
      { value: 'PENDING', label: 'Pending' }, { value: 'LABEL_CREATED', label: 'Label Created' },
      { value: 'SHIPPED', label: 'Shipped' }, { value: 'IN_TRANSIT', label: 'In Transit' },
      { value: 'DELIVERED', label: 'Delivered' }, { value: 'RETURNED', label: 'Returned' },
      { value: 'EXCEPTION', label: 'Exception' },
    ]},
    { field: 'carrier', label: 'Carrier', type: 'select' },
    { field: 'clinicId', label: 'Clinic', type: 'select' },
    { field: 'dateRange', label: 'Date Range', type: 'date_range' },
  ],
  groupByOptions: [
    { id: 'clinicName', label: 'By Clinic' }, { id: 'status', label: 'By Status' },
    { id: 'carrier', label: 'By Carrier' }, { id: 'source', label: 'By Source' },
    { id: 'month', label: 'By Month' },
  ],
};

async function execute(config: ReportConfig): Promise<ReportResult> {
  const where: Record<string, any> = {};
  if (config.clinicId) where.clinicId = config.clinicId;
  if (config.dateRange) {
    where.createdAt = { gte: new Date(config.dateRange.startDate), lte: new Date(config.dateRange.endDate + 'T23:59:59.999Z') };
  }
  for (const f of config.filters) {
    if (f.field === 'status' && f.operator === 'in') where.status = { in: f.value };
    if (f.field === 'carrier' && f.operator === 'eq') where.carrier = f.value;
  }

  const shipments = await prisma.patientShippingUpdate.findMany({
    where,
    orderBy: { createdAt: config.sortDir || 'desc' },
    take: config.limit || 1000,
    include: { clinic: { select: { name: true } } },
  });

  const rows: ReportRow[] = shipments.map((s) => {
    const daysInTransit = s.shippedAt && s.actualDelivery
      ? Math.round((s.actualDelivery.getTime() - s.shippedAt.getTime()) / 86_400_000)
      : s.shippedAt ? Math.round((Date.now() - s.shippedAt.getTime()) / 86_400_000) : null;
    return {
      id: s.id, date: s.createdAt.toISOString(), patientId: s.patientId,
      clinicName: (s as any).clinic?.name || '', trackingNumber: s.trackingNumber,
      carrier: s.carrier, status: s.status, source: s.source || 'unknown',
      estimatedDelivery: s.estimatedDelivery?.toISOString() || null,
      actualDelivery: s.actualDelivery?.toISOString() || null,
      daysInTransit, month: s.createdAt.toISOString().slice(0, 7),
    };
  });

  const grouped = config.groupBy ? groupRows(rows, config.groupBy) : rows;
  const delivered = shipments.filter((s) => s.status === 'DELIVERED').length;
  const summary = {
    totalShipments: shipments.length, delivered,
    inTransit: shipments.filter((s) => s.status === 'IN_TRANSIT').length,
    exceptions: shipments.filter((s) => s.status === 'EXCEPTION').length,
    deliveryRate: shipments.length > 0 ? Math.round((delivered / shipments.length) * 10000) / 100 : 0,
  };

  return { rows: grouped, summary, meta: { totalRows: grouped.length, executedAt: new Date().toISOString(), dataSource: 'fulfillment', dateRange: config.dateRange, groupBy: config.groupBy } };
}

function groupRows(rows: ReportRow[], groupBy: string): ReportRow[] {
  const groups = new Map<string, ReportRow>();
  for (const row of rows) {
    const key = String(row[groupBy] ?? 'Unknown');
    if (!groups.has(key)) groups.set(key, { [groupBy]: key, count: 0 });
    groups.get(key)!.count++;
  }
  return Array.from(groups.values());
}

export const fulfillmentDataSource: DataSourceAdapter = { definition, execute };
