'use client';

/**
 * Affiliate Analytics Page
 *
 * Enterprise-grade performance analytics with:
 * - Performance overview cards with trends
 * - Time-series charts (clicks, conversions, revenue)
 * - Date range selector with presets
 * - Traffic source breakdown
 * - Ref code performance
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  MousePointer,
  ShoppingCart,
  DollarSign,
  Percent,
  Calendar,
  ChevronDown,
  RefreshCw,
  ExternalLink,
  Globe,
  Smartphone,
  Monitor,
  Link as LinkIcon,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// Types
interface TrendData {
  date: string;
  conversions: number | string;
  revenueCents: number | null;
  commissionCents: number | null;
}

interface SummaryData {
  summary: {
    conversionsCount: number;
    revenueTotalCents: number;
    commissionPendingCents: number;
    commissionApprovedCents: number;
    commissionPaidCents: number;
    commissionReversedCents: number;
    pendingCount: number;
    approvedCount: number;
    paidCount: number;
    reversedCount: number;
  };
  refCodes: Array<{ refCode: string; description: string | null; createdAt: string }>;
}

interface DashboardData {
  performance: {
    clicks: number;
    conversions: number;
    conversionRate: number;
    avgOrderValue: number;
  };
  earnings: {
    thisMonth: number;
    lastMonth: number;
    monthOverMonthChange: number;
  };
}

interface RefCodeStats {
  refCode: string;
  description: string | null;
  clicks: number;
  conversions: number;
  revenueCents: number;
  commissionCents: number;
  conversionRate: number;
  trend: number;
  isNew: boolean;
}

interface TrafficSource {
  source: string;
  clicks: number;
  conversions: number;
  percentage: number;
}

// Date range presets
const DATE_PRESETS = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'YTD', days: -1 }, // Special case
];

// Formatters
const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat('en-US').format(num);
};

const formatPercent = (value: number) => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Stat Card Component
function StatCard({
  title,
  value,
  change,
  changeLabel,
  icon: Icon,
  iconBg,
  iconColor,
}: {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: typeof TrendingUp;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-white p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-1 text-sm text-gray-500">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {change !== undefined && (
            <div className="mt-1 flex items-center gap-1">
              {change >= 0 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
              <span
                className={`text-xs font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}
              >
                {formatPercent(change)}
              </span>
              {changeLabel && <span className="text-xs text-gray-400">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className={`h-10 w-10 ${iconBg} flex items-center justify-center rounded-xl`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </motion.div>
  );
}

// Custom Tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 shadow-lg">
      <p className="mb-1 text-sm font-medium text-gray-900">{formatDate(label)}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}:{' '}
          {entry.name.includes('Revenue') || entry.name.includes('Commission')
            ? formatCurrency(entry.value)
            : formatNumber(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function AffiliateAnalyticsPage() {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(2); // 30 days default
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [refCodeStats, setRefCodeStats] = useState<RefCodeStats[]>([]);
  const [trafficSources, setTrafficSources] = useState<TrafficSource[]>([]);
  const [activeChart, setActiveChart] = useState<'conversions' | 'revenue' | 'commission'>(
    'conversions'
  );

  // Calculate date range based on preset
  const dateRange = useMemo(() => {
    const to = new Date();
    let from: Date;

    const preset = DATE_PRESETS[selectedPreset];
    if (preset.days === -1) {
      // YTD
      from = new Date(to.getFullYear(), 0, 1);
    } else if (preset.days === 0) {
      // Today
      from = new Date(to);
      from.setHours(0, 0, 0, 0);
    } else {
      from = new Date(to.getTime() - preset.days * 24 * 60 * 60 * 1000);
    }

    return {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
    };
  }, [selectedPreset]);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [trendsRes, summaryRes, dashboardRes, refCodeStatsRes, trafficRes] =
          await Promise.all([
            fetch(
              `/api/affiliate/trends?from=${dateRange.from}&to=${dateRange.to}&granularity=day`,
              {
                credentials: 'include',
              }
            ),
            fetch(`/api/affiliate/summary?from=${dateRange.from}&to=${dateRange.to}`, {
              credentials: 'include',
            }),
            fetch('/api/affiliate/dashboard', { credentials: 'include' }),
            fetch(`/api/affiliate/ref-codes/stats?from=${dateRange.from}&to=${dateRange.to}`, {
              credentials: 'include',
            }).catch(() => null), // Optional endpoint
            fetch(`/api/affiliate/traffic-sources?from=${dateRange.from}&to=${dateRange.to}`, {
              credentials: 'include',
            }).catch(() => null), // Optional endpoint
          ]);

        if (trendsRes.ok) {
          const data = await trendsRes.json();
          setTrends(data.trends || []);
        }

        if (summaryRes.ok) {
          const data = await summaryRes.json();
          setSummary(data);
        }

        if (dashboardRes.ok) {
          const data = await dashboardRes.json();
          setDashboard(data);
        }

        if (refCodeStatsRes?.ok) {
          const data = await refCodeStatsRes.json();
          setRefCodeStats(data.refCodes || []);
        }

        if (trafficRes?.ok) {
          const data = await trafficRes.json();
          setTrafficSources(data.sources || []);
        }
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setError('Failed to load analytics data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateRange]);

  // Process chart data
  const chartData = useMemo(() => {
    return trends.map((t) => ({
      date: t.date,
      conversions: typeof t.conversions === 'number' ? t.conversions : 0,
      revenue: (t.revenueCents || 0) / 100,
      commission: (t.commissionCents || 0) / 100,
    }));
  }, [trends]);

  // Calculate period totals
  const periodTotals = useMemo(() => {
    if (!summary) return null;
    const s = summary.summary;
    return {
      clicks: dashboard?.performance.clicks || 0,
      conversions: s.conversionsCount,
      revenue: s.revenueTotalCents,
      commission: s.commissionPendingCents + s.commissionApprovedCents + s.commissionPaidCents,
      conversionRate: dashboard?.performance.conversionRate || 0,
    };
  }, [summary, dashboard]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/affiliate"
                className="mb-2 inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Link>
              <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
            </div>

            {/* Date Range Selector */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              >
                <Calendar className="h-4 w-4" />
                {DATE_PRESETS[selectedPreset].label}
                <ChevronDown className="h-4 w-4" />
              </button>

              {showDatePicker && (
                <div className="absolute right-0 z-20 mt-2 w-48 rounded-xl border border-gray-100 bg-white py-2 shadow-lg">
                  {DATE_PRESETS.map((preset, index) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setSelectedPreset(index);
                        setShowDatePicker(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                        selectedPreset === index
                          ? 'bg-gray-50 font-medium text-gray-900'
                          : 'text-gray-600'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard
            title="Clicks"
            value={formatNumber(periodTotals?.clicks || 0)}
            icon={MousePointer}
            iconBg="bg-blue-50"
            iconColor="text-blue-500"
          />
          <StatCard
            title="Conversions"
            value={formatNumber(periodTotals?.conversions || 0)}
            icon={ShoppingCart}
            iconBg="bg-green-50"
            iconColor="text-green-500"
          />
          <StatCard
            title="Revenue"
            value={formatCurrency(periodTotals?.revenue || 0)}
            icon={DollarSign}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
          />
          <StatCard
            title="Earnings"
            value={formatCurrency(periodTotals?.commission || 0)}
            change={dashboard?.earnings.monthOverMonthChange}
            changeLabel="vs last period"
            icon={TrendingUp}
            iconBg="bg-amber-50"
            iconColor="text-amber-500"
          />
          <StatCard
            title="Conv. Rate"
            value={`${(periodTotals?.conversionRate || 0).toFixed(1)}%`}
            icon={Percent}
            iconBg="bg-pink-50"
            iconColor="text-pink-500"
          />
        </div>

        {/* Main Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white p-6"
        >
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Performance Trends</h2>
            <div className="flex gap-2">
              {(['conversions', 'revenue', 'commission'] as const).map((chart) => (
                <button
                  key={chart}
                  onClick={() => setActiveChart(chart)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeChart === chart
                      ? 'bg-gray-900 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {chart.charAt(0).toUpperCase() + chart.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart === 'conversions' ? (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar
                    dataKey="conversions"
                    name="Conversions"
                    fill="#10B981"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              ) : activeChart === 'revenue' ? (
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="Revenue"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              ) : (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="commission"
                    name="Commission"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Two Column Layout */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Ref Code Performance - Enhanced */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="rounded-2xl bg-white p-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Ref Code Performance</h2>
              <Link
                href="/affiliate/links"
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                Manage Links <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {refCodeStats.length > 0 ? (
              <div className="space-y-3">
                {refCodeStats.slice(0, 5).map((ref, index) => (
                  <div key={ref.refCode} className="rounded-xl bg-gray-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium ${
                            index === 0
                              ? 'bg-amber-100 text-amber-700'
                              : index === 1
                                ? 'bg-gray-200 text-gray-700'
                                : index === 2
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{ref.refCode}</p>
                            {ref.isNew && (
                              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                New
                              </span>
                            )}
                          </div>
                          {ref.description && (
                            <p className="text-xs text-gray-400">{ref.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          {formatCurrency(ref.commissionCents)}
                        </p>
                        <div className="flex items-center justify-end gap-1 text-xs">
                          {ref.trend >= 0 ? (
                            <TrendingUp className="h-3 w-3 text-green-500" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-red-500" />
                          )}
                          <span className={ref.trend >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {Math.abs(ref.trend).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Mini funnel visualization */}
                    <div className="mt-2 grid grid-cols-3 gap-2 border-t border-gray-100 pt-2">
                      <div className="text-center">
                        <p className="text-lg font-semibold text-blue-600">
                          {formatNumber(ref.clicks)}
                        </p>
                        <p className="text-xs text-gray-500">Clicks</p>
                      </div>
                      <div className="relative text-center">
                        <p className="text-lg font-semibold text-green-600">
                          {formatNumber(ref.conversions)}
                        </p>
                        <p className="text-xs text-gray-500">Conversions</p>
                        <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-300">
                          →
                        </span>
                      </div>
                      <div className="relative text-center">
                        <p className="text-lg font-semibold text-emerald-600">
                          {ref.conversionRate.toFixed(1)}%
                        </p>
                        <p className="text-xs text-gray-500">Conv. Rate</p>
                        <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-300">
                          →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {refCodeStats.length > 5 && (
                  <p className="pt-2 text-center text-xs text-gray-400">
                    And {refCodeStats.length - 5} more codes...
                  </p>
                )}
              </div>
            ) : summary?.refCodes && summary.refCodes.length > 0 ? (
              <div className="space-y-3">
                {summary.refCodes.slice(0, 5).map((ref) => (
                  <div
                    key={ref.refCode}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <LinkIcon className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{ref.refCode}</p>
                        <p className="text-xs text-gray-500">
                          {ref.description || 'No description'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="pt-2 text-center text-xs text-gray-400">
                  Performance data will appear as your codes get used
                </p>
              </div>
            ) : (
              <div className="py-8 text-center">
                <LinkIcon className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-gray-500">No ref codes yet</p>
                <Link href="/affiliate/links" className="text-sm text-blue-600 hover:underline">
                  Create your first link
                </Link>
              </div>
            )}
          </motion.div>

          {/* Traffic Sources */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="rounded-2xl bg-white p-6"
          >
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Traffic Sources</h2>

            {trafficSources.length > 0 ? (
              <div className="space-y-3">
                {trafficSources.map((source) => (
                  <div key={source.source} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100">
                      {source.source.toLowerCase().includes('mobile') ? (
                        <Smartphone className="h-4 w-4 text-gray-500" />
                      ) : source.source.toLowerCase().includes('desktop') ? (
                        <Monitor className="h-4 w-4 text-gray-500" />
                      ) : (
                        <Globe className="h-4 w-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{source.source}</span>
                        <span className="text-sm text-gray-500">
                          {source.percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-green-500 transition-all"
                          style={{ width: `${source.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Globe className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="mb-1 text-gray-500">Traffic analytics coming soon</p>
                <p className="text-xs text-gray-400">
                  See where your visitors come from and which devices they use
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Commission Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white p-6"
        >
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Commission Breakdown</h2>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="mb-1 text-sm font-medium text-amber-700">Pending</p>
              <p className="text-2xl font-semibold text-amber-900">
                {formatCurrency(summary?.summary.commissionPendingCents || 0)}
              </p>
              <p className="mt-1 text-xs text-amber-600">
                {summary?.summary.pendingCount || 0} transactions
              </p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="mb-1 text-sm font-medium text-blue-700">Approved</p>
              <p className="text-2xl font-semibold text-blue-900">
                {formatCurrency(summary?.summary.commissionApprovedCents || 0)}
              </p>
              <p className="mt-1 text-xs text-blue-600">
                {summary?.summary.approvedCount || 0} transactions
              </p>
            </div>
            <div className="rounded-xl bg-green-50 p-4">
              <p className="mb-1 text-sm font-medium text-green-700">Paid</p>
              <p className="text-2xl font-semibold text-green-900">
                {formatCurrency(summary?.summary.commissionPaidCents || 0)}
              </p>
              <p className="mt-1 text-xs text-green-600">
                {summary?.summary.paidCount || 0} transactions
              </p>
            </div>
            <div className="rounded-xl bg-red-50 p-4">
              <p className="mb-1 text-sm font-medium text-red-700">Reversed</p>
              <p className="text-2xl font-semibold text-red-900">
                {formatCurrency(summary?.summary.commissionReversedCents || 0)}
              </p>
              <p className="mt-1 text-xs text-red-600">
                {summary?.summary.reversedCount || 0} transactions
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
