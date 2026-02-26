'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  Calendar,
  Download,
  Loader2,
  ArrowLeft,
  Search,
  ChevronLeft,
  ChevronRight,
  Receipt,
  TrendingUp,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  AlertTriangle,
  Clock,
  BarChart3,
  Pill,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

/* ================================================================== */
/*  Types — mirrors the API response                                   */
/* ================================================================== */

interface TransactionPatient {
  id: number | null;
  patientId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
}

interface TransactionSubscription {
  id: number;
  planName: string;
  interval: string;
  intervalCount: number;
  amount: number;
  formattedAmount: string;
  status: string;
}

interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  formattedAmount: string;
}

interface TransactionInvoice {
  id: number;
  number: string | null;
  status: string;
  total: number | null;
  formattedTotal: string | null;
  amountPaid: number;
  lineItems: InvoiceLineItem[];
  lineItemsSummary: string;
}

interface Transaction {
  id: number;
  createdAt: string;
  paidAt: string | null;
  patient: TransactionPatient;
  amount: number;
  formattedAmount: string;
  currency: string;
  status: string;
  paymentMethod: string;
  failureReason: string | null;
  description: string | null;
  isRecurring: boolean;
  treatment: string | null;
  subscription: TransactionSubscription | null;
  invoice: TransactionInvoice | null;
  refundedAmount: number;
  formattedRefundedAmount: string | null;
  refundedAt: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
}

interface StatusBreakdown {
  count: number;
  amount: number;
  formatted: string;
}

interface Summary {
  totalTransactions: number;
  grossSales: number;
  formattedGrossSales: string;
  totalRefunded: number;
  formattedTotalRefunded: string;
  refundedTransactions: number;
  netSales: number;
  formattedNetSales: string;
  averageTransaction: number;
  formattedAverage: string;
  byStatus: {
    succeeded: StatusBreakdown;
    failed: StatusBreakdown;
    refunded: StatusBreakdown;
    pending: StatusBreakdown;
    canceled: StatusBreakdown;
  };
  successRate: number;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface DateRangeInfo {
  start: string;
  end: string;
  label: string;
  range: string;
}

interface ApiResponse {
  transactions: Transaction[];
  pagination: Pagination;
  summary: Summary;
  dateRange: DateRangeInfo;
}

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'pending', label: 'Pending' },
  { value: 'canceled', label: 'Canceled' },
];

const STATUS_STYLES: Record<string, string> = {
  SUCCEEDED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  REFUNDED: 'bg-amber-50 text-amber-700 border-amber-200',
  PARTIALLY_REFUNDED: 'bg-amber-50 text-amber-700 border-amber-200',
  PENDING: 'bg-blue-50 text-blue-700 border-blue-200',
  PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELED: 'bg-gray-50 text-gray-600 border-gray-200',
};

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  SUCCEEDED: CheckCircle2,
  FAILED: XCircle,
  REFUNDED: RefreshCcw,
  PARTIALLY_REFUNDED: RefreshCcw,
  PENDING: Clock,
  PROCESSING: Clock,
  CANCELED: XCircle,
};

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

/* ================================================================== */
/*  Page Component                                                     */
/* ================================================================== */

