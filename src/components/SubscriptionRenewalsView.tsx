'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  CreditCard,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  Users,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  ExternalLink,
  RefreshCw,
  Filter,
  CloudDownload,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ─── Types ───────────────────────────────────────────────────────────────────

type IntervalCategory = 'monthly' | 'quarterly' | 'semiannual' | 'annual';
type PaymentStatusFilter = 'all' | 'succeeded' | 'failed' | 'pending';

interface LastPayment {
  id: number;
  status: string;
  amount: number;
  date: string;
  failureReason: string | null;
}

interface RenewalSubscription {
  id: number;
  patientId: number;
  patientName: string;
  patientEmail: string;
  planName: string;
  planDescription: string;
  amount: number;
  currency: string;
  interval: string | null;
  intervalCount: number;
  intervalCategory: IntervalCategory;
  status: string;
  startDate: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string | null;
  failedAttempts: number;
  stripeSubscriptionId: string | null;
  lastPayment: LastPayment | null;
}

interface RenewalsSummary {
  monthly: number;
  quarterly: number;
  semiannual: number;
  annual: number;
  total: number;
  pastDue: number;
  upcomingNext7Days: number;
}

interface RenewalsResponse {
  renewals: RenewalSubscription[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: RenewalsSummary;
}

interface SubscriptionRenewalsViewProps {
  userRole: 'admin' | 'super_admin' | 'provider' | 'staff';
  patientLinkPrefix?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INTERVAL_TABS = [
  { key: 'all' as const, label: 'All' },
  { key: 'monthly' as const, label: 'Monthly' },
  { key: 'quarterly' as const, label: '3 Month' },
  { key: 'semiannual' as const, label: '6 Month' },
  { key: 'annual' as const, label: '12 Month' },
];

const PAYMENT_STATUS_OPTIONS: { key: PaymentStatusFilter; label: string }[] = [
  { key: 'all', label: 'All Payments' },
  { key: 'succeeded', label: 'Successful' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Pending' },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function isValidBillingDate(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const ts = new Date(dateStr).getTime();
  return !isNaN(ts) && ts > 946684800000; // after 2000-01-01
}

function formatDate(dateStr: string | null): string {
  if (!isValidBillingDate(dateStr)) return '—';
  return new Date(dateStr!).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateRelative(dateStr: string | null): { text: string; urgency: 'overdue' | 'soon' | 'upcoming' | 'none' } {
  if (!isValidBillingDate(dateStr)) return { text: 'No date', urgency: 'none' };
  const date = new Date(dateStr!);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, urgency: 'overdue' };
  if (diffDays === 0) return { text: 'Today', urgency: 'soon' };
  if (diffDays <= 3) return { text: `In ${diffDays}d`, urgency: 'soon' };
  if (diffDays <= 7) return { text: `In ${diffDays}d`, urgency: 'upcoming' };
  return { text: formatDate(dateStr), urgency: 'none' };
}

function getIntervalLabel(category: IntervalCategory): string {
  switch (category) {
    case 'monthly': return 'Monthly';
    case 'quarterly': return '3 Month';
    case 'semiannual': return '6 Month';
    case 'annual': return '12 Month';
  }
}

function getPaymentStatusBadge(
  payment: LastPayment | null,
  subStatus: string,
  nextBillingDate: string | null,
  failedAttempts: number,
) {
  if (subStatus === 'PAST_DUE') {
    return {
      label: 'Past Due',
      bg: 'bg-red-100',
      text: 'text-red-700',
      icon: XCircle,
    };
  }

  if (!payment) {
    if (failedAttempts > 0) {
      return { label: 'Payment Failed', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
    }
    if (isValidBillingDate(nextBillingDate) && new Date(nextBillingDate!) < new Date()) {
      return { label: 'Overdue', bg: 'bg-orange-100', text: 'text-orange-700', icon: AlertTriangle };
    }
    return {
      label: 'No Payment',
      bg: 'bg-gray-100',
      text: 'text-gray-600',
      icon: Clock,
    };
  }

  switch (payment.status) {
    case 'SUCCEEDED':
      return { label: 'Paid', bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle2 };
    case 'FAILED':
      return { label: 'Failed', bg: 'bg-red-100', text: 'text-red-700', icon: XCircle };
    case 'PENDING':
    case 'PROCESSING':
      return { label: 'Pending', bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock };
    case 'REFUNDED':
      return { label: 'Refunded', bg: 'bg-purple-100', text: 'text-purple-700', icon: RefreshCw };
    default:
      return { label: payment.status, bg: 'bg-gray-100', text: 'text-gray-600', icon: Clock };
  }
}

function getSubscriptionStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return { label: 'Active', bg: 'bg-green-100', text: 'text-green-700' };
    case 'PAST_DUE':
      return { label: 'Past Due', bg: 'bg-orange-100', text: 'text-orange-700' };
    default:
      return { label: status, bg: 'bg-gray-100', text: 'text-gray-600' };
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubscriptionRenewalsView({
  userRole,
  patientLinkPrefix = '/admin/patients',
}: SubscriptionRenewalsViewProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RenewalsResponse | null>(null);
  const [intervalTab, setIntervalTab] = useState<'all' | IntervalCategory>('all');
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<'nextBillingDate' | 'amount' | 'patientName' | 'createdAt'>('nextBillingDate');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showPaymentFilter, setShowPaymentFilter] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [intervalTab, paymentFilter, debouncedSearch]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        interval: intervalTab,
        paymentStatus: paymentFilter,
        page: String(page),
        limit: '50',
        sortBy,
        sortOrder,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);

      const response = await apiFetch(`/api/subscriptions/renewals?${params.toString()}`);
      if (response.ok) {
        const json: RenewalsResponse = await response.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load subscription renewals:', err);
    } finally {
      setLoading(false);
    }
  }, [intervalTab, paymentFilter, page, sortBy, sortOrder, debouncedSearch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder(column === 'nextBillingDate' ? 'asc' : 'desc');
    }
  };

