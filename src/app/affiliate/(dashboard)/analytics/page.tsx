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
      className="bg-white rounded-2xl p-5"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 text-sm mb-1">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          {change !== undefined && (
            <div className="flex items-center gap-1 mt-1">
              {change >= 0 ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
              <span className={`text-xs font-medium ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatPercent(change)}
              </span>
              {changeLabel && <span className="text-xs text-gray-400">{changeLabel}</span>}
            </div>
          )}
        </div>
        <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
      </div>
    </motion.div>
  );
}

// Custom Tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-100">
      <p className="text-sm font-medium text-gray-900 mb-1">{formatDate(label)}</p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm" style={{ color: entry.color }}>
          {entry.name}: {entry.name.includes('Revenue') || entry.name.includes('Commission')
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
  const [activeChart, setActiveChart] = useState<'conversions' | 'revenue' | 'commission'>('conversions');

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
        const [trendsRes, summaryRes, dashboardRes, refCodeStatsRes, trafficRes] = await Promise.all([
          fetch(`/api/affiliate/trends?from=${dateRange.from}&to=${dateRange.to}&granularity=day`, {
            credentials: 'include',
          }),
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
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/affiliate"
                className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-2 text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
              <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
            </div>

            {/* Date Range Selector */}
            <div className="relative">
              <button
                onClick={() => setShowDatePicker(!showDatePicker)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <Calendar className="w-4 h-4" />
                {DATE_PRESETS[selectedPreset].label}
                <ChevronDown className="w-4 h-4" />
              </button>

              {showDatePicker && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-20">
                  {DATE_PRESETS.map((preset, index) => (
                    <button
                      key={preset.label}
                      onClick={() => {
                        setSelectedPreset(index);
                        setShowDatePicker(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                        selectedPreset === index ? 'text-gray-900 font-medium bg-gray-50' : 'text-gray-600'
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

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
            iconBg="bg-purple-50"
            iconColor="text-purple-500"
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
          className="bg-white rounded-2xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Performance Trends</h2>
            <div className="flex gap-2">
              {(['conversions', 'revenue', 'commission'] as const).map((chart) => (
                <button
                  key={chart}
                  onClick={() => setActiveChart(chart)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
                  <Bar dataKey="conversions" name="Conversions" fill="#10B981" radius={[4, 4, 0, 0]} />
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
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Ref Code Performance - Enhanced */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white rounded-2xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Ref Code Performance</h2>
              <Link
                href="/affiliate/links"
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                Manage Links <ExternalLink className="w-3 h-3" />
              </Link>
            </div>

            {refCodeStats.length > 0 ? (
              <div className="space-y-3">
                {refCodeStats.slice(0, 5).map((ref, index) => (
                  <div key={ref.refCode} className="p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium ${
                          index === 0 ? 'bg-amber-100 text-amber-700' :
                          index === 1 ? 'bg-gray-200 text-gray-700' :
                          index === 2 ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{ref.refCode}</p>
                            {ref.isNew && (
                              <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
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
                        <p className="font-semibold text-gray-900">{formatCurrency(ref.commissionCents)}</p>
                        <div className="flex items-center justify-end gap-1 text-xs">
                          {ref.trend >= 0 ? (
                            <TrendingUp className="w-3 h-3 text-green-500" />
                          ) : (
                            <TrendingDown className="w-3 h-3 text-red-500" />
                          )}
                          <span className={ref.trend >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {Math.abs(ref.trend).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    {/* Mini funnel visualization */}
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-100">
                      <div className="text-center">
                        <p className="text-lg font-semibold text-blue-600">{formatNumber(ref.clicks)}</p>
                        <p className="text-xs text-gray-500">Clicks</p>
                      </div>
                      <div className="text-center relative">
                        <p className="text-lg font-semibold text-green-600">{formatNumber(ref.conversions)}</p>
                        <p className="text-xs text-gray-500">Conversions</p>
                        <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-300">→</span>
                      </div>
                      <div className="text-center relative">
                        <p className="text-lg font-semibold text-purple-600">{ref.conversionRate.toFixed(1)}%</p>
                        <p className="text-xs text-gray-500">Conv. Rate</p>
                        <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-gray-300">→</span>
                      </div>
                    </div>
                  </div>
                ))}
                {refCodeStats.length > 5 && (
                  <p className="text-xs text-center text-gray-400 pt-2">
                    And {refCodeStats.length - 5} more codes...
                  </p>
                )}
              </div>
            ) : summary?.refCodes && summary.refCodes.length > 0 ? (
              <div className="space-y-3">
                {summary.refCodes.slice(0, 5).map((ref) => (
                  <div key={ref.refCode} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-3">
                      <LinkIcon className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="font-medium text-gray-900">{ref.refCode}</p>
                        <p className="text-xs text-gray-500">{ref.description || 'No description'}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 text-center pt-2">
                  Performance data will appear as your codes get used
                </p>
              </div>
            ) : (
              <div className="text-center py-8">
                <LinkIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
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
            className="bg-white rounded-2xl p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Traffic Sources</h2>

            {trafficSources.length > 0 ? (
              <div className="space-y-3">
                {trafficSources.map((source) => (
                  <div key={source.source} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                      {source.source.toLowerCase().includes('mobile') ? (
                        <Smartphone className="w-4 h-4 text-gray-500" />
                      ) : source.source.toLowerCase().includes('desktop') ? (
                        <Monitor className="w-4 h-4 text-gray-500" />
                      ) : (
                        <Globe className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-900">{source.source}</span>
                        <span className="text-sm text-gray-500">{source.percentage.toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{ width: `${source.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Globe className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 mb-1">Traffic analytics coming soon</p>
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
          className="bg-white rounded-2xl p-6"
        >
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Commission Breakdown</h2>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-amber-50 rounded-xl">
              <p className="text-amber-700 text-sm font-medium mb-1">Pending</p>
              <p className="text-2xl font-semibold text-amber-900">
                {formatCurrency(summary?.summary.commissionPendingCents || 0)}
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {summary?.summary.pendingCount || 0} transactions
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-xl">
              <p className="text-blue-700 text-sm font-medium mb-1">Approved</p>
              <p className="text-2xl font-semibold text-blue-900">
                {formatCurrency(summary?.summary.commissionApprovedCents || 0)}
              </p>
              <p className="text-xs text-blue-600 mt-1">
                {summary?.summary.approvedCount || 0} transactions
              </p>
            </div>
            <div className="p-4 bg-green-50 rounded-xl">
              <p className="text-green-700 text-sm font-medium mb-1">Paid</p>
              <p className="text-2xl font-semibold text-green-900">
                {formatCurrency(summary?.summary.commissionPaidCents || 0)}
              </p>
              <p className="text-xs text-green-600 mt-1">
                {summary?.summary.paidCount || 0} transactions
              </p>
            </div>
            <div className="p-4 bg-red-50 rounded-xl">
              <p className="text-red-700 text-sm font-medium mb-1">Reversed</p>
              <p className="text-2xl font-semibold text-red-900">
                {formatCurrency(summary?.summary.commissionReversedCents || 0)}
              </p>
              <p className="text-xs text-red-600 mt-1">
                {summary?.summary.reversedCount || 0} transactions
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
