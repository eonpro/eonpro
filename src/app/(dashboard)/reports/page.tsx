'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import { useRouter } from 'next/navigation';

// Types
interface DateRange {
  range: string;
  startDate?: string;
  endDate?: string;
}

interface PatientMetrics {
  totalPatients: number;
  newPatients: number;
  activePatients: number;
  inactivePatients: number;
  patientGrowthRate: number;
  patientRetentionRate: number;
  patientsBySource: Record<string, number>;
}

interface RevenueMetrics {
  totalRevenue: number;
  recurringRevenue: number;
  oneTimeRevenue: number;
  averageOrderValue: number;
  projectedRevenue: number;
  revenueGrowthRate: number;
  revenueByDay: Array<{ date: string; amount: number }>;
  revenueByTreatment: Record<string, number>;
}

interface SubscriptionMetrics {
  totalActiveSubscriptions: number;
  totalPausedSubscriptions: number;
  totalCancelledSubscriptions: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  churnRate: number;
  retentionRate?: number;
  averageLTV?: number;
  medianLTV?: number;
  totalLTV?: number;
  patientsWithPayments?: number;
  churnedMrr?: number;
  newMrrInPeriod?: number;
  netMrrChange?: number;
  averageLifetimeBeforeChurnDays?: number;
  churnReasons?: Array<{
    reason: string;
    count: number;
    mrr: number;
    percentageOfTotal: number;
  }>;
  byMedication?: Array<{ medication: string; count: number; mrr: number; percentageOfTotal: number }>;
  byInterval?: Array<{ intervalLabel: string; count: number; mrr: number; percentageOfTotal: number }>;
  byMedicationAndInterval?: Array<{
    medication: string;
    intervalLabel: string;
    count: number;
    mrr: number;
  }>;
  subscriptionsByMonth: Record<number, number>;
  recentCancellations: Array<{
    patientName: string;
    cancelledAt: string;
    monthsActive: number;
  }>;
  recentPauses: Array<{
    patientName: string;
    pausedAt: string;
  }>;
}

interface PaymentMetrics {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  paymentSuccessRate: number;
  averagePaymentAmount: number;
  yesterdayPayments: Array<{
    patientName: string;
    amount: number;
    treatment: string;
    paidAt: string;
  }>;
}

interface Report {
  patients?: PatientMetrics;
  revenue?: RevenueMetrics;
  subscriptions?: SubscriptionMetrics;
  payments?: PaymentMetrics;
}

const DATE_RANGES = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_semester', label: 'This Semester' },
  { value: 'last_semester', label: 'Last Semester' },
  { value: 'this_year', label: 'This Year' },
  { value: 'last_year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// Stat Card Component
// SVG Icon component for StatCard
function StatIcon({ type }: { type: string }) {
  const icons: Record<string, JSX.Element> = {
    users: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
    ),
    dollar: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    refresh: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
    check: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    star: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
        />
      </svg>
    ),
    target: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    chart: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
    ),
    pause: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    x: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    trendDown: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
        />
      </svg>
    ),
    card: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
        />
      </svg>
    ),
    active: (
      <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
  };
  return icons[type] || icons.chart;
}

// Star-in-circle icon for interval badges (white star on colored circle)
function IntervalStarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6L12 2z"
        fill="white"
        fillRule="evenodd"
      />
    </svg>
  );
}

const INTERVAL_BADGE_STYLES: Record<
  string,
  { bg: string; text: string; circle: string }
> = {
  Monthly: { bg: 'bg-blue-100', text: 'text-blue-800', circle: 'bg-blue-500' },
  '3 months': { bg: 'bg-amber-100', text: 'text-amber-800', circle: 'bg-amber-500' },
  '6 months': { bg: 'bg-violet-100', text: 'text-violet-800', circle: 'bg-violet-500' },
  '12 months': { bg: 'bg-emerald-100', text: 'text-emerald-800', circle: 'bg-emerald-500' },
};

