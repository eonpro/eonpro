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
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Transaction {
  id: number;
  date: string;
  patient: {
    id: number | null;
    patientId: string | null;
    name: string;
    email: string | null;
  };
  amount: number;
  formattedAmount: string;
  status: string;
  paymentMethod: string;
  isRecurring: boolean;
  subscription: {
    planName: string;
    interval: string;
    amount: string;
  } | null;
  invoice: {
    id: number;
    number: string | null;
    items: string;
  } | null;
  refundedAmount: string | null;
  stripePaymentIntentId: string | null;
}

interface Summary {
  totalTransactions: number;
  grossAmount: number;
  formattedGross: string;
  refundedAmount: number;
  formattedRefunded: string;
  netAmount: number;
  formattedNet: string;
  averageTransaction: number;
  formattedAverage: string;
  succeededCount: number;
  succeededAmount: string;
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

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function SalesReportPage() {
  const [range, setRange] = useState('today');
  const [customStart, setCustomStart] = useState(daysAgoISO(7));
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(100);

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

  /* ---- Filtered rows (client-side search on top of server data) ---- */
  const filteredRows = data?.transactions.filter((t) => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return (
      t.patient.name.toLowerCase().includes(q) ||
      (t.patient.email?.toLowerCase().includes(q) ?? false) ||
      (t.invoice?.number?.toLowerCase().includes(q) ?? false) ||
      String(t.id).includes(q)
    );
  }) ?? [];

  /* ---- Render ---- */
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
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
              Every transaction with patient name &mdash; filter by date, status, or search
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
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date range */}
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

          {/* Status */}
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

          {/* Search */}
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-500">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Patient name, email, invoice #..."
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
            <span>{data.pagination.totalCount.toLocaleString()} transactions</span>
          </div>
        )}
      </div>

      {/* Summary cards */}
      {data && (
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SummaryCard
            icon={<DollarSign className="h-5 w-5 text-emerald-600" />}
            label="Gross Sales"
            value={data.summary.formattedGross}
            sub={`${data.summary.totalTransactions} transactions`}
            accent="emerald"
          />
          <SummaryCard
            icon={<RefreshCcw className="h-5 w-5 text-amber-600" />}
            label="Refunded"
            value={data.summary.formattedRefunded}
            accent="amber"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
            label="Net Sales"
            value={data.summary.formattedNet}
            accent="blue"
          />
          <SummaryCard
            icon={<Receipt className="h-5 w-5 text-purple-600" />}
            label="Avg. Transaction"
            value={data.summary.formattedAverage}
            sub={`${data.summary.succeededCount} succeeded`}
            accent="purple"
          />
        </div>
      )}

      {/* Table */}
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
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Date / Time</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Patient</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Amount</th>
                  <th className="px-4 py-3 text-center font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Method</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">
                    Plan / Items
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-gray-400">
                      No transactions found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((t) => {
                    const StatusIcon = STATUS_ICONS[t.status];
                    return (
                      <tr
                        key={t.id}
                        className="transition hover:bg-gray-50/60"
                      >
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="font-medium text-gray-900">{formatDate(t.date)}</div>
                          <div className="text-xs text-gray-500">{formatTime(t.date)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{t.patient.name}</div>
                          {t.patient.email && (
                            <div className="truncate text-xs text-gray-500">{t.patient.email}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <span className="font-semibold text-gray-900">{t.formattedAmount}</span>
                          {t.refundedAmount && (
                            <div className="text-xs text-amber-600">
                              Refunded: {t.refundedAmount}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[t.status] || 'bg-gray-50 text-gray-600 border-gray-200'}`}
                          >
                            {StatusIcon && <StatusIcon className="h-3 w-3" />}
                            {t.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                          {t.paymentMethod}
                        </td>
                        <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                          {t.subscription ? (
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              {t.subscription.planName}
                            </span>
                          ) : t.invoice?.items ? (
                            <span className="truncate">{t.invoice.items}</span>
                          ) : (
                            <span className="text-gray-400">&mdash;</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-gray-500 text-xs">
                          {t.invoice?.number || <span className="text-gray-300">&mdash;</span>}
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
                Page {data.pagination.page} of {data.pagination.totalPages} &middot;{' '}
                {data.pagination.totalCount.toLocaleString()} total
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-md border border-gray-300 p-1.5 text-gray-600 transition hover:bg-white disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
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

/* ------------------------------------------------------------------ */
/*  Summary card                                                       */
/* ------------------------------------------------------------------ */

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
