'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  DollarSign,
  Download,
  Calendar,
  Award,
  AlertTriangle,
  FileText,
  MousePointer,
  Target,
  Trophy,
  Medal,
  Crown,
} from 'lucide-react';

interface ReportData {
  overview: {
    totalAffiliates: number;
    activeAffiliates: number;
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    pendingPayoutCents: number;
  };
  topAffiliates: Array<{
    id: number;
    name: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  trends: Array<{
    date: string;
    conversions: number;
    revenueCents: number;
    commissionCents: number;
  }>;
  fraud: {
    openAlerts: number;
    criticalAlerts: number;
    confirmedFraudCents: number;
  };
}

interface LeaderboardEntry {
  rank: number;
  affiliateId: number;
  displayName: string;
  status: string;
  value: number;
  formattedValue: string;
  refCodes: string[];
  percentOfTotal: number;
}

interface LeaderboardData {
  metric: string;
  period: string;
  entries: LeaderboardEntry[];
  totals: {
    totalAffiliates: number;
    totalValue: number;
  };
}

type LeaderboardMetric = 'conversions' | 'revenue' | 'clicks' | 'conversionRate';

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export default function AffiliateReportsPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'ytd'>('30d');

  // Leaderboard state
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>('conversions');
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch(`/api/admin/affiliates/reports?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setData(await response.json());
      } else {
        // Show empty state instead of mock data
        setData({
          overview: {
            totalAffiliates: 0,
            activeAffiliates: 0,
            totalConversions: 0,
            totalRevenueCents: 0,
            totalCommissionCents: 0,
            pendingPayoutCents: 0,
          },
          topAffiliates: [],
          trends: [],
          fraud: {
            openAlerts: 0,
            criticalAlerts: 0,
            confirmedFraudCents: 0,
          },
        });
      }
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setLoading(false);
    }
  }, [period]);

  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch(
        `/api/admin/affiliates/leaderboard?metric=${leaderboardMetric}&period=${period}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.ok) {
        setLeaderboardData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [leaderboardMetric, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  const handleExport = (type: 'affiliates' | 'commissions' | '1099') => {
    if (!data) {
      alert('No data available to export. Please wait for data to load.');
      return;
    }

    let csvContent = '';
    let filename = '';

    if (type === 'affiliates') {
      // Export top affiliates data
      csvContent = 'Rank,Affiliate Name,Conversions,Revenue,Commission\n';
      data.topAffiliates.forEach((affiliate, index) => {
        csvContent += `${index + 1},"${affiliate.name}",${affiliate.conversions},${(affiliate.revenueCents / 100).toFixed(2)},${(affiliate.commissionCents / 100).toFixed(2)}\n`;
      });
      filename = `affiliate-report-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === 'commissions') {
      // Export trends/commission data
      csvContent = 'Date,Conversions,Revenue,Commission\n';
      data.trends.forEach((trend) => {
        csvContent += `${trend.date},${trend.conversions},${(trend.revenueCents / 100).toFixed(2)},${(trend.commissionCents / 100).toFixed(2)}\n`;
      });
      filename = `commission-trends-${period}-${new Date().toISOString().split('T')[0]}.csv`;
    } else if (type === '1099') {
      // Export summary for 1099 purposes
      csvContent = 'Affiliate Name,Total Conversions,Total Revenue,Total Commission\n';
      data.topAffiliates.forEach((affiliate) => {
        csvContent += `"${affiliate.name}",${affiliate.conversions},${(affiliate.revenueCents / 100).toFixed(2)},${(affiliate.commissionCents / 100).toFixed(2)}\n`;
      });
      csvContent += `\nSummary\n`;
      csvContent += `Total Affiliates,${data.overview.totalAffiliates}\n`;
      csvContent += `Total Active Affiliates,${data.overview.activeAffiliates}\n`;
      csvContent += `Total Conversions,${data.overview.totalConversions}\n`;
      csvContent += `Total Revenue,$${(data.overview.totalRevenueCents / 100).toFixed(2)}\n`;
      csvContent += `Total Commission,$${(data.overview.totalCommissionCents / 100).toFixed(2)}\n`;
      csvContent += `Pending Payout,$${(data.overview.pendingPayoutCents / 100).toFixed(2)}\n`;
      filename = `1099-summary-${new Date().toISOString().split('T')[0]}.csv`;
    }

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Affiliate Reports</h1>
          <p className="text-gray-500">Program performance and analytics</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex rounded-lg border border-gray-200 bg-white p-1">
            {(['7d', '30d', '90d', 'ytd'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  period === p ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {p === 'ytd' ? 'YTD' : p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <a
          href="/admin/affiliates"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          <Users className="h-5 w-5" />
          Affiliates
        </a>
        <a
          href="/admin/affiliates/code-performance"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          <Target className="h-5 w-5" />
          Code Performance
        </a>
        <a
          href="/admin/affiliates/commission-plans"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          <DollarSign className="h-5 w-5" />
          Plans
        </a>
        <a
          href="/admin/affiliates/applications"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          <Users className="h-5 w-5" />
          Applications
        </a>
      </div>

      {/* Overview Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.overview.activeAffiliates}</p>
              <p className="text-sm text-gray-500">Active Affiliates</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{data?.overview.totalConversions}</p>
              <p className="text-sm text-gray-500">Total Conversions</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data?.overview.totalRevenueCents || 0)}
              </p>
              <p className="text-sm text-gray-500">Revenue Generated</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data?.overview.totalCommissionCents || 0)}
              </p>
              <p className="text-sm text-gray-500">Commission Paid</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Trend Chart */}
        <div className="rounded-xl bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Performance Trend</h2>
          {data?.trends && (
            <div className="space-y-2">
              {data.trends.slice(-14).map((day, i) => {
                const maxConversions = Math.max(...data.trends.map((d) => d.conversions), 1);
                const width = (day.conversions / maxConversions) * 100;

                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-12 text-xs text-gray-500">{formatDate(day.date)}</span>
                    <div className="flex-1">
                      <div
                        className="h-5 rounded-r bg-violet-500 transition-all"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right text-sm text-gray-700">{day.conversions}</span>
                    <span className="w-20 text-right text-sm text-green-600">
                      {formatCurrency(day.commissionCents)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Affiliates */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Top Affiliates</h2>
            <Award className="h-5 w-5 text-yellow-500" />
          </div>
          <div className="space-y-3">
            {data?.topAffiliates.map((affiliate, i) => (
              <div key={affiliate.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      i === 0
                        ? 'bg-yellow-100 text-yellow-700'
                        : i === 1
                          ? 'bg-gray-100 text-gray-700'
                          : i === 2
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-50 text-gray-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="font-medium text-gray-900">{affiliate.name}</p>
                    <p className="text-xs text-gray-500">{affiliate.conversions} conversions</p>
                  </div>
                </div>
                <span className="font-medium text-green-600">
                  {formatCurrency(affiliate.commissionCents)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard Section */}
      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <h2 className="text-lg font-semibold text-gray-900">Performance Leaderboard</h2>
          </div>

          {/* Metric Tabs */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
            {(
              [
                { key: 'conversions', label: 'Conversions', icon: TrendingUp },
                { key: 'revenue', label: 'Revenue', icon: DollarSign },
                { key: 'clicks', label: 'Clicks', icon: MousePointer },
                { key: 'conversionRate', label: 'Conv. Rate', icon: Target },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setLeaderboardMetric(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                  leaderboardMetric === key
                    ? 'bg-white text-violet-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {leaderboardLoading ? (
          <div className="flex h-48 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
          </div>
        ) : leaderboardData && leaderboardData.entries.length > 0 ? (
          <div className="space-y-2">
            {leaderboardData.entries.map((entry, index) => (
              <div
                key={entry.affiliateId}
                className={`flex items-center gap-4 rounded-lg p-3 transition-colors ${
                  index === 0
                    ? 'bg-yellow-50'
                    : index === 1
                      ? 'bg-gray-50'
                      : index === 2
                        ? 'bg-orange-50'
                        : 'hover:bg-gray-50'
                }`}
              >
                {/* Rank Badge */}
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    index === 0
                      ? 'bg-yellow-400 text-yellow-900'
                      : index === 1
                        ? 'bg-gray-300 text-gray-700'
                        : index === 2
                          ? 'bg-orange-400 text-orange-900'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {index === 0 ? (
                    <Crown className="h-4 w-4" />
                  ) : index === 1 || index === 2 ? (
                    <Medal className="h-4 w-4" />
                  ) : (
                    entry.rank
                  )}
                </div>

                {/* Affiliate Info */}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-gray-900">{entry.displayName}</p>
                  <p className="text-xs text-gray-500">
                    {entry.refCodes.length > 0
                      ? `Codes: ${entry.refCodes.slice(0, 2).join(', ')}${entry.refCodes.length > 2 ? ` +${entry.refCodes.length - 2}` : ''}`
                      : 'No codes'}
                  </p>
                </div>

                {/* Value */}
                <div className="text-right">
                  <p
                    className={`font-bold ${index < 3 ? 'text-lg' : 'text-base'} ${
                      leaderboardMetric === 'revenue'
                        ? 'text-green-600'
                        : leaderboardMetric === 'conversions'
                          ? 'text-violet-600'
                          : leaderboardMetric === 'clicks'
                            ? 'text-blue-600'
                            : 'text-orange-600'
                    }`}
                  >
                    {entry.formattedValue}
                  </p>
                  <p className="text-xs text-gray-500">
                    {entry.percentOfTotal.toFixed(1)}% of total
                  </p>
                </div>

                {/* Progress Bar */}
                <div className="hidden w-24 sm:block">
                  <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all ${
                        leaderboardMetric === 'revenue'
                          ? 'bg-green-500'
                          : leaderboardMetric === 'conversions'
                            ? 'bg-violet-500'
                            : leaderboardMetric === 'clicks'
                              ? 'bg-blue-500'
                              : 'bg-orange-500'
                      }`}
                      style={{ width: `${Math.min(entry.percentOfTotal * 2, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <Trophy className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-2 text-gray-500">No leaderboard data available</p>
            <p className="text-sm text-gray-400">
              Affiliates will appear here once they have activity
            </p>
          </div>
        )}

        {/* View Code Performance Link */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <a
            href="/admin/affiliates/code-performance"
            className="inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700"
          >
            <Target className="h-4 w-4" />
            View detailed code performance
          </a>
        </div>
      </div>

      {/* Fraud Summary & Exports */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Fraud Summary */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Fraud Summary</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-yellow-50 p-3">
              <p className="text-2xl font-bold text-yellow-700">{data?.fraud.openAlerts}</p>
              <p className="text-sm text-yellow-600">Open Alerts</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-2xl font-bold text-red-700">{data?.fraud.criticalAlerts}</p>
              <p className="text-sm text-red-600">Critical</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-2xl font-bold text-gray-700">
                {formatCurrency(data?.fraud.confirmedFraudCents || 0)}
              </p>
              <p className="text-sm text-gray-600">Prevented</p>
            </div>
          </div>
          <a
            href="/admin/affiliates/fraud-queue"
            className="mt-4 inline-flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700"
          >
            <AlertTriangle className="h-4 w-4" />
            View Fraud Queue
          </a>
        </div>

        {/* Export Options */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Export Reports</h2>
          <div className="space-y-3">
            <button
              onClick={() => handleExport('affiliates')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Affiliate List</p>
                  <p className="text-sm text-gray-500">All affiliates with stats</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
            <button
              onClick={() => handleExport('commissions')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">Commission Report</p>
                  <p className="text-sm text-gray-500">All commission events</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
            <button
              onClick={() => handleExport('1099')}
              className="flex w-full items-center justify-between rounded-lg border border-gray-200 p-3 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">1099 Tax Report</p>
                  <p className="text-sm text-gray-500">Affiliates earning &gt;$600</p>
                </div>
              </div>
              <Download className="h-5 w-5 text-gray-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
