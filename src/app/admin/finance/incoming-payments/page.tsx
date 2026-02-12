'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';

const VALID_STATUSES = ['MATCHED', 'CREATED', 'FAILED', 'PENDING', 'SKIPPED'] as const;

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

interface ApiResponse {
  success: boolean;
  summary: Summary;
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
  const [days, setDays] = useState(14);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: '100',
      });
      if (statusFilter) params.set('status', statusFilter);

      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/finance/incoming-payments?${params}`, {
        credentials: 'include',
        headers,
      });

      const data = (await res.json()) as ApiResponse | { error: string };

      if (!res.ok) {
        const errMsg = 'error' in data ? data.error : 'Failed to load incoming payments';
        setError(errMsg);
        setPayments([]);
        setSummary(null);
        return;
      }

      if ('success' in data && data.success) {
        setPayments(data.payments ?? []);
        setSummary(data.summary ?? null);
        setLastUpdated(new Date());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(message);
      setPayments([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [days, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Incoming Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            Stripe webhook payment stream. Verify accuracy for EonMeds and other clinics.
          </p>
          {lastUpdated && !loading && (
            <p className="mt-1 text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <Filter className="h-4 w-4 text-gray-400" aria-hidden />
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
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
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
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={loading ? 'Refreshing...' : 'Refresh data'}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
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
          className="grid grid-cols-2 gap-4 sm:grid-cols-4"
          aria-label="Payment summary statistics"
        >
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total payments</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Total amount</p>
            <p className="mt-1 text-2xl font-bold text-emerald-600">
              {formatCurrency(totalAmount)}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Matched / Created</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{matchedCreatedCount}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-gray-500">Failed</p>
            <p className="mt-1 text-2xl font-bold text-red-600">{failedCount}</p>
          </div>
        </div>
      )}

      {/* Payments table */}
      <section
        className="rounded-xl border border-gray-200 bg-white shadow-sm"
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
          <div className="overflow-x-auto">
            <table className="w-full" aria-label="Incoming payments">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                  >
                    Date
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                  >
                    Customer
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                  >
                    Amount
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
                  >
                    Match
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500"
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
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">
                          {new Date(p.createdAt).toLocaleString()}
                        </p>
                        <p className="text-xs font-mono text-gray-400">
                          {p.stripePaymentIntentId || p.stripeChargeId || p.stripeEventId || '–'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {p.customerName || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500">{p.customerEmail || '–'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(p.amount)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.color}`}
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden />
                          {config.label}
                        </span>
                        {p.patientCreated && (
                          <span className="ml-1 text-xs text-blue-600" aria-hidden>
                            (new)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.matchedBy ? (
                          <span className="text-xs text-gray-600">
                            {p.matchedBy} ({p.matchConfidence || '–'})
                          </span>
                        ) : p.errorMessage ? (
                          <p
                            className="max-w-[180px] truncate text-xs text-red-600"
                            title={p.errorMessage}
                          >
                            {p.errorMessage}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-400">–</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {p.patient && (
                            <Link
                              href={`/patients/${p.patient.id}`}
                              className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:underline"
                            >
                              {p.patient.firstName} {p.patient.lastName}
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </Link>
                          )}
                          {p.invoice && (
                            <Link
                              href="/admin/finance/invoices"
                              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                            >
                              Invoice #{p.invoice.id}
                              <ExternalLink className="h-3 w-3" aria-hidden />
                            </Link>
                          )}
                          {!p.patient && !p.invoice && (
                            <span className="text-sm text-gray-400">–</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
