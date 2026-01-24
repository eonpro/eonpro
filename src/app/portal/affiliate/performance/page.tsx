'use client';

import { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Users,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';

interface PerformanceData {
  summary: {
    totalConversions: number;
    totalRevenueCents: number;
    totalCommissionCents: number;
    avgConversionValue: number;
  };
  comparison: {
    conversionsChange: number;
    revenueChange: number;
    commissionChange: number;
  };
  trends: Array<{
    date: string;
    conversions: number | string;
    revenueCents: number | null;
    commissionCents: number | null;
  }>;
  tierProgress?: {
    currentTier: string | null;
    nextTier: string | null;
    conversionsProgress: number;
    revenueProgress: number;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatChange(change: number): { text: string; isPositive: boolean } {
  const isPositive = change >= 0;
  const text = `${isPositive ? '+' : ''}${change.toFixed(1)}%`;
  return { text, isPositive };
}

export default function PerformancePage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');
      
      try {
        const [summaryRes, trendsRes] = await Promise.all([
          fetch(`/api/affiliate/summary?period=${period}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          }),
          fetch(`/api/affiliate/trends?granularity=day&days=${period === '7d' ? 7 : period === '30d' ? 30 : 90}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          })
        ]);

        if (summaryRes.ok && trendsRes.ok) {
          const summaryData = await summaryRes.json();
          const trendsData = await trendsRes.json();

          setData({
            summary: {
              totalConversions: summaryData.summary?.conversionsCount || 0,
              totalRevenueCents: summaryData.summary?.revenueTotalCents || 0,
              totalCommissionCents: (summaryData.summary?.commissionPendingCents || 0) + 
                                   (summaryData.summary?.commissionApprovedCents || 0) +
                                   (summaryData.summary?.commissionPaidCents || 0),
              avgConversionValue: summaryData.summary?.conversionsCount > 0 
                ? Math.round((summaryData.summary?.revenueTotalCents || 0) / summaryData.summary.conversionsCount)
                : 0,
            },
            comparison: {
              conversionsChange: Math.random() * 40 - 10, // Placeholder
              revenueChange: Math.random() * 40 - 10,
              commissionChange: Math.random() * 40 - 10,
            },
            trends: trendsData.trends || [],
            tierProgress: summaryData.tierProgress,
          });
        }
      } catch (error) {
        console.error('Failed to fetch performance data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
          <p className="mt-1 text-gray-500">Track your affiliate metrics</p>
        </div>

        {/* Period Selector */}
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                period === p
                  ? 'bg-violet-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Conversions */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-violet-100 p-2 text-violet-600">
              <Users className="h-6 w-6" />
            </div>
            {data?.comparison.conversionsChange !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                data.comparison.conversionsChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.comparison.conversionsChange >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {formatChange(data.comparison.conversionsChange).text}
              </div>
            )}
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {data?.summary.totalConversions || 0}
            </p>
            <p className="mt-1 text-sm text-gray-500">Conversions</p>
          </div>
        </div>

        {/* Revenue Generated */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-green-100 p-2 text-green-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            {data?.comparison.revenueChange !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                data.comparison.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.comparison.revenueChange >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {formatChange(data.comparison.revenueChange).text}
              </div>
            )}
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(data?.summary.totalRevenueCents || 0)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Revenue Generated</p>
          </div>
        </div>

        {/* Commission Earned */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-blue-100 p-2 text-blue-600">
              <DollarSign className="h-6 w-6" />
            </div>
            {data?.comparison.commissionChange !== undefined && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                data.comparison.commissionChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {data.comparison.commissionChange >= 0 ? (
                  <ArrowUpRight className="h-4 w-4" />
                ) : (
                  <ArrowDownRight className="h-4 w-4" />
                )}
                {formatChange(data.comparison.commissionChange).text}
              </div>
            )}
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(data?.summary.totalCommissionCents || 0)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Commission Earned</p>
          </div>
        </div>

        {/* Avg Order Value */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-xl bg-yellow-100 p-2 text-yellow-600">
              <BarChart3 className="h-6 w-6" />
            </div>
          </div>
          <div className="mt-4">
            <p className="text-3xl font-bold text-gray-900">
              {formatCurrency(data?.summary.avgConversionValue || 0)}
            </p>
            <p className="mt-1 text-sm text-gray-500">Avg. Conversion Value</p>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="mb-8 rounded-2xl bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Daily Performance
        </h2>
        {data?.trends && data.trends.length > 0 ? (
          <div className="space-y-2">
            {/* Simple bar chart visualization */}
            <div className="grid gap-1">
              {data.trends.slice(0, 14).reverse().map((day, i) => {
                const conversions = typeof day.conversions === 'number' ? day.conversions : 0;
                const maxConversions = Math.max(
                  ...data.trends.slice(0, 14).map(d => 
                    typeof d.conversions === 'number' ? d.conversions : 0
                  ),
                  1
                );
                const width = (conversions / maxConversions) * 100;
                
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-16 text-xs text-gray-500">
                      {new Date(day.date).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric' 
                      })}
                    </span>
                    <div className="flex-1">
                      <div 
                        className="h-6 rounded-r bg-violet-500 transition-all"
                        style={{ width: `${Math.max(width, 2)}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-sm font-medium text-gray-700">
                      {typeof day.conversions === 'number' ? day.conversions : day.conversions} conv.
                    </span>
                    {day.commissionCents !== null && (
                      <span className="w-24 text-right text-sm text-green-600">
                        +{formatCurrency(day.commissionCents)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center rounded-xl bg-gray-50">
            <p className="text-gray-400">No data for this period</p>
          </div>
        )}
      </div>

      {/* Tier Progress */}
      {data?.tierProgress && (
        <div className="rounded-2xl bg-gradient-to-r from-violet-50 to-purple-50 p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Tier Progress
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-gray-600">Current Tier</span>
                <span className="font-semibold text-violet-700">
                  {data.tierProgress.currentTier || 'None'}
                </span>
              </div>
              {data.tierProgress.nextTier && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Next Tier</span>
                  <span className="font-semibold text-gray-700">
                    {data.tierProgress.nextTier}
                  </span>
                </div>
              )}
            </div>
            {data.tierProgress.nextTier && (
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Conversions</span>
                    <span className="font-medium">{data.tierProgress.conversionsProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div 
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${data.tierProgress.conversionsProgress}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-gray-600">Revenue</span>
                    <span className="font-medium">{data.tierProgress.revenueProgress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div 
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${data.tierProgress.revenueProgress}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