  const handleSyncFromStripe = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await apiFetch('/api/finance/sync-subscriptions', { method: 'POST' });
      const json = await response.json();
      if (response.ok) {
        setSyncResult(`Synced ${json.synced}, canceled ${json.canceled}, skipped ${json.skipped}${json.errors ? `, errors ${json.errors}` : ''}`);
        fetchData();
      } else {
        setSyncResult(`Sync failed: ${json.error || 'Unknown error'}`);
      }
    } catch (err) {
      setSyncResult('Sync failed: Network error');
    } finally {
      setSyncing(false);
    }
  };

  const summary = data?.summary;
  const renewals = data?.renewals || [];
  const totalPages = data?.totalPages || 1;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subscription Renewals</h2>
          <p className="mt-1 text-sm text-gray-500">
            Track upcoming rebills, payment statuses, and patient refill schedules
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(userRole === 'admin' || userRole === 'super_admin') && (
            <button
              onClick={handleSyncFromStripe}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 shadow-sm transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              <CloudDownload className={`h-4 w-4 ${syncing ? 'animate-pulse' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync from Stripe'}
            </button>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Result Banner */}
      {syncResult && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          syncResult.startsWith('Sync failed')
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-green-200 bg-green-50 text-green-700'
        }`}>
          {syncResult}
          <button onClick={() => setSyncResult(null)} className="ml-3 font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <SummaryCard
            icon={Users}
            label="Total Active"
            value={summary.total}
            color="emerald"
          />
          <SummaryCard
            icon={Calendar}
            label="Renewing in 7 Days"
            value={summary.upcomingNext7Days}
            color="blue"
            highlight={summary.upcomingNext7Days > 0}
          />
          <SummaryCard
            icon={AlertTriangle}
            label="Past Due"
            value={summary.pastDue}
            color="orange"
            highlight={summary.pastDue > 0}
          />
          <SummaryCard
            icon={CreditCard}
            label="Monthly / 3mo / 6mo / 12mo"
            value={`${summary.monthly} / ${summary.quarterly} / ${summary.semiannual} / ${summary.annual}`}
            color="purple"
            isText
          />
        </div>
      )}

      {/* Interval Tabs */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-4 pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Tabs */}
            <div className="flex gap-1 overflow-x-auto">
              {INTERVAL_TABS.map((tab) => {
                const count =
                  tab.key === 'all'
                    ? summary?.total
                    : summary?.[tab.key as keyof RenewalsSummary];

                return (
                  <button
                    key={tab.key}
                    onClick={() => setIntervalTab(tab.key)}
                    className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      intervalTab === tab.key
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {typeof count === 'number' && (
                      <span className="ml-1.5 rounded-full bg-white/60 px-1.5 py-0.5 text-xs">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search + Payment Filter */}
            <div className="flex items-center gap-2 pb-3 sm:pb-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search patient or plan..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-56 rounded-lg border border-gray-200 py-2 pl-9 pr-4 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              {/* Payment Status Filter */}
              <div className="relative">
                <button
                  onClick={() => setShowPaymentFilter(!showPaymentFilter)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    paymentFilter !== 'all'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Filter className="h-3.5 w-3.5" />
                  {paymentFilter === 'all' ? 'Payment' : PAYMENT_STATUS_OPTIONS.find((o) => o.key === paymentFilter)?.label}
                </button>
                {showPaymentFilter && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowPaymentFilter(false)} />
                    <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                      {PAYMENT_STATUS_OPTIONS.map((opt) => (
                        <button
                          key={opt.key}
                          onClick={() => {
                            setPaymentFilter(opt.key);
                            setShowPaymentFilter(false);
                          }}
                          className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                            paymentFilter === opt.key
                              ? 'bg-emerald-50 font-medium text-emerald-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
            </div>
          ) : renewals.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center">
              <Users className="mb-3 h-12 w-12 text-gray-300" />
              <p className="text-gray-500">No subscriptions found</p>
              <p className="mt-1 text-sm text-gray-400">Try adjusting your filters</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <SortableHeader
                    label="Patient"
                    sortKey="patientName"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Plan
                  </th>
                  <SortableHeader
                    label="Amount"
                    sortKey="amount"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Interval
                  </th>
                  <SortableHeader
                    label="Next Rebill"
                    sortKey="nextBillingDate"
                    currentSort={sortBy}
                    sortOrder={sortOrder}
                    onSort={handleSort}
                  />
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Payment Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {renewals.map((sub) => {
                  const rebillRelative = formatDateRelative(sub.nextBillingDate);
                  const paymentBadge = getPaymentStatusBadge(sub.lastPayment, sub.status, sub.nextBillingDate, sub.failedAttempts);
                  const statusBadge = getSubscriptionStatusBadge(sub.status);
                  const PaymentIcon = paymentBadge.icon;

                  return (
                    <tr key={sub.id} className="transition-colors hover:bg-gray-50/50">
                      {/* Patient */}
                      <td className="px-4 py-3">
                        <a
                          href={`${patientLinkPrefix}/${sub.patientId}`}
                          className="group"
                        >
                          <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-700">
                            {sub.patientName || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500">{sub.patientEmail}</p>
                        </a>
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3">
                        <p className="text-sm text-gray-900">{sub.planName}</p>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900">
                          {formatCurrency(sub.amount)}
                        </p>
                      </td>

                      {/* Interval */}
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          {getIntervalLabel(sub.intervalCategory)}
                        </span>
                      </td>

                      {/* Rebill Date */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm text-gray-900">{formatDate(sub.nextBillingDate)}</span>
                          <span
                            className={`text-xs font-medium ${
                              rebillRelative.urgency === 'overdue'
                                ? 'text-red-600'
                                : rebillRelative.urgency === 'soon'
                                  ? 'text-orange-600'
                                  : rebillRelative.urgency === 'upcoming'
                                    ? 'text-blue-600'
                                    : 'text-gray-400'
                            }`}
                          >
                            {rebillRelative.text}
                          </span>
                        </div>
                      </td>

                      {/* Payment Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${paymentBadge.bg} ${paymentBadge.text}`}
                          >
                            <PaymentIcon className="h-3 w-3" />
                            {paymentBadge.label}
                          </span>
                          {sub.lastPayment?.failureReason && (
                            <span className="text-xs text-red-500" title={sub.lastPayment.failureReason}>
                              {sub.lastPayment.failureReason.length > 30
                                ? sub.lastPayment.failureReason.slice(0, 30) + '...'
                                : sub.lastPayment.failureReason}
                            </span>
                          )}
                          {sub.failedAttempts > 0 && (
                            <span className="text-xs text-orange-500">
                              {sub.failedAttempts} failed attempt{sub.failedAttempts !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Subscription Status */}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
                        >
                          {statusBadge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <a
                            href={`${patientLinkPrefix}/${sub.patientId}`}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            title="View Patient"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                          {sub.stripeSubscriptionId && (
                            <a
                              href={`https://dashboard.stripe.com/subscriptions/${sub.stripeSubscriptionId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                              title="View in Stripe"
                            >
                              <CreditCard className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && renewals.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, data?.total || 0)} of{' '}
              {data?.total || 0}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-gray-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-gray-200 p-2 text-gray-500 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon,
  label,
  value,
  color,
  highlight = false,
  isText = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  color: 'emerald' | 'blue' | 'orange' | 'purple';
  highlight?: boolean;
  isText?: boolean;
}) {
  const colorMap = {
    emerald: { bg: 'bg-emerald-50', icon: 'text-emerald-600', ring: 'ring-emerald-200' },
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', ring: 'ring-blue-200' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', ring: 'ring-orange-200' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', ring: 'ring-purple-200' },
  };
  const c = colorMap[color];

  return (
    <div
      className={`rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
        highlight ? `border-${color}-200 ring-1 ${c.ring}` : 'border-gray-200'
      }`}
    >
      <div className={`mb-3 inline-flex rounded-lg p-2 ${c.bg}`}>
        <Icon className={`h-5 w-5 ${c.icon}`} />
      </div>
      {isText ? (
        <p className="text-lg font-bold text-gray-900">{value}</p>
      ) : (
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      )}
      <p className="mt-1 text-sm text-gray-500">{label}</p>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  currentSort,
  sortOrder,
  onSort,
}: {
  label: string;
  sortKey: 'nextBillingDate' | 'amount' | 'patientName' | 'createdAt';
  currentSort: string;
  sortOrder: 'asc' | 'desc';
  onSort: (key: typeof sortKey) => void;
}) {
  const isActive = currentSort === sortKey;

  return (
    <th className="px-4 py-3">
      <button
        onClick={() => onSort(sortKey)}
        className="group inline-flex items-center gap-1 text-xs font-medium uppercase text-gray-500"
      >
        {label}
        <ArrowUpDown
          className={`h-3 w-3 transition-colors ${
            isActive ? 'text-emerald-600' : 'text-gray-300 group-hover:text-gray-400'
          }`}
        />
        {isActive && (
          <span className="text-emerald-600">{sortOrder === 'asc' ? '↑' : '↓'}</span>
        )}
      </button>
    </th>
  );
}
