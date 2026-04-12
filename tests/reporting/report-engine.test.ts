/**
 * Enterprise Report Engine Tests
 *
 * Validates:
 * 1. Engine registration: all 7 data sources are registered
 * 2. Data source definitions: each has columns, filters, groupByOptions
 * 3. Report execution: runReport delegates to the correct adapter
 * 4. Grouping: rows are aggregated when groupBy is set
 * 5. CSV export: generates valid CSV with headers and formatted values
 * 6. PDF export: generates a non-empty Uint8Array
 * 7. Error handling: unknown data source throws
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    mockPrisma: {
      payment: { findMany: fn() },
      salesRepCommissionEvent: { findMany: fn() },
      patient: { findMany: fn() },
      patientShippingUpdate: { findMany: fn() },
      appointment: { findMany: fn() },
      affiliateCommissionEvent: { findMany: fn() },
      subscription: { findMany: fn() },
      clinic: { findUnique: fn() },
      reportTemplate: { findMany: fn(), create: fn(), findUnique: fn(), update: fn(), delete: fn() },
      reportSchedule: { findMany: fn(), create: fn() },
    },
  };
});

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), security: vi.fn() },
}));

import { getDataSources, getDataSource, runReport } from '@/services/reporting/reportEngine';
import { exportToCsv } from '@/services/reporting/exporters/csv';
import { exportToPdf } from '@/services/reporting/exporters/pdf';
import { exportToXlsx } from '@/services/reporting/exporters/xlsx';
import type { ReportConfig } from '@/services/reporting/types';

// ============================================================================
// ENGINE REGISTRATION
// ============================================================================

describe('Report Engine: Data Source Registration', () => {
  it('registers all 11 data sources', () => {
    const sources = getDataSources();
    expect(sources).toHaveLength(11);
    const ids = sources.map((s) => s.id);
    expect(ids).toContain('revenue');
    expect(ids).toContain('commissions');
    expect(ids).toContain('patients');
    expect(ids).toContain('fulfillment');
    expect(ids).toContain('provider');
    expect(ids).toContain('affiliates');
    expect(ids).toContain('subscriptions');
    expect(ids).toContain('stripe-balance');
    expect(ids).toContain('stripe-transactions');
    expect(ids).toContain('stripe-payouts');
    expect(ids).toContain('stripe-reconciliation');
  });

  it('each data source has required structure', () => {
    for (const ds of getDataSources()) {
      expect(ds.id).toBeTruthy();
      expect(ds.name).toBeTruthy();
      expect(ds.description).toBeTruthy();
      expect(ds.icon).toBeTruthy();
      expect(Array.isArray(ds.columns)).toBe(true);
      expect(ds.columns.length).toBeGreaterThan(0);
      expect(Array.isArray(ds.filters)).toBe(true);
      expect(Array.isArray(ds.groupByOptions)).toBe(true);
      expect(ds.groupByOptions.length).toBeGreaterThan(0);
    }
  });

  it('each column has id, label, and type', () => {
    for (const ds of getDataSources()) {
      for (const col of ds.columns) {
        expect(col.id).toBeTruthy();
        expect(col.label).toBeTruthy();
        expect(['string', 'number', 'currency', 'date', 'boolean', 'percent']).toContain(col.type);
      }
    }
  });

  it('getDataSource returns specific source by id', () => {
    const revenue = getDataSource('revenue');
    expect(revenue).not.toBeNull();
    expect(revenue!.id).toBe('revenue');
    expect(revenue!.name).toBe('Revenue & Payments');
  });

  it('getDataSource returns null for unknown source', () => {
    expect(getDataSource('nonexistent')).toBeNull();
  });
});

// ============================================================================
// REPORT EXECUTION: COMMISSIONS
// ============================================================================

describe('Report Execution: Commissions', () => {
  const mockEvents = [
    {
      id: 1, occurredAt: new Date('2026-03-10'), salesRepId: 10, clinicId: 1,
      eventAmountCents: 50000, commissionAmountCents: 5000,
      baseCommissionCents: 5000, volumeTierBonusCents: 0, productBonusCents: 0, multiItemBonusCents: 0,
      status: 'APPROVED', isRecurring: false, isManual: false, metadata: { planName: 'Standard' },
      salesRep: { id: 10, firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
      clinic: { name: 'Test Clinic' },
    },
    {
      id: 2, occurredAt: new Date('2026-03-11'), salesRepId: 10, clinicId: 1,
      eventAmountCents: 30000, commissionAmountCents: 600,
      baseCommissionCents: 600, volumeTierBonusCents: 0, productBonusCents: 0, multiItemBonusCents: 0,
      status: 'APPROVED', isRecurring: true, isManual: false, metadata: { planName: 'Standard' },
      salesRep: { id: 10, firstName: 'John', lastName: 'Doe', email: 'john@test.com' },
      clinic: { name: 'Test Clinic' },
    },
    {
      id: 3, occurredAt: new Date('2026-03-12'), salesRepId: 20, clinicId: 1,
      eventAmountCents: 70000, commissionAmountCents: 7000,
      baseCommissionCents: 7000, volumeTierBonusCents: 0, productBonusCents: 0, multiItemBonusCents: 0,
      status: 'PENDING', isRecurring: false, isManual: false, metadata: { planName: 'Premium' },
      salesRep: { id: 20, firstName: 'Jane', lastName: 'Smith', email: 'jane@test.com' },
      clinic: { name: 'Test Clinic' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.salesRepCommissionEvent.findMany.mockResolvedValue(mockEvents);
  });

  it('returns raw rows when no groupBy', async () => {
    const result = await runReport({
      dataSource: 'commissions',
      columns: ['date', 'salesRepName', 'revenue', 'commission'],
      filters: [],
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].salesRepName).toBe('John Doe');
    expect(result.rows[0].revenue).toBe(50000);
    expect(result.rows[0].commission).toBe(5000);
    expect(result.meta.dataSource).toBe('commissions');
    expect(result.meta.totalRows).toBe(3);
  });

  it('computes correct summary totals', async () => {
    const result = await runReport({ dataSource: 'commissions', columns: [], filters: [] });

    expect(result.summary.totalRevenue).toBe(150000);
    expect(result.summary.totalCommission).toBe(12600);
    expect(result.summary.totalEvents).toBe(3);
    expect(result.summary.newSaleCommission).toBe(12000);
    expect(result.summary.recurringCommission).toBe(600);
  });

  it('groups rows by salesRepName', async () => {
    const result = await runReport({
      dataSource: 'commissions',
      columns: [],
      filters: [],
      groupBy: 'salesRepName',
    });

    expect(result.rows).toHaveLength(2);
    const john = result.rows.find((r) => r.salesRepName === 'John Doe');
    const jane = result.rows.find((r) => r.salesRepName === 'Jane Smith');
    expect(john).toBeDefined();
    expect(john!.count).toBe(2);
    expect(john!.totalCommission).toBe(5600);
    expect(jane!.count).toBe(1);
    expect(jane!.totalCommission).toBe(7000);
  });

  it('groups rows by status', async () => {
    const result = await runReport({
      dataSource: 'commissions',
      columns: [],
      filters: [],
      groupBy: 'status',
    });

    expect(result.rows).toHaveLength(2);
    const approved = result.rows.find((r) => r.status === 'APPROVED');
    const pending = result.rows.find((r) => r.status === 'PENDING');
    expect(approved!.count).toBe(2);
    expect(pending!.count).toBe(1);
  });

  it('groups by isRecurring for new-vs-recurring breakdown', async () => {
    const result = await runReport({
      dataSource: 'commissions',
      columns: [],
      filters: [],
      groupBy: 'isRecurring',
    });

    expect(result.rows).toHaveLength(2);
    const newSales = result.rows.find((r) => r.isRecurring === false || r.isRecurring === 'false');
    const recurring = result.rows.find((r) => r.isRecurring === true || r.isRecurring === 'true');
    expect(newSales).toBeDefined();
    expect(recurring).toBeDefined();
  });

  it('passes dateRange to Prisma where clause', async () => {
    await runReport({
      dataSource: 'commissions',
      columns: [],
      filters: [],
      dateRange: { startDate: '2026-03-10', endDate: '2026-03-11' },
    });

    const call = mockPrisma.salesRepCommissionEvent.findMany.mock.calls[0][0];
    expect(call.where.occurredAt).toBeDefined();
    expect(call.where.occurredAt.gte).toBeInstanceOf(Date);
    expect(call.where.occurredAt.lte).toBeInstanceOf(Date);
  });

  it('applies status filter', async () => {
    await runReport({
      dataSource: 'commissions',
      columns: [],
      filters: [{ field: 'status', operator: 'eq', value: 'APPROVED' }],
    });

    const call = mockPrisma.salesRepCommissionEvent.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('APPROVED');
  });

  it('throws for unknown data source', async () => {
    await expect(runReport({ dataSource: 'nonexistent', columns: [], filters: [] }))
      .rejects.toThrow('Unknown data source: nonexistent');
  });
});

// ============================================================================
// REPORT EXECUTION: REVENUE
// ============================================================================

describe('Report Execution: Revenue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.payment.findMany.mockResolvedValue([
      {
        id: 1, createdAt: new Date('2026-03-10'), patientId: 100, clinicId: 1,
        amount: 50000, status: 'SUCCEEDED', paymentMethod: 'card', refundedAmount: 0,
        subscriptionId: null, clinic: { name: 'Test Clinic' },
      },
      {
        id: 2, createdAt: new Date('2026-03-11'), patientId: 101, clinicId: 1,
        amount: 30000, status: 'SUCCEEDED', paymentMethod: 'card', refundedAmount: 5000,
        subscriptionId: 5, clinic: { name: 'Test Clinic' },
      },
    ]);
  });

  it('returns payment rows with correct fields', async () => {
    const result = await runReport({ dataSource: 'revenue', columns: [], filters: [] });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].amount).toBe(50000);
    expect(result.rows[0].hasSubscription).toBe(false);
    expect(result.rows[1].hasSubscription).toBe(true);
  });

  it('computes revenue summary', async () => {
    const result = await runReport({ dataSource: 'revenue', columns: [], filters: [] });

    expect(result.summary.totalRevenue).toBe(80000);
    expect(result.summary.totalPayments).toBe(2);
    expect(result.summary.totalRefunded).toBe(5000);
  });

  it('groups by month', async () => {
    const result = await runReport({ dataSource: 'revenue', columns: [], filters: [], groupBy: 'month' });

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].month).toBeDefined();
    expect(result.rows[0].count).toBeGreaterThan(0);
  });
});

// ============================================================================
// REPORT EXECUTION: PATIENTS
// ============================================================================

describe('Report Execution: Patients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.patient.findMany.mockResolvedValue([
      {
        id: 1, createdAt: new Date('2026-03-10'), clinicId: 1, source: 'referral',
        profileStatus: 'ACTIVE', attributionRefCode: 'REP1',
        clinic: { name: 'Test Clinic' },
        salesRepAssignments: [{ salesRep: { firstName: 'John', lastName: 'Doe' } }],
        payments: [{ id: 1 }],
      },
      {
        id: 2, createdAt: new Date('2026-03-11'), clinicId: 1, source: 'manual',
        profileStatus: 'LEAD', attributionRefCode: null,
        clinic: { name: 'Test Clinic' },
        salesRepAssignments: [],
        payments: [],
      },
    ]);
  });

  it('returns patient rows with conversion data', async () => {
    const result = await runReport({ dataSource: 'patients', columns: [], filters: [] });

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].hasPayment).toBe(true);
    expect(result.rows[0].salesRepName).toBe('John Doe');
    expect(result.rows[1].hasPayment).toBe(false);
    expect(result.rows[1].salesRepName).toBe('');
  });

  it('computes conversion rate in summary', async () => {
    const result = await runReport({ dataSource: 'patients', columns: [], filters: [] });

    expect(result.summary.totalPatients).toBe(2);
    expect(result.summary.withPayment).toBe(1);
    expect(result.summary.conversionRate).toBe(50);
  });

  it('groups by source', async () => {
    const result = await runReport({ dataSource: 'patients', columns: [], filters: [], groupBy: 'source' });

    expect(result.rows).toHaveLength(2);
    const referral = result.rows.find((r) => r.source === 'referral');
    const manual = result.rows.find((r) => r.source === 'manual');
    expect(referral!.count).toBe(1);
    expect(manual!.count).toBe(1);
  });
});

// ============================================================================
// EXPORTERS
// ============================================================================

describe('CSV Exporter', () => {
  it('generates valid CSV with headers, summary, and data', () => {
    const result = {
      rows: [
        { date: '2026-03-10', salesRepName: 'John', commission: 5000, status: 'APPROVED' },
        { date: '2026-03-11', salesRepName: 'Jane', commission: 7000, status: 'PENDING' },
      ],
      summary: { totalCommission: 12000, totalEvents: 2 },
      meta: { totalRows: 2, executedAt: new Date().toISOString(), dataSource: 'commissions' },
    };

    const columns = [
      { id: 'date', label: 'Date', type: 'date' as const },
      { id: 'salesRepName', label: 'Sales Rep', type: 'string' as const },
      { id: 'commission', label: 'Commission', type: 'currency' as const },
      { id: 'status', label: 'Status', type: 'string' as const },
    ];

    const csv = exportToCsv(result, columns, 'Test Report');

    expect(csv).toContain('Test Report');
    expect(csv).toContain('=== SUMMARY ===');
    expect(csv).toContain('Total Commission');
    expect(csv).toContain('=== DATA ===');
    expect(csv).toContain('"Date","Sales Rep","Commission","Status"');
    expect(csv).toContain('$50.00');
    expect(csv).toContain('$70.00');
    expect(csv).toContain('John');
    expect(csv).toContain('Jane');
  });

  it('formats currency as dollars', () => {
    const result = {
      rows: [{ amount: 12345 }],
      summary: {},
      meta: { totalRows: 1, executedAt: new Date().toISOString(), dataSource: 'test' },
    };
    const columns = [{ id: 'amount', label: 'Amount', type: 'currency' as const }];
    const csv = exportToCsv(result, columns, 'Test');
    expect(csv).toContain('$123.45');
  });

  it('formats booleans as Yes/No', () => {
    const result = {
      rows: [{ active: true }, { active: false }],
      summary: {},
      meta: { totalRows: 2, executedAt: new Date().toISOString(), dataSource: 'test' },
    };
    const columns = [{ id: 'active', label: 'Active', type: 'boolean' as const }];
    const csv = exportToCsv(result, columns, 'Test');
    expect(csv).toContain('Yes');
    expect(csv).toContain('No');
  });
});

describe('PDF Exporter', () => {
  it('generates a non-empty PDF', async () => {
    const result = {
      rows: [{ date: '2026-03-10', name: 'John', amount: 5000 }],
      summary: { total: 5000 },
      meta: { totalRows: 1, executedAt: new Date().toISOString(), dataSource: 'test' },
    };
    const columns = [
      { id: 'date', label: 'Date', type: 'date' as const },
      { id: 'name', label: 'Name', type: 'string' as const },
      { id: 'amount', label: 'Amount', type: 'currency' as const },
    ];

    const pdf = await exportToPdf(result, columns, 'Test PDF');

    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(500);
    expect(pdf[0]).toBe(37); // %PDF magic byte
  });
});

describe('XLSX Exporter', () => {
  it('generates a non-empty buffer with TSV content', () => {
    const result = {
      rows: [{ date: '2026-03-10', name: 'John', amount: 5000 }],
      summary: { total: 5000 },
      meta: { totalRows: 1, executedAt: new Date().toISOString(), dataSource: 'test' },
    };
    const columns = [
      { id: 'date', label: 'Date', type: 'date' as const },
      { id: 'name', label: 'Name', type: 'string' as const },
      { id: 'amount', label: 'Amount', type: 'currency' as const },
    ];

    const xlsx = exportToXlsx(result, columns, 'Test Excel');

    expect(xlsx).toBeInstanceOf(Buffer);
    const content = xlsx.toString('utf-8');
    expect(content).toContain('Test Excel');
    expect(content).toContain('Date\tName\tAmount');
    expect(content).toContain('2026-03-10\tJohn\t50.00');
  });
});
