'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  DollarSign,
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Users,
  Receipt,
  Calendar,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

interface SalesRep {
  id: number;
  firstName: string;
  lastName: string;
  role?: string;
}

interface PaymentItem {
  id: number;
  paidAt: string | null;
  createdAt: string;
  amount: number;
  currency: string;
  description: string | null;
  stripeInvoiceNumber: string | null;
  invoiceItems: { description: string; amount: number }[];
  isRebill: boolean;
  patient: {
    id: number;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  currentSalesRep: SalesRep | null;
  disposition: {
    commissionEventId: number;
    commissionType: 'NEW' | 'RECURRING';
    commissionAmountCents: number;
    salesRep: SalesRep;
  } | null;
}

interface Summary {
  totalPayments: number;
  pendingDisposition: number;
  dispositioned: number;
  totalRevenueCents: number;
  totalCommissionCents: number;
}

// ============================================================================
// Helpers
// ============================================================================

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getDefaultDateRange(): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  return { start, end };
}

// ============================================================================
// Page Component
// ============================================================================

export default function SalesTrackerPage() {
  const defaultDates = useMemo(() => getDefaultDateRange(), []);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [reps, setReps] = useState<SalesRep[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [startDate, setStartDate] = useState(defaultDates.start);
  const [endDate, setEndDate] = useState(defaultDates.end);
  const [dispositionFilter, setDispositionFilter] = useState<'all' | 'pending' | 'dispositioned'>(
    'pending'
  );
  const [searchQuery, setSearchQuery] = useState('');

  // Disposition state (per-row)
  const [rowState, setRowState] = useState<
    Record<number, { commissionType: 'NEW' | 'RECURRING'; salesRepId: number | null }>
  >({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [successId, setSuccessId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
        disposition: dispositionFilter,
      });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (searchQuery) params.set('search', searchQuery);

      const res = await apiFetch(`/api/admin/sales-rep/sales-tracker?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPayments(data.payments);
        setTotalPages(data.totalPages);
        setSummary(data.summary);
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to load' }));
        setErrorMsg(err.error || 'Failed to load payments');
      }
    } catch {
      setErrorMsg('Network error loading payments');
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, dispositionFilter, searchQuery]);

  const fetchReps = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/sales-rep/sales-tracker?action=reps');
      if (res.ok) {
        const data = await res.json();
        setReps(data.reps);
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  useEffect(() => {
    fetchReps();
  }, [fetchReps]);

  // ============================================================================
  // Row State Helpers
  // ============================================================================

  function getRowState(paymentId: number) {
    return rowState[paymentId] || { commissionType: 'NEW', salesRepId: null };
  }

  function updateRowState(
    paymentId: number,
    update: Partial<{ commissionType: 'NEW' | 'RECURRING'; salesRepId: number | null }>
  ) {
    setRowState((prev) => ({
      ...prev,
      [paymentId]: { ...getRowState(paymentId), ...update },
    }));
  }

  // ============================================================================
  // Disposition Handler
  // ============================================================================

  async function handleDisposition(paymentId: number) {
    const state = getRowState(paymentId);
    if (!state.salesRepId) {
      setErrorMsg('Please select a sales rep');
      return;
    }

    setSavingId(paymentId);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/api/admin/sales-rep/sales-tracker', {
        method: 'POST',
        body: JSON.stringify({
          paymentId,
          commissionType: state.commissionType,
          salesRepId: state.salesRepId,
        }),
      });

      if (res.ok) {
        setSuccessId(paymentId);
        setTimeout(() => setSuccessId(null), 2000);
        fetchPayments();
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed to save' }));
        setErrorMsg(err.error || 'Failed to disposition payment');
      }
    } catch {
      setErrorMsg('Network error saving disposition');
    } finally {
      setSavingId(null);
    }
  }

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-emerald-50 p-2.5">
            <DollarSign className="h-6 w-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Sales Commission Tracker</h1>
            <p className="text-sm text-gray-500">
              Disposition payments as new or recurring and assign to sales reps
            </p>
          </div>
        </div>
        <button
          onClick={() => fetchPayments()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-gray-400" />
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">
                Total Sales
              </p>
            </div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{summary.totalPayments}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <p className="text-xs font-medium uppercase tracking-wider text-amber-700">
                Pending
              </p>
            </div>
            <p className="mt-1 text-2xl font-bold text-amber-700">
              {summary.pendingDisposition}
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <p className="text-xs font-medium uppercase tracking-wider text-green-700">
                Dispositioned
              </p>
            </div>
            <p className="mt-1 text-2xl font-bold text-green-700">{summary.dispositioned}</p>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <p className="text-xs font-medium uppercase tracking-wider text-blue-700">Revenue</p>
            </div>
            <p className="mt-1 text-2xl font-bold text-blue-700">
              {formatCents(summary.totalRevenueCents)}
            </p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-500" />
              <p className="text-xs font-medium uppercase tracking-wider text-purple-700">
                Commissions
              </p>
            </div>
            <p className="mt-1 text-2xl font-bold text-purple-700">
              {formatCents(summary.totalCommissionCents)}
            </p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            <Calendar className="mr-1 inline h-3 w-3" />
            From
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            <Calendar className="mr-1 inline h-3 w-3" />
            To
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">
            <Filter className="mr-1 inline h-3 w-3" />
            Status
          </label>
          <div className="flex gap-1">
            {(['pending', 'dispositioned', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setDispositionFilter(f);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-2 text-xs font-medium capitalize transition-colors ${
                  dispositionFilter === f
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">
            <Search className="mr-1 inline h-3 w-3" />
            Search
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Patient name, email, or invoice #..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      {/* Error Banner */}
      {errorMsg && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMsg}
          <button
            onClick={() => setErrorMsg(null)}
            className="ml-3 font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : payments.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <Receipt className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No payments found for this period</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Patient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Description
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Sales Rep
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payments.map((p) => {
                  const state = getRowState(p.id);
                  const isDispositioned = !!p.disposition;
                  const isSaving = savingId === p.id;
                  const isSuccess = successId === p.id;
                  const description =
                    p.description ||
                    p.invoiceItems.map((i) => i.description).join(', ') ||
                    '—';

                  return (
                    <tr
                      key={p.id}
                      className={`transition-colors ${
                        isSuccess
                          ? 'bg-green-50'
                          : isDispositioned
                            ? 'bg-gray-50/50'
                            : 'hover:bg-gray-50/50'
                      }`}
                    >
                      {/* Date */}
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                        {formatDate(p.paidAt)}
                      </td>

                      {/* Patient */}
                      <td className="px-4 py-3">
                        {p.patient ? (
                          <div>
                            <p className="font-medium text-gray-900">
                              {p.patient.firstName} {p.patient.lastName}
                            </p>
                            <p className="text-xs text-gray-400">{p.patient.email}</p>
                          </div>
                        ) : (
                          <span className="text-gray-400">Unknown</span>
                        )}
                      </td>

                      {/* Description */}
                      <td className="max-w-[200px] truncate px-4 py-3 text-gray-600">
                        <span title={description}>{description}</span>
                        {p.isRebill && (
                          <span className="ml-2 inline-flex rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            Rebill
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCents(p.amount)}
                      </td>

                      {/* Commission Type */}
                      <td className="px-4 py-3">
                        {isDispositioned ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              p.disposition!.commissionType === 'NEW'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {p.disposition!.commissionType === 'NEW'
                              ? 'New (8%)'
                              : 'Recurring (1%)'}
                            {' — '}
                            {formatCents(p.disposition!.commissionAmountCents)}
                          </span>
                        ) : (
                          <select
                            value={state.commissionType}
                            onChange={(e) =>
                              updateRowState(p.id, {
                                commissionType: e.target.value as 'NEW' | 'RECURRING',
                              })
                            }
                            className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="NEW">New Sale (8%)</option>
                            <option value="RECURRING">Recurring (1%)</option>
                          </select>
                        )}
                      </td>

                      {/* Sales Rep */}
                      <td className="px-4 py-3">
                        {isDispositioned ? (
                          <span className="text-sm font-medium text-gray-700">
                            {p.disposition!.salesRep.firstName} {p.disposition!.salesRep.lastName}
                          </span>
                        ) : (
                          <select
                            value={state.salesRepId || ''}
                            onChange={(e) =>
                              updateRowState(p.id, {
                                salesRepId: e.target.value ? parseInt(e.target.value, 10) : null,
                              })
                            }
                            className="w-full min-w-[160px] rounded-lg border border-gray-300 px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          >
                            <option value="">Select rep...</option>
                            {reps.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.firstName} {r.lastName}
                                {r.role ? ` (${r.role.toLowerCase().replace('_', ' ')})` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-center">
                        {isDispositioned ? (
                          <CheckCircle2 className="mx-auto h-5 w-5 text-green-500" />
                        ) : (
                          <button
                            onClick={() => handleDisposition(p.id)}
                            disabled={isSaving || !state.salesRepId}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <DollarSign className="h-3.5 w-3.5" />
                            )}
                            Assign
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Commission Rate Legend */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Commission Rates
        </h3>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />
            <span className="text-gray-700">
              <strong>New Sale:</strong> 8% of payment amount
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-full bg-blue-500" />
            <span className="text-gray-700">
              <strong>Recurring / Existing:</strong> 1% of payment amount
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
