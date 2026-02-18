'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Users,
  CreditCard,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Calendar,
  ChevronRight,
  Loader2,
  FileText,
  Activity,
  Wallet,
  Clock,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface KPIData {
  grossRevenue: number;
  netRevenue: number;
  mrr: number;
  arr: number;
  activeSubscriptions: number;
  churnRate: number;
  averageOrderValue: number;
  outstandingInvoices: number;
  outstandingAmount: number;
  pendingPayouts: number;
  disputeRate: number;
  periodGrowth: number;
  mrrGrowth: number;
}

interface RecentActivity {
  id: number;
  type: 'payment' | 'invoice' | 'subscription' | 'refund' | 'payout';
  description: string;
  amount: number;
  status: string;
  timestamp: string;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatCurrencyFull = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
};

const formatPercentage = (value: number) => {
  const formatted = Math.abs(value).toFixed(1);
  return value >= 0 ? `+${formatted}%` : `-${formatted}%`;
};

export default function FinanceOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<KPIData | null>(null);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [syncingFromStripe, setSyncingFromStripe] = useState(false);
  const [syncingPayments, setSyncingPayments] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadData = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);

      try {
        const token =
          localStorage.getItem('auth-token') ||
          localStorage.getItem('super_admin-token') ||
          localStorage.getItem('admin-token') ||
          localStorage.getItem('token');

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        // Fetch KPIs from the finance metrics endpoint
        const [metricsRes, activityRes] = await Promise.all([
          apiFetch(`/api/finance/metrics?range=${dateRange}`, {
            credentials: 'include',
            headers,
          }),
          apiFetch('/api/finance/activity?limit=10', {
            credentials: 'include',
            headers,
          }),
        ]);

        if (metricsRes.ok) {
          const data = await metricsRes.json();
          setKpis(data);
        }

        if (activityRes.ok) {
          const data = await activityRes.json();
          setRecentActivity(data.activities || []);
        }

        setLastUpdated(new Date());
      } catch (error) {
        console.error('Failed to load finance data:', error);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [dateRange]
  );

  const syncFromStripe = useCallback(async () => {
    setSyncingFromStripe(true);
    setSyncMessage(null);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');
      const res = await apiFetch('/api/finance/sync-subscriptions', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSyncMessage(data.message || 'Subscriptions synced from Stripe.');
        loadData(true);
      } else {
        const detail = data.details ? ` ${data.details}` : '';
        setSyncMessage((data.error || 'Sync failed.') + detail);
      }
    } catch (e) {
      setSyncMessage('Request failed.');
    } finally {
      setSyncingFromStripe(false);
    }
  }, [loadData]);

  const syncPaymentsFromStripe = useCallback(async () => {
    setSyncingPayments(true);
    setSyncMessage(null);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('admin-token') ||
        localStorage.getItem('token');
      const res = await apiFetch('/api/finance/sync-payments', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sinceDate: '2026-02-01' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        setSyncMessage(data.message || 'Payments synced from Stripe.');
        loadData(true);
      } else {
        const detail = data.results ? ` (${data.results.failed || 0} failed)` : '';
        setSyncMessage((data.error || 'Payment sync failed.') + detail);
      }
    } catch {
      setSyncMessage('Payment sync request failed.');
    } finally {
      setSyncingPayments(false);
    }
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadData();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const kpiCards = [
    {
      label: 'Gross Revenue',
      value: formatCurrency(kpis?.grossRevenue || 0),
      change: kpis?.periodGrowth || 0,
      icon: DollarSign,
      color: 'emerald',
      href: '/admin/finance/revenue',
    },
    {
      label: 'Net Revenue',
      value: formatCurrency(kpis?.netRevenue || 0),
      change: kpis?.periodGrowth || 0,
      icon: TrendingUp,
      color: 'blue',
      href: '/admin/finance/revenue',
    },
    {
      label: 'MRR',
      value: formatCurrency(kpis?.mrr || 0),
      change: kpis?.mrrGrowth || 0,
      icon: Activity,
      color: 'purple',
      href: '/admin/finance/subscriptions',
    },
    {
      label: 'ARR',
      value: formatCurrency(kpis?.arr || 0),
      change: kpis?.mrrGrowth || 0,
      icon: Calendar,
      color: 'indigo',
      href: '/admin/finance/subscriptions',
    },
    {
      label: 'Active Subscriptions',
      value: (kpis?.activeSubscriptions || 0).toLocaleString(),
      change: 0,
      icon: Users,
      color: 'cyan',
      href: '/admin/finance/subscriptions',
    },
    {
      label: 'Churn Rate',
      value: `${(kpis?.churnRate || 0).toFixed(1)}%`,
      change: 0,
      icon: TrendingDown,
      color: kpis?.churnRate && kpis.churnRate > 5 ? 'red' : 'green',
      href: '/admin/finance/subscriptions',
      invertTrend: true,
    },
    {
      label: 'Avg Order Value',
      value: formatCurrencyFull(kpis?.averageOrderValue || 0),
      change: 0,
      icon: CreditCard,
      color: 'amber',
      href: '/admin/finance/revenue',
    },
    {
      label: 'Outstanding Invoices',
      value: (kpis?.outstandingInvoices || 0).toString(),
      subValue: formatCurrency(kpis?.outstandingAmount || 0),
      icon: FileText,
      color: 'orange',
      href: '/admin/finance/invoices',
    },
  ];

  const quickActions = [
    { label: 'View Revenue Analytics', href: '/admin/finance/revenue', icon: TrendingUp },
    { label: 'Incoming Payments', href: '/admin/finance/incoming-payments', icon: CreditCard },
    { label: 'Patient Payment Insights', href: '/admin/finance/patients', icon: Users },
    { label: 'Reconcile Payments', href: '/admin/finance/reconciliation', icon: RefreshCcw },
    { label: 'Generate Reports', href: '/admin/finance/reports', icon: FileText },
    { label: 'Manage Payouts', href: '/admin/finance/payouts', icon: Wallet },
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'payment':
        return <CreditCard className="h-4 w-4 text-green-500" />;
      case 'invoice':
        return <FileText className="h-4 w-4 text-blue-500" />;
      case 'subscription':
        return <Users className="h-4 w-4 text-[var(--brand-primary)]" />;
      case 'refund':
        return <RefreshCcw className="h-4 w-4 text-orange-500" />;
      case 'payout':
        return <Wallet className="h-4 w-4 text-emerald-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  // Explicit color class map so purple/indigo resolve to brand CSS vars
  const kpiColorClasses: Record<string, { bg: string; text: string }> = {
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600' },
    purple: { bg: 'bg-[var(--brand-primary-light)]', text: 'text-[var(--brand-primary)]' },
    indigo: { bg: 'bg-[var(--brand-primary-light)]', text: 'text-[var(--brand-primary)]' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600' },
    red: { bg: 'bg-red-50', text: 'text-red-600' },
    green: { bg: 'bg-green-50', text: 'text-green-600' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-600' },
    orange: { bg: 'bg-orange-50', text: 'text-orange-600' },
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Financial Overview</h2>
          <p className="mt-1 text-sm text-gray-500">
            {lastUpdated && <>Last updated: {lastUpdated.toLocaleTimeString()}</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date Range Selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {(['7d', '30d', '90d', 'ytd'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {range === 'ytd' ? 'YTD' : range.toUpperCase()}
              </button>
            ))}
          </div>

          {/* Sync from Stripe - backfill subscriptions so MRR/ARR match Stripe */}
          <button
            onClick={syncFromStripe}
            disabled={syncingFromStripe}
            className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${syncingFromStripe ? 'animate-spin' : ''}`} />
            Sync from Stripe
          </button>
          {/* Sync Payments - backfill missed payments from Stripe since 02/01 */}
          <button
            onClick={syncPaymentsFromStripe}
            disabled={syncingPayments}
            className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <CreditCard className={`h-4 w-4 ${syncingPayments ? 'animate-pulse' : ''}`} />
            {syncingPayments ? 'Syncing Payments...' : 'Sync Payments'}
          </button>
          {/* Refresh Button */}
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>
      {syncMessage && (
        <p
          className={`text-sm ${syncMessage.startsWith('Synced') || syncMessage.startsWith('Subscriptions') || syncMessage.startsWith('Payments') ? 'text-emerald-600' : 'text-amber-600'}`}
        >
          {syncMessage}
        </p>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi, index) => {
          const Icon = kpi.icon;
          const change = kpi.change ?? 0;
          const isPositive = kpi.invertTrend ? change <= 0 : change >= 0;

          return (
            <Link
              key={index}
              href={kpi.href}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className={`rounded-lg p-2 ${kpiColorClasses[kpi.color]?.bg ?? `bg-${kpi.color}-50`}`}>
                  <Icon className={`h-5 w-5 ${kpiColorClasses[kpi.color]?.text ?? `text-${kpi.color}-600`}`} />
                </div>
                {change !== 0 && (
                  <span
                    className={`flex items-center text-sm font-medium ${
                      isPositive ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="mr-0.5 h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="mr-0.5 h-4 w-4" />
                    )}
                    {formatPercentage(change)}
                  </span>
                )}
              </div>
              <div className="mt-4">
                <h3 className="text-2xl font-bold text-gray-900">{kpi.value}</h3>
                {kpi.subValue && <p className="text-sm text-gray-500">{kpi.subValue}</p>}
                <p className="mt-1 text-sm text-gray-500">{kpi.label}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-200 p-5">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <Link
              href="/admin/finance/invoices"
              className="text-sm font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-100">
            {recentActivity.length === 0 ? (
              <div className="p-8 text-center">
                <Activity className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                <p className="text-gray-500">No recent activity</p>
                <p className="mt-1 text-sm text-gray-400">Transactions will appear here</p>
              </div>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="p-4 transition-colors hover:bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getActivityIcon(activity.type)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">
                        {activity.description}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            activity.status === 'completed' || activity.status === 'succeeded'
                              ? 'bg-green-100 text-green-700'
                              : activity.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {activity.status}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <Clock className="h-3 w-3" />
                          {activity.timestamp}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-semibold ${
                          activity.type === 'refund' ? 'text-red-600' : 'text-gray-900'
                        }`}
                      >
                        {activity.type === 'refund' ? '-' : '+'}
                        {formatCurrencyFull(activity.amount || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions & Alerts */}
        <div className="space-y-6">
          {/* Alerts */}
          {(kpis?.outstandingInvoices || 0) > 0 && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-orange-500" />
                <div>
                  <h4 className="text-sm font-semibold text-orange-800">
                    {kpis?.outstandingInvoices} Outstanding Invoices
                  </h4>
                  <p className="mt-1 text-sm text-orange-600">
                    {formatCurrency(kpis?.outstandingAmount || 0)} in pending payments
                  </p>
                  <Link
                    href="/admin/finance/invoices?status=open"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-orange-700 hover:text-orange-800"
                  >
                    Review invoices
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {(kpis?.churnRate || 0) > 5 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <TrendingDown className="mt-0.5 h-5 w-5 text-red-500" />
                <div>
                  <h4 className="text-sm font-semibold text-red-800">High Churn Alert</h4>
                  <p className="mt-1 text-sm text-red-600">
                    Monthly churn rate is {kpis?.churnRate.toFixed(1)}%
                  </p>
                  <Link
                    href="/admin/finance/patients?filter=at-risk"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-red-700 hover:text-red-800"
                  >
                    View at-risk patients
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-4">
              <h3 className="text-base font-semibold text-gray-900">Quick Actions</h3>
            </div>
            <div className="p-2">
              {quickActions.map((action, index) => {
                const Icon = action.icon;
                return (
                  <Link
                    key={index}
                    href={action.href}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{action.label}</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-gray-400" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