export default function SalesReportPage() {
  const [range, setRange] = useState('today');
  const [customStart, setCustomStart] = useState(daysAgoISO(7));
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(100);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---- Fetch ---- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        range,
        status: statusFilter,
        page: String(page),
        limit: String(limit),
      });
      if (range === 'custom') {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      }
      const res = await apiFetch(`/api/reports/sales-transactions?${params}`);
      if (!res.ok) throw new Error('Failed to load report');
      const json: ApiResponse = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [range, statusFilter, page, limit, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(1);
    setExpandedRow(null);
  }, [range, statusFilter, customStart, customEnd]);

  /* ---- Export CSV ---- */
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({
        format: 'csv',
        report: 'sales_transactions',
        range,
      });
      if (range === 'custom') {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      }
      const res = await apiFetch(`/api/reports/export?${params}`);
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sales_transactions_${range}_${todayISO()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  /* ---- Client-side search filter on loaded data ---- */
  const filteredRows =
    data?.transactions.filter((t) => {
      if (!searchTerm) return true;
      const q = searchTerm.toLowerCase();
      return (
        t.patient.name.toLowerCase().includes(q) ||
        (t.patient.email?.toLowerCase().includes(q) ?? false) ||
        (t.patient.patientId?.toLowerCase().includes(q) ?? false) ||
        (t.invoice?.number?.toLowerCase().includes(q) ?? false) ||
        (t.treatment?.toLowerCase().includes(q) ?? false) ||
        String(t.id).includes(q)
      );
    }) ?? [];

  /* ---- Render ---- */
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/finance/reports"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Sales Transactions
            </h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Detailed transaction ledger &mdash; every payment with patient, treatment, and status
            </p>
          </div>
        </div>

        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-gray-800 disabled:opacity-50"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export Full CSV
        </button>
      </div>

      {/* ---- Filters ---- */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[160px]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Date Range</label>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {range === 'custom' && (
            <>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Start</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">End</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </>
          )}

          <div className="min-w-[150px]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Patient name, email, ID, treatment, invoice #..."
                className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm placeholder:text-gray-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>
        </div>

        {data && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {data.dateRange.label}: {formatDate(data.dateRange.start)} &ndash;{' '}
              {formatDate(data.dateRange.end)}
            </span>
            <span className="text-gray-300">|</span>
            <span>{data.summary.totalTransactions.toLocaleString()} total transactions</span>
            <span className="text-gray-300">|</span>
            <span>{data.summary.successRate}% success rate</span>
          </div>
        )}
      </div>

      {/* ---- Summary cards ---- */}
      {data && (
        <>
          {/* Primary metrics */}
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <SummaryCard
              icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
              label="Gross Sales (Succeeded)"
              value={data.summary.formattedGrossSales}
              sub={`${data.summary.byStatus.succeeded.count} payments`}
              accent="emerald"
            />
            <SummaryCard
              icon={<RefreshCcw className="h-5 w-5 text-amber-600" />}
              label="Total Refunded"
              value={data.summary.formattedTotalRefunded}
              sub={`${data.summary.refundedTransactions} refund(s)`}
              accent="amber"
            />
            <SummaryCard
              icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
              label="Net Sales"
              value={data.summary.formattedNetSales}
              sub="Gross minus refunds"
              accent="blue"
            />
            <SummaryCard
              icon={<Receipt className="h-5 w-5 text-purple-600" />}
              label="Avg. Transaction"
              value={data.summary.formattedAverage}
              sub={`${data.summary.successRate}% success rate`}
              accent="purple"
            />
          </div>

          {/* Status breakdown strip */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatusPill label="Succeeded" count={data.summary.byStatus.succeeded.count} amount={data.summary.byStatus.succeeded.formatted} color="emerald" />
            <StatusPill label="Failed" count={data.summary.byStatus.failed.count} amount={data.summary.byStatus.failed.formatted} color="red" />
            <StatusPill label="Refunded" count={data.summary.byStatus.refunded.count} amount={data.summary.byStatus.refunded.formatted} color="amber" />
            <StatusPill label="Pending" count={data.summary.byStatus.pending.count} amount={data.summary.byStatus.pending.formatted} color="blue" />
            <StatusPill label="Canceled" count={data.summary.byStatus.canceled.count} amount={data.summary.byStatus.canceled.formatted} color="gray" />
          </div>
        </>
      )}

      {/* ---- Table ---- */}
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white py-24">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-3 text-sm text-gray-500">Loading transactions...</span>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600">
          {error}
          <button
            onClick={fetchData}
            className="ml-3 font-medium underline underline-offset-2 hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Date</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Patient</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Treatment</th>
                  <th className="px-3 py-3 text-right font-semibold text-gray-600">Amount</th>
                  <th className="px-3 py-3 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Method</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Plan / Items</th>
                  <th className="px-3 py-3 text-left font-semibold text-gray-600">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-16 text-center text-gray-400">
                      No transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((t) => {
                    const StatusIcon = STATUS_ICONS[t.status];
                    const isExpanded = expandedRow === t.id;

                    return (
                      <tr
                        key={t.id}
                        className="group cursor-pointer transition hover:bg-gray-50/60"
                        onClick={() => setExpandedRow(isExpanded ? null : t.id)}
                      >
                        <td className="whitespace-nowrap px-3 py-3">
                          <div className="font-medium text-gray-900">
                            {formatDate(t.paidAt || t.createdAt)}
                          </div>
                          <div className="text-xs text-gray-500">
                            {formatTime(t.paidAt || t.createdAt)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-gray-900">{t.patient.name}</div>
                          <div className="text-xs text-gray-500">
                            {t.patient.patientId || `#${t.patient.id}`}
                          </div>
                        </td>
                        <td className="max-w-[160px] truncate px-3 py-3">
                          {t.treatment ? (
                            <span className="inline-flex items-center gap-1 text-gray-700">
                              <Pill className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                              <span className="truncate">{t.treatment}</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">&mdash;</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right">
                          <span className="font-semibold text-gray-900">{t.formattedAmount}</span>
                          {t.refundedAmount > 0 && (
                            <div className="text-xs text-amber-600">
                              -{t.formattedRefundedAmount} refund
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
                          >
                            {StatusIcon && <StatusIcon className="h-3 w-3" />}
                            {t.status.replace('_', ' ')}
                          </span>
                          {t.failureReason && (
                            <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[10px] text-red-500">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              <span className="max-w-[100px] truncate">{t.failureReason}</span>
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-600 text-xs">
                          {t.paymentMethod}
                        </td>
                        <td className="max-w-[180px] truncate px-3 py-3 text-xs text-gray-600">
                          {t.subscription ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-emerald-400" />
                              {t.subscription.planName}
                              <span className="text-gray-400">
                                ({t.subscription.formattedAmount}/{t.subscription.interval})
                              </span>
                            </span>
                          ) : t.invoice?.lineItemsSummary ? (
                            <span className="truncate">{t.invoice.lineItemsSummary}</span>
                          ) : (
                            <span className="text-gray-300">&mdash;</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                          {t.invoice?.number ? (
                            <span>
                              {t.invoice.number}
                              <span className="ml-1 text-gray-400">({t.invoice.status})</span>
                            </span>
                          ) : (
                            <span className="text-gray-300">&mdash;</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs text-gray-500">
                Showing {((data.pagination.page - 1) * data.pagination.limit) + 1}
                &ndash;
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)}
                {' '}of {data.pagination.totalCount.toLocaleString()} transactions
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 p-1.5 text-gray-600 transition hover:bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
                  const startPage = Math.max(1, Math.min(page - 2, data.pagination.totalPages - 4));
                  const p = startPage + i;
                  if (p > data.pagination.totalPages) return null;
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                        p === page
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-gray-300 text-gray-600 hover:bg-white'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  disabled={page >= data.pagination.totalPages}
                  className="rounded-md border border-gray-300 p-1.5 text-gray-600 transition hover:bg-white disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/*  Sub-components                                                     */
/* ================================================================== */

function SummaryCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  const bgMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200',
    amber: 'bg-amber-50 border-amber-200',
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
  };

  return (
    <div className={`rounded-xl border p-4 ${bgMap[accent] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function StatusPill({
  label,
  count,
  amount,
  color,
}: {
  label: string;
  count: number;
  amount: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  };

  return (
    <div className={`rounded-lg border px-3 py-2 ${colorMap[color] || colorMap.gray}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">{label}</span>
        <span className="rounded-full bg-white/60 px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
      </div>
      <p className="mt-0.5 text-sm font-semibold">{amount}</p>
    </div>
  );
}