function IntervalBadge({ intervalLabel }: { intervalLabel: string }) {
  const style = INTERVAL_BADGE_STYLES[intervalLabel] || {
    bg: 'bg-gray-100',
    text: 'text-gray-800',
    circle: 'bg-gray-500',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span
        className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${style.circle}`}
      >
        <IntervalStarIcon className="h-3 w-3" />
      </span>
      {intervalLabel}
    </span>
  );
}

function StatCard({
  title,
  value,
  subValue,
  trend,
  icon,
  color = 'blue',
}: {
  title: string;
  value: string | number;
  subValue?: string;
  trend?: number;
  icon: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600 border-blue-200',
    green: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    purple: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)] border-[var(--brand-primary-medium)]',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };

  return (
    <div className={`rounded-xl border p-6 ${colorClasses[color]}`}>
      <div className="mb-4 flex items-center justify-between">
        <StatIcon type={icon} />
        {trend !== undefined && (
          <span
            className={`text-sm font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
          >
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium opacity-80">{title}</h3>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {subValue && <p className="mt-1 text-sm opacity-70">{subValue}</p>}
    </div>
  );
}

// Progress Bar Component
function ProgressBar({
  value,
  max,
  label,
  color = 'blue',
}: {
  value: number;
  max: number;
  label: string;
  color?: string;
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;

  return (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full bg-${color}-500 rounded-full transition-all duration-500`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Main Reports Page
export default function ReportsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>({ range: 'this_month' });
  const [activeTab, setActiveTab] = useState<
    'overview' | 'patients' | 'revenue' | 'subscriptions' | 'payments'
  >('overview');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ range: dateRange.range });
      if (dateRange.range === 'custom' && dateRange.startDate && dateRange.endDate) {
        params.set('startDate', dateRange.startDate);
        params.set('endDate', dateRange.endDate);
      }

      const response = await apiFetch(`/api/reports?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch report');
      }

      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExport = async (format: 'csv' | 'json', reportType: string) => {
    const params = new URLSearchParams({
      format,
      report: reportType,
      range: dateRange.range,
    });

    if (dateRange.range === 'custom' && dateRange.startDate && dateRange.endDate) {
      params.set('startDate', dateRange.startDate);
      params.set('endDate', dateRange.endDate);
    }

    window.open(`/api/reports/export?${params}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="mx-auto max-w-7xl">
          <div className="animate-pulse space-y-6">
            <div className="h-10 w-1/4 rounded bg-gray-200"></div>
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-xl bg-gray-200"></div>
              ))}
            </div>
            <div className="h-96 rounded-xl bg-gray-200"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-7xl px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Reports &amp; Analytics</h1>
              <p className="mt-1 text-gray-500">Comprehensive clinic performance metrics</p>
            </div>

            <div className="flex items-center gap-4">
              {/* Date Range Selector */}
              <select
                value={dateRange.range}
                onChange={(e) => setDateRange({ ...dateRange, range: e.target.value })}
                className="rounded-lg border bg-white px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500"
              >
                {DATE_RANGES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>

              {dateRange.range === 'custom' && (
                <>
                  <input
                    type="date"
                    value={dateRange.startDate || ''}
                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                    className="rounded-lg border px-3 py-2 text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate || ''}
                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                    className="rounded-lg border px-3 py-2 text-sm"
                  />
                </>
              )}

              {/* Export Button */}
              <div className="group relative">
                <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800">
                  Export ↓
                </button>
                <div className="invisible absolute right-0 mt-2 w-56 rounded-lg border bg-white opacity-0 shadow-lg transition-all group-hover:visible group-hover:opacity-100">
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-gray-400">
                    Full report
                  </div>
                  <button
                    onClick={() => handleExport('csv', 'comprehensive')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    📄 Comprehensive CSV
                  </button>
                  <button
                    onClick={() => handleExport('json', 'comprehensive')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    📋 Comprehensive JSON
                  </button>
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-gray-400">
                    Membership lists
                  </div>
                  <button
                    onClick={() => handleExport('csv', 'memberships_active')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    Active memberships (CSV)
                  </button>
                  <button
                    onClick={() => handleExport('csv', 'memberships_cancelled')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    Cancelled memberships (CSV)
                  </button>
                  <button
                    onClick={() => handleExport('csv', 'memberships_paused')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    Paused memberships (CSV)
                  </button>
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-gray-400">
                    Analytics
                  </div>
                  <button
                    onClick={() => handleExport('csv', 'membership_analytics')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    Membership analytics (churn, LTV, MRR)
                  </button>
                  <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-gray-400">
                    By type
                  </div>
                  <button
                    onClick={() => handleExport('csv', 'subscriptions_by_medication')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    By medication (CSV)
                  </button>
                  <button
                    onClick={() => handleExport('csv', 'subscriptions_by_interval')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    By interval (CSV)
                  </button>
                  <button
                    onClick={() => handleExport('csv', 'subscriptions_by_medication_and_interval')}
                    className="w-full rounded-b-lg px-4 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    By medication × interval (CSV)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="-mb-px mt-6 flex gap-1">
            {[
              { id: 'overview', label: '📈 Overview' },
              { id: 'patients', label: 'Patients' },
              { id: 'revenue', label: 'Revenue' },
              { id: 'subscriptions', label: 'Subscriptions' },
              { id: 'payments', label: 'Payments' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'border-x border-t bg-gray-50 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-8 py-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {activeTab === 'overview' && report && <OverviewTab report={report} />}

        {activeTab === 'patients' && report?.patients && <PatientsTab metrics={report.patients} />}

        {activeTab === 'revenue' && report?.revenue && <RevenueTab metrics={report.revenue} />}

        {activeTab === 'subscriptions' && report?.subscriptions && (
          <SubscriptionsTab
            metrics={report.subscriptions}
            onExportMemberships={handleExport}
          />
        )}

        {activeTab === 'payments' && report?.payments && <PaymentsTab metrics={report.payments} />}
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ report }: { report: Report }) {
  const { patients, revenue, subscriptions, payments } = report;

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-6">
        <StatCard
          title="Total Patients"
          value={patients?.totalPatients || 0}
          subValue={`${patients?.newPatients || 0} new this period`}
          trend={patients?.patientGrowthRate}
          icon="users"
          color="blue"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(revenue?.totalRevenue || 0)}
          subValue={`${formatCurrency(revenue?.recurringRevenue || 0)} recurring`}
          trend={revenue?.revenueGrowthRate}
          icon="dollar"
          color="green"
        />
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(subscriptions?.monthlyRecurringRevenue || 0)}
          subValue={`${subscriptions?.totalActiveSubscriptions || 0} active subscriptions`}
          icon="refresh"
          color="purple"
        />
        <StatCard
          title="Payment Success Rate"
          value={`${payments?.paymentSuccessRate || 0}%`}
          subValue={`${payments?.successfulPayments || 0} of ${payments?.totalPayments || 0} payments`}
          icon="check"
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Revenue Trend</h3>
          <div className="flex h-64 items-end gap-1">
            {revenue?.revenueByDay?.slice(-14).map((day, i) => {
              const maxRevenue = Math.max(...(revenue.revenueByDay?.map((d) => d.amount) || [1]));
              const height = (day.amount / maxRevenue) * 100;
              return (
                <div key={i} className="flex flex-1 flex-col items-center">
                  <div
                    className="w-full cursor-pointer rounded-t bg-blue-500 transition hover:bg-blue-600"
                    style={{ height: `${height}%`, minHeight: '4px' }}
                    title={`${day.date}: ${formatCurrency(day.amount)}`}
                  />
                  <span className="mt-1 origin-left rotate-45 text-xs text-gray-400">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription Distribution */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Patients by Treatment Month</h3>
          <div className="space-y-3">
            {Object.entries(subscriptions?.subscriptionsByMonth || {})
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .slice(0, 6)
              .map(([month, count]) => (
                <ProgressBar
                  key={month}
                  label={`Month ${month}`}
                  value={count as number}
                  max={subscriptions?.totalActiveSubscriptions || 1}
                  color="purple"
                />
              ))}
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="grid grid-cols-2 gap-6">
        {/* Yesterday's Payments */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Yesterday&apos;s Payments</h3>
          {payments?.yesterdayPayments?.length ? (
            <div className="space-y-3">
              {payments.yesterdayPayments.slice(0, 5).map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{p.patientName}</p>
                    <p className="text-sm text-gray-500">{p.treatment}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-green-600">{formatCurrency(p.amount)}</p>
                    <p className="text-xs text-gray-400">{formatDateTime(p.paidAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-gray-500">No payments yesterday</p>
          )}
        </div>

        {/* Recent Cancellations */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Recent Cancellations</h3>
          {subscriptions?.recentCancellations?.length ? (
            <div className="space-y-3">
              {subscriptions.recentCancellations.slice(0, 5).map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between border-b py-2 last:border-0"
                >
                  <div>
                    <p className="font-medium">{c.patientName}</p>
                    <p className="text-sm text-gray-500">{c.monthsActive} months active</p>
                  </div>
                  <p className="text-sm text-gray-400">{formatDate(c.cancelledAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-gray-500">No recent cancellations</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Patients Tab
function PatientsTab({ metrics }: { metrics: PatientMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Total Patients" value={metrics.totalPatients} icon="users" color="blue" />
        <StatCard
          title="New Patients"
          value={metrics.newPatients}
          trend={metrics.patientGrowthRate}
          icon="star"
          color="green"
        />
        <StatCard
          title="Active Patients"
          value={metrics.activePatients}
          icon="active"
          color="purple"
        />
        <StatCard
          title="Retention Rate"
          value={`${metrics.patientRetentionRate}%`}
          icon="target"
          color="orange"
        />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Patients by Source</h3>
          <div className="space-y-3">
            {Object.entries(metrics.patientsBySource)
              .sort(([, a], [, b]) => b - a)
              .map(([source, count]) => (
                <ProgressBar
                  key={source}
                  label={source.charAt(0).toUpperCase() + source.slice(1)}
                  value={count}
                  max={metrics.newPatients || 1}
                  color="blue"
                />
              ))}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Patient Activity</h3>
          <div className="flex h-48 items-center justify-center">
            <div className="relative h-48 w-48">
              <svg className="h-full w-full -rotate-90 transform">
                <circle cx="96" cy="96" r="80" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                <circle
                  cx="96"
                  cy="96"
                  r="80"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="16"
                  strokeDasharray={`${(metrics.activePatients / metrics.totalPatients) * 502} 502`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">
                  {Math.round((metrics.activePatients / metrics.totalPatients) * 100)}%
                </span>
                <span className="text-sm text-gray-500">Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Revenue Tab
function RevenueTab({ metrics }: { metrics: RevenueMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(metrics.totalRevenue)}
          trend={metrics.revenueGrowthRate}
          icon="dollar"
          color="green"
        />
        <StatCard
          title="Recurring Revenue"
          value={formatCurrency(metrics.recurringRevenue)}
          icon="refresh"
          color="blue"
        />
        <StatCard
          title="One-Time Revenue"
          value={formatCurrency(metrics.oneTimeRevenue)}
          icon="dollar"
          color="purple"
        />
        <StatCard
          title="Avg Order Value"
          value={formatCurrency(metrics.averageOrderValue)}
          icon="chart"
          color="orange"
        />
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Revenue by Treatment</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(metrics.revenueByTreatment)
            .sort(([, a], [, b]) => b - a)
            .map(([treatment, amount]) => (
              <div
                key={treatment}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-4"
              >
                <span className="font-medium">{treatment}</span>
                <span className="font-semibold text-green-600">{formatCurrency(amount)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Subscriptions Tab
function SubscriptionsTab({
  metrics,
  onExportMemberships,
}: {
  metrics: SubscriptionMetrics;
  onExportMemberships?: (format: 'csv' | 'json', reportType: string) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Membership list exports */}
      {onExportMemberships && (
        <div className="rounded-xl border bg-white p-4">
          <h3 className="mb-3 font-semibold text-gray-900">Export membership lists</h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'memberships_active')}
              className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100"
            >
              Active memberships (CSV)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'memberships_cancelled')}
              className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
            >
              Cancelled memberships (CSV)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'memberships_paused')}
              className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              Paused memberships (CSV)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'membership_analytics')}
              className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
            >
              Full analytics (churn, LTV, MRR)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'subscriptions_by_medication')}
              className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              By medication (CSV)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'subscriptions_by_interval')}
              className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              By interval (CSV)
            </button>
            <button
              type="button"
              onClick={() => onExportMemberships('csv', 'subscriptions_by_medication_and_interval')}
              className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
            >
              By medication × interval (CSV)
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-6">
        <StatCard
          title="Active Subscriptions"
          value={metrics.totalActiveSubscriptions}
          icon="check"
          color="green"
        />
        <StatCard
          title="Paused"
          value={metrics.totalPausedSubscriptions}
          icon="pause"
          color="orange"
        />
        <StatCard
          title="Cancelled"
          value={metrics.totalCancelledSubscriptions}
          icon="x"
          color="red"
        />
        <StatCard
          title="Churn Rate"
          value={`${metrics.churnRate}%`}
          icon="trendDown"
          color="purple"
        />
      </div>

      {/* LTV & Retention row */}
      {(metrics.retentionRate != null || metrics.averageLTV != null) && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {metrics.retentionRate != null && (
            <StatCard
              title="Retention Rate"
              value={`${metrics.retentionRate}%`}
              icon="target"
              color="green"
            />
          )}
          {metrics.averageLTV != null && (
            <StatCard
              title="Average LTV"
              value={formatCurrency(metrics.averageLTV)}
              icon="dollar"
              color="blue"
            />
          )}
          {metrics.medianLTV != null && (
            <StatCard
              title="Median LTV"
              value={formatCurrency(metrics.medianLTV)}
              icon="chart"
              color="purple"
            />
          )}
          {metrics.totalLTV != null && (
            <StatCard
              title="Total LTV"
              value={formatCurrency(metrics.totalLTV)}
              icon="dollar"
              color="green"
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">MRR & ARR</h3>
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-600">Monthly Recurring Revenue</p>
              <p className="text-3xl font-bold text-blue-700">
                {formatCurrency(metrics.monthlyRecurringRevenue)}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--brand-primary-light)] p-4">
              <p className="text-sm font-medium text-[var(--brand-primary)]">Annual Recurring Revenue</p>
              <p className="text-3xl font-bold text-[var(--brand-primary)]">
                {formatCurrency(metrics.annualRecurringRevenue)}
              </p>
            </div>
            {(metrics.churnedMrr != null || metrics.newMrrInPeriod != null) && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <p className="text-sm font-medium text-gray-700">MRR in period</p>
                {metrics.newMrrInPeriod != null && (
                  <p className="text-sm text-green-600">
                    New MRR: +{formatCurrency(metrics.newMrrInPeriod)}
                  </p>
                )}
                {metrics.churnedMrr != null && (
                  <p className="text-sm text-red-600">
                    Churned MRR: −{formatCurrency(metrics.churnedMrr)}
                  </p>
                )}
                {metrics.netMrrChange != null && (
                  <p className="text-sm font-semibold text-gray-900">
                    Net MRR change: {metrics.netMrrChange >= 0 ? '+' : ''}{formatCurrency(metrics.netMrrChange)}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Patients by Treatment Month</h3>
          <div className="space-y-2">
            {Object.entries(metrics.subscriptionsByMonth)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([month, count]) => (
                <div key={month} className="flex items-center justify-between py-2">
                  <span className="font-medium">Month {month}</span>
                  <span className="rounded-full bg-[var(--brand-primary-light)] px-3 py-1 text-sm font-semibold text-[var(--brand-primary)]">
                    {count} patients
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* By medication */}
      {metrics.byMedication && metrics.byMedication.length > 0 && (
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Subscriptions by medication</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">Medication</th>
                  <th className="pb-2 text-right">Count</th>
                  <th className="pb-2 text-right">MRR</th>
                  <th className="pb-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byMedication.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium text-gray-900">{r.medication}</td>
                    <td className="py-2 text-right">{r.count}</td>
                    <td className="py-2 text-right text-green-600">{formatCurrency(r.mrr)}</td>
                    <td className="py-2 text-right text-gray-500">{r.percentageOfTotal}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By interval */}
      {metrics.byInterval && metrics.byInterval.length > 0 && (
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Subscriptions by interval</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">Interval</th>
                  <th className="pb-2 text-right">Count</th>
                  <th className="pb-2 text-right">MRR</th>
                  <th className="pb-2 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byInterval.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2">
                      <IntervalBadge intervalLabel={r.intervalLabel} />
                    </td>
                    <td className="py-2 text-right">{r.count}</td>
                    <td className="py-2 text-right text-green-600">{formatCurrency(r.mrr)}</td>
                    <td className="py-2 text-right text-gray-500">{r.percentageOfTotal}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By medication × interval */}
      {metrics.byMedicationAndInterval && metrics.byMedicationAndInterval.length > 0 && (
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Subscriptions by medication and interval</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-2">Medication</th>
                  <th className="pb-2">Interval</th>
                  <th className="pb-2 text-right">Count</th>
                  <th className="pb-2 text-right">MRR</th>
                </tr>
              </thead>
              <tbody>
                {metrics.byMedicationAndInterval.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium text-gray-900">{r.medication}</td>
                    <td className="py-2">
                      <IntervalBadge intervalLabel={r.intervalLabel} />
                    </td>
                    <td className="py-2 text-right">{r.count}</td>
                    <td className="py-2 text-right text-green-600">{formatCurrency(r.mrr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Average lifetime before churn & Churn reasons */}
      {(metrics.averageLifetimeBeforeChurnDays != null || (metrics.churnReasons && metrics.churnReasons.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metrics.averageLifetimeBeforeChurnDays != null && (
            <div className="rounded-xl border bg-white p-6">
              <h3 className="mb-2 font-semibold text-gray-900">Avg. lifetime before churn</h3>
              <p className="text-2xl font-bold text-gray-900">
                {metrics.averageLifetimeBeforeChurnDays} days
              </p>
              <p className="text-sm text-gray-500">
                Among subscriptions cancelled in the selected period
              </p>
            </div>
          )}
          {metrics.churnReasons && metrics.churnReasons.length > 0 && (
            <div className="rounded-xl border bg-white p-6">
              <h3 className="mb-4 font-semibold text-gray-900">Churn reasons (period)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2">Reason</th>
                      <th className="pb-2 text-right">Count</th>
                      <th className="pb-2 text-right">MRR lost</th>
                      <th className="pb-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.churnReasons.slice(0, 10).map((r, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 font-medium text-gray-900">{r.reason}</td>
                        <td className="py-2 text-right">{r.count}</td>
                        <td className="py-2 text-right text-red-600">{formatCurrency(r.mrr)}</td>
                        <td className="py-2 text-right text-gray-500">{r.percentageOfTotal}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Paused Subscriptions */}
      {metrics.recentPauses.length > 0 && (
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Paused Subscriptions</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-gray-500">
                  <th className="pb-3">Patient</th>
                  <th className="pb-3">Paused At</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentPauses.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 font-medium">{p.patientName}</td>
                    <td className="py-3 text-gray-500">{formatDate(p.pausedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Payments Tab
function PaymentsTab({ metrics }: { metrics: PaymentMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Total Payments" value={metrics.totalPayments} icon="card" color="blue" />
        <StatCard
          title="Successful"
          value={metrics.successfulPayments}
          icon="check"
          color="green"
        />
        <StatCard title="Failed" value={metrics.failedPayments} icon="x" color="red" />
        <StatCard
          title="Success Rate"
          value={`${metrics.paymentSuccessRate}%`}
          icon="chart"
          color="purple"
        />
      </div>

      <div className="rounded-xl border bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Yesterday&apos;s Payments</h3>
        {metrics.yesterdayPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-gray-500">
                  <th className="pb-3">Patient</th>
                  <th className="pb-3">Treatment</th>
                  <th className="pb-3">Amount</th>
                  <th className="pb-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {metrics.yesterdayPayments.map((p, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-3 font-medium">{p.patientName}</td>
                    <td className="py-3 text-gray-500">{p.treatment}</td>
                    <td className="py-3 font-semibold text-green-600">
                      {formatCurrency(p.amount)}
                    </td>
                    <td className="py-3 text-gray-400">{formatDateTime(p.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="py-8 text-center text-gray-500">No payments yesterday</p>
        )}
      </div>
    </div>
  );
}
