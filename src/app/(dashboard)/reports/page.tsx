'use client';

import { useState, useEffect, useCallback } from 'react';
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
    currency: 'USD'
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

// Stat Card Component
function StatCard({ 
  title, 
  value, 
  subValue, 
  trend, 
  icon,
  color = 'blue'
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
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
    orange: 'bg-orange-50 text-orange-600 border-orange-200',
    red: 'bg-red-50 text-red-600 border-red-200',
  };

  return (
    <div className={`rounded-xl border p-6 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-2xl">{icon}</span>
        {trend !== undefined && (
          <span className={`text-sm font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        )}
      </div>
      <h3 className="text-sm font-medium opacity-80">{title}</h3>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {subValue && <p className="text-sm opacity-70 mt-1">{subValue}</p>}
    </div>
  );
}

// Progress Bar Component
function ProgressBar({ value, max, label, color = 'blue' }: { value: number; max: number; label: string; color?: string }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  
  return (
    <div className="mb-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-gray-500">{value}</span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
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
  const [activeTab, setActiveTab] = useState<'overview' | 'patients' | 'revenue' | 'subscriptions' | 'payments'>('overview');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ range: dateRange.range });
      if (dateRange.range === 'custom' && dateRange.startDate && dateRange.endDate) {
        params.set('startDate', dateRange.startDate);
        params.set('endDate', dateRange.endDate);
      }

      const response = await fetch(`/api/reports?${params}`);
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
      range: dateRange.range
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
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-10 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-4 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>
              ))}
            </div>
            <div className="h-96 bg-gray-200 rounded-xl"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">📊 Reports & Analytics</h1>
              <p className="text-gray-500 mt-1">Comprehensive clinic performance metrics</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Date Range Selector */}
              <select
                value={dateRange.range}
                onChange={(e) => setDateRange({ ...dateRange, range: e.target.value })}
                className="px-4 py-2 border rounded-lg bg-white text-sm font-medium focus:ring-2 focus:ring-blue-500"
              >
                {DATE_RANGES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              {dateRange.range === 'custom' && (
                <>
                  <input
                    type="date"
                    value={dateRange.startDate || ''}
                    onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                  <span className="text-gray-400">to</span>
                  <input
                    type="date"
                    value={dateRange.endDate || ''}
                    onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                    className="px-3 py-2 border rounded-lg text-sm"
                  />
                </>
              )}

              {/* Export Button */}
              <div className="relative group">
                <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition">
                  Export ↓
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  <button
                    onClick={() => handleExport('csv', 'comprehensive')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-t-lg"
                  >
                    📄 Export as CSV
                  </button>
                  <button
                    onClick={() => handleExport('json', 'comprehensive')}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 rounded-b-lg"
                  >
                    📋 Export as JSON
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-6 -mb-px">
            {[
              { id: 'overview', label: '📈 Overview' },
              { id: 'patients', label: '👥 Patients' },
              { id: 'revenue', label: '💰 Revenue' },
              { id: 'subscriptions', label: '🔄 Subscriptions' },
              { id: 'payments', label: '💳 Payments' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
                  activeTab === tab.id
                    ? 'bg-gray-50 text-blue-600 border-t border-x'
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
      <div className="max-w-7xl mx-auto px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {activeTab === 'overview' && report && (
          <OverviewTab report={report} />
        )}

        {activeTab === 'patients' && report?.patients && (
          <PatientsTab metrics={report.patients} />
        )}

        {activeTab === 'revenue' && report?.revenue && (
          <RevenueTab metrics={report.revenue} />
        )}

        {activeTab === 'subscriptions' && report?.subscriptions && (
          <SubscriptionsTab metrics={report.subscriptions} />
        )}

        {activeTab === 'payments' && report?.payments && (
          <PaymentsTab metrics={report.payments} />
        )}
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
          icon="👥"
          color="blue"
        />
        <StatCard
          title="Total Revenue"
          value={formatCurrency(revenue?.totalRevenue || 0)}
          subValue={`${formatCurrency(revenue?.recurringRevenue || 0)} recurring`}
          trend={revenue?.revenueGrowthRate}
          icon="💰"
          color="green"
        />
        <StatCard
          title="Monthly Recurring Revenue"
          value={formatCurrency(subscriptions?.monthlyRecurringRevenue || 0)}
          subValue={`${subscriptions?.totalActiveSubscriptions || 0} active subscriptions`}
          icon="🔄"
          color="purple"
        />
        <StatCard
          title="Payment Success Rate"
          value={`${payments?.paymentSuccessRate || 0}%`}
          subValue={`${payments?.successfulPayments || 0} of ${payments?.totalPayments || 0} payments`}
          icon="✅"
          color="orange"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Revenue Trend</h3>
          <div className="h-64 flex items-end gap-1">
            {revenue?.revenueByDay?.slice(-14).map((day, i) => {
              const maxRevenue = Math.max(...(revenue.revenueByDay?.map(d => d.amount) || [1]));
              const height = (day.amount / maxRevenue) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-blue-500 rounded-t hover:bg-blue-600 transition cursor-pointer"
                    style={{ height: `${height}%`, minHeight: '4px' }}
                    title={`${day.date}: ${formatCurrency(day.amount)}`}
                  />
                  <span className="text-xs text-gray-400 mt-1 rotate-45 origin-left">
                    {day.date.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Subscription Distribution */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Patients by Treatment Month</h3>
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
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">💳 Yesterday&apos;s Payments</h3>
          {payments?.yesterdayPayments?.length ? (
            <div className="space-y-3">
              {payments.yesterdayPayments.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
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
            <p className="text-gray-500 text-center py-8">No payments yesterday</p>
          )}
        </div>

        {/* Recent Cancellations */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">⚠️ Recent Cancellations</h3>
          {subscriptions?.recentCancellations?.length ? (
            <div className="space-y-3">
              {subscriptions.recentCancellations.slice(0, 5).map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{c.patientName}</p>
                    <p className="text-sm text-gray-500">{c.monthsActive} months active</p>
                  </div>
                  <p className="text-sm text-gray-400">{formatDate(c.cancelledAt)}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No recent cancellations 🎉</p>
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
        <StatCard title="Total Patients" value={metrics.totalPatients} icon="👥" color="blue" />
        <StatCard title="New Patients" value={metrics.newPatients} trend={metrics.patientGrowthRate} icon="✨" color="green" />
        <StatCard title="Active Patients" value={metrics.activePatients} icon="💪" color="purple" />
        <StatCard title="Retention Rate" value={`${metrics.patientRetentionRate}%`} icon="🎯" color="orange" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Patients by Source</h3>
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

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Patient Activity</h3>
          <div className="flex items-center justify-center h-48">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="96" cy="96" r="80" fill="none" stroke="#e5e7eb" strokeWidth="16" />
                <circle
                  cx="96" cy="96" r="80" fill="none" stroke="#3b82f6" strokeWidth="16"
                  strokeDasharray={`${(metrics.activePatients / metrics.totalPatients) * 502} 502`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold">{Math.round((metrics.activePatients / metrics.totalPatients) * 100)}%</span>
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
        <StatCard title="Total Revenue" value={formatCurrency(metrics.totalRevenue)} trend={metrics.revenueGrowthRate} icon="💰" color="green" />
        <StatCard title="Recurring Revenue" value={formatCurrency(metrics.recurringRevenue)} icon="🔄" color="blue" />
        <StatCard title="One-Time Revenue" value={formatCurrency(metrics.oneTimeRevenue)} icon="💵" color="purple" />
        <StatCard title="Avg Order Value" value={formatCurrency(metrics.averageOrderValue)} icon="📊" color="orange" />
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Revenue by Treatment</h3>
        <div className="grid grid-cols-2 gap-4">
          {Object.entries(metrics.revenueByTreatment)
            .sort(([, a], [, b]) => b - a)
            .map(([treatment, amount]) => (
              <div key={treatment} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <span className="font-medium">{treatment}</span>
                <span className="text-green-600 font-semibold">{formatCurrency(amount)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Subscriptions Tab
function SubscriptionsTab({ metrics }: { metrics: SubscriptionMetrics }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-6">
        <StatCard title="Active Subscriptions" value={metrics.totalActiveSubscriptions} icon="✅" color="green" />
        <StatCard title="Paused" value={metrics.totalPausedSubscriptions} icon="⏸️" color="orange" />
        <StatCard title="Cancelled" value={metrics.totalCancelledSubscriptions} icon="❌" color="red" />
        <StatCard title="Churn Rate" value={`${metrics.churnRate}%`} icon="📉" color="purple" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">MRR & ARR</h3>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Monthly Recurring Revenue</p>
              <p className="text-3xl font-bold text-blue-700">{formatCurrency(metrics.monthlyRecurringRevenue)}</p>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-600 font-medium">Annual Recurring Revenue</p>
              <p className="text-3xl font-bold text-purple-700">{formatCurrency(metrics.annualRecurringRevenue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Patients by Treatment Month</h3>
          <div className="space-y-2">
            {Object.entries(metrics.subscriptionsByMonth)
              .sort(([a], [b]) => parseInt(a) - parseInt(b))
              .map(([month, count]) => (
                <div key={month} className="flex items-center justify-between py-2">
                  <span className="font-medium">Month {month}</span>
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-semibold">
                    {count} patients
                  </span>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Paused Subscriptions */}
      {metrics.recentPauses.length > 0 && (
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">⏸️ Paused Subscriptions</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
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
        <StatCard title="Total Payments" value={metrics.totalPayments} icon="💳" color="blue" />
        <StatCard title="Successful" value={metrics.successfulPayments} icon="✅" color="green" />
        <StatCard title="Failed" value={metrics.failedPayments} icon="❌" color="red" />
        <StatCard title="Success Rate" value={`${metrics.paymentSuccessRate}%`} icon="📊" color="purple" />
      </div>

      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Yesterday&apos;s Payments</h3>
        {metrics.yesterdayPayments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
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
                    <td className="py-3 font-semibold text-green-600">{formatCurrency(p.amount)}</td>
                    <td className="py-3 text-gray-400">{formatDateTime(p.paidAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No payments yesterday</p>
        )}
      </div>
    </div>
  );
}
