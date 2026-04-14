'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  UserPlus,
  AlertTriangle,
  RefreshCw,
  Filter,
  Loader2,
  ExternalLink,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

const VALID_STATUSES = ['MATCHED', 'CREATED', 'FAILED', 'PENDING', 'SKIPPED'] as const;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

interface IncomingPayment {
  id: number;
  createdAt: string;
  status: string;
  stripeEventId: string | null;
  stripeEventType: string;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  amount: number;
  currency: string;
  customerEmail: string | null;
  customerName: string | null;
  customerPhone: string | null;
  matchedBy: string | null;
  matchConfidence: string | null;
  patientCreated: boolean;
  patient: { id: number; firstName: string; lastName: string; email: string | null } | null;
  invoice: { id: number; amount: number; status: string } | null;
  errorMessage: string | null;
  clinicId: number | null;
}

interface Summary {
  total: number;
  byStatus: Record<string, { count: number; amountCents: number }>;
  period: string;
}

interface Pagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

interface ApiResponse {
  success: boolean;
  summary: Summary;
  pagination: Pagination;
  payments: IncomingPayment[];
}

const formatCurrency = (cents: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

const statusConfig: Record<
  (typeof VALID_STATUSES)[number],
  { label: string; icon: React.ElementType; color: string }
> = {
  MATCHED: {
    label: 'Matched',
    icon: CheckCircle,
    color: 'text-emerald-600 bg-emerald-50',
  },
  CREATED: {
    label: 'New Patient',
    icon: UserPlus,
    color: 'text-blue-600 bg-blue-50',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'text-red-600 bg-red-50',
  },
  PENDING: {
    label: 'Pending',
    icon: Clock,
    color: 'text-amber-600 bg-amber-50',
  },
  SKIPPED: {
    label: 'Skipped',
    icon: AlertTriangle,
    color: 'text-gray-600 bg-gray-50',
  },
};

function getStatusConfig(status: string): (typeof statusConfig)[keyof typeof statusConfig] {
  return statusConfig[status as (typeof VALID_STATUSES)[number]] ?? statusConfig.PENDING;
}

export default function IncomingPaymentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<IncomingPayment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [days, setDays] = useState(14);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(
    async (targetPage?: number) => {
      setLoading(true);
      setError(null);
      const requestedPage = targetPage ?? page;
      try {
        const params = new URLSearchParams({
          days: String(days),
          limit: String(pageSize),
          page: String(requestedPage),
        });
        if (statusFilter) params.set('status', statusFilter);

        const res = await apiFetch(`/api/finance/incoming-payments?${params}`);
        const data = (await res.json()) as ApiResponse | { error: string };

        if (!res.ok) {
          const errMsg = 'error' in data ? data.error : 'Failed to load incoming payments';
          setError(errMsg);
          setPayments([]);
          setSummary(null);
          setPagination(null);
          return;
        }

        if ('success' in data && data.success) {
          setPayments(data.payments ?? []);
          setSummary(data.summary ?? null);
          setPagination(data.pagination ?? null);
          setLastUpdated(new Date());
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        setError(message);
        setPayments([]);
        setSummary(null);
        setPagination(null);
      } finally {
        setLoading(false);
      }
    },
    [days, statusFilter, page, pageSize]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [days, statusFilter, pageSize]);

  const totalAmount = useMemo(() => {
    if (!summary?.byStatus) return 0;
    return Object.values(summary.byStatus).reduce((s, v) => s + v.amountCents, 0);
  }, [summary]);

  const matchedCreatedCount = useMemo(() => {
    if (!summary?.byStatus) return 0;
    return (summary.byStatus.MATCHED?.count ?? 0) + (summary.byStatus.CREATED?.count ?? 0);
  }, [summary]);

  const failedCount = useMemo(() => {
    return summary?.byStatus?.FAILED?.count ?? 0;
  }, [summary]);

  const totalPages = pagination?.totalPages ?? 1;
  const totalCount = pagination?.totalCount ?? 0;

  const goToPage = (p: number) => {
    const clamped = Math.max(1, Math.min(p, totalPages));
    setPage(clamped);
  };

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    const end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [page, totalPages]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Incoming Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Stripe webhook payment stream. Verify accuracy for EonMeds and other clinics.
          </p>
          {lastUpdated && !loading && (
            <p className="mt-0.5 text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <Filter className="h-3.5 w-3.5 text-gray-400" aria-hidden />
            <label htmlFor="days-filter" className="sr-only">
              Time period
            </label>
            <select
              id="days-filter"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10))}
              className="border-0 bg-transparent text-sm focus:ring-0 focus:ring-offset-0"
              aria-label="Filter by time period"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
            <label htmlFor="status-filter" className="sr-only">
              Filter by status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border-0 bg-transparent text-sm focus:ring-0 focus:ring-offset-0"
              aria-label="Filter by payment status"
            >
              <option value="">All statuses</option>
              {VALID_STATUSES.map((key) => (
                <option key={key} value={key}>
                  {statusConfig[key].label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={loading ? 'Refreshing...' : 'Refresh data'}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden />
            Refresh
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{error}</p>
            <button
              type="button"
              onClick={() => void loadData()}
              className="mt-2 text-sm text-red-700 underline hover:no-underline"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Summary cards */}
      {summary && !error && (
        <div
          className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          aria-label="Payment summary statistics"
        >
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Total payments</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Total amount</p>
            <p className="mt-0.5 text-xl font-bold text-emerald-600">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Matched / Created</p>
            <p className="mt-0.5 text-xl font-bold text-gray-900">{matchedCreatedCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
            <p className="text-xs text-gray-500">Failed</p>
            <p className="mt-0.5 text-xl font-bold text-red-600">{failedCount}</p>
          </div>
        </div>
      )}

      {/* Payments table */}
      <section
        className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
        aria-label="Incoming payments table"
      >
        {loading ? (
          <div
            className="flex items-center justify-center py-16"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500" aria-hidden />
            <span className="sr-only">Loading incoming payments...</span>
          </div>
        ) : error ? null : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CreditCard className="mb-4 h-12 w-12 text-gray-300" aria-hidden />
            <p className="text-gray-500">No incoming payments in this period</p>
            <p className="mt-1 text-sm text-gray-400">
              Payments will appear here once Stripe webhooks are received
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Ensure DEFAULT_CLINIC_ID is set for payments without metadata
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Incoming payments">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500"
                    >
                      Date
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500"
                    >
                      Customer
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-medium uppercase text-gray-500"
                    >
                      Amount
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500"
                    >
                      Status
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500"
                    >
                      Match
                    </th>
                    <th
                      scope="col"
                      className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium uppercase text-gray-500"
                    >
                      Patient / Invoice
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const config = getStatusConfig(p.status);
                    const Icon = config.icon;
                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="whitespace-nowrap px-3 py-2">
                          <p className="text-xs text-gray-900">
                            {new Date(p.createdAt).toLocaleString()}
                          </p>
                          <p className="max-w-[180px] truncate font-mono text-[11px] text-gray-400">
                            {p.stripePaymentIntentId || p.stripeChargeId || p.stripeEventId || '–'}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          <p className="text-xs font-medium text-gray-900">
                            {p.customerName || 'Unknown'}
                          </p>
                          <p className="max-w-[180px] truncate text-xs text-gray-500">
                            {p.customerEmail || '–'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <p className="text-xs font-semibold text-gray-900">
                            {formatCurrency(p.amount)}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.color}`}
                          >
                            <Icon className="h-3 w-3" aria-hidden />
                            {config.label}
                          </span>
                          {p.patientCreated && (
                            <span className="ml-1 text-[11px] text-blue-600">(new)</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {p.matchedBy ? (
                            <span className="text-[11px] text-gray-600">
                              {p.matchedBy} ({p.matchConfidence || '–'})
                            </span>
                          ) : p.errorMessage ? (
                            <p
                              className="max-w-[150px] truncate text-[11px] text-red-600"
                              title={p.errorMessage}
                            >
                              {p.errorMessage}
                            </p>
                          ) : (
                            <span className="text-[11px] text-gray-400">–</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {p.patient && (
                              <a
                                href={`/admin/patients/${p.patient.id}`}
                                className="inline-flex items-center gap-0.5 text-xs text-emerald-600 hover:underline"
                              >
                                {p.patient.firstName} {p.patient.lastName}
                                <ExternalLink className="h-3 w-3" aria-hidden />
                              </a>
                            )}
                            {p.invoice && (
                              <a
                                href="/admin/finance/invoices"
                                className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                              >
                                Invoice #{p.invoice.id}
                                <ExternalLink className="h-3 w-3" aria-hidden />
                              </a>
                            )}
                            {!p.patient && !p.invoice && (
                              <span className="text-xs text-gray-400">–</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex flex-col gap-3 border-t border-gray-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of{' '}
                  {totalCount.toLocaleString()} payments
                </span>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="page-size" className="sr-only">
                    Rows per page
                  </label>
                  <select
                    id="page-size"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="rounded border border-gray-200 bg-white px-2 py-1 text-xs focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    aria-label="Rows per page"
                  >
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <option key={size} value={size}>
                        {size} / page
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <nav className="flex items-center gap-1" aria-label="Pagination">
                <button
                  type="button"
                  onClick={() => goToPage(1)}
                  disabled={page <= 1}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="First page"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {pageNumbers[0] > 1 && <span className="px-1 text-xs text-gray-400">...</span>}

                {pageNumbers.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => goToPage(p)}
                    className={`min-w-[28px] rounded px-1.5 py-1 text-xs font-medium ${
                      p === page ? 'bg-emerald-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ))}

                {pageNumbers[pageNumbers.length - 1] < totalPages && (
                  <span className="px-1 text-xs text-gray-400">...</span>
                )}

                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(totalPages)}
                  disabled={page >= totalPages}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label="Last page"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </nav>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
