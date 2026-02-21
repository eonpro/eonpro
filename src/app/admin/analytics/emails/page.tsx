'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Calendar,
  Filter,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

interface EmailStats {
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalComplained: number;
  totalFailed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

interface TemplateStats {
  template: string;
  count: number;
  delivered: number;
  opened: number;
  bounced: number;
}

interface DayStats {
  date: string;
  sent: number;
  delivered: number;
  bounced: number;
  failed: number;
}

interface BounceEntry {
  id: number;
  email: string;
  status: string;
  bounceType: string | null;
  bounceSubType: string | null;
  complaintType: string | null;
  error: string | null;
  date: string;
}

interface AnalyticsData {
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  overview: EmailStats;
  byTemplate: TemplateStats[];
  byDay: DayStats[];
  recentBounces: BounceEntry[];
}

// ============================================================================
// Component
// ============================================================================

export default function EmailAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/admin/email-analytics?days=${days}`);

      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-500" />
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 rounded-lg bg-red-100 px-4 py-2 text-red-700 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { overview, byTemplate, byDay, recentBounces } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Analytics</h1>
          <p className="mt-1 text-gray-500">Track email delivery, opens, and engagement</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="border-none bg-transparent text-sm focus:ring-0"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          <button onClick={fetchData} className="rounded-lg border bg-white p-2 hover:bg-gray-50">
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          title="Total Sent"
          value={overview.totalSent.toLocaleString()}
          icon={Mail}
          color="blue"
        />
        <StatCard
          title="Delivered"
          value={`${overview.deliveryRate}%`}
          subValue={overview.totalDelivered.toLocaleString()}
          icon={CheckCircle}
          color="green"
          trend={overview.deliveryRate >= 95 ? 'up' : 'down'}
        />
        <StatCard
          title="Bounced"
          value={`${overview.bounceRate}%`}
          subValue={overview.totalBounced.toLocaleString()}
          icon={XCircle}
          color="red"
          trend={overview.bounceRate <= 2 ? 'up' : 'down'}
        />
        <StatCard
          title="Complaints"
          value={`${overview.complaintRate}%`}
          subValue={overview.totalComplained.toLocaleString()}
          icon={AlertTriangle}
          color="orange"
          trend={overview.complaintRate <= 0.1 ? 'up' : 'down'}
        />
      </div>

      {/* Engagement Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatCard
          title="Open Rate"
          value={`${overview.openRate}%`}
          subValue={`${overview.totalOpened.toLocaleString()} opened`}
          icon={Mail}
          color="purple"
        />
        <StatCard
          title="Click Rate"
          value={`${overview.clickRate}%`}
          subValue={`${overview.totalClicked.toLocaleString()} clicked`}
          icon={TrendingUp}
          color="indigo"
        />
        <StatCard
          title="Failed"
          value={overview.totalFailed.toLocaleString()}
          icon={XCircle}
          color="gray"
        />
      </div>

      {/* Charts and Tables Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Daily Volume Chart */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Daily Volume</h3>
          <div className="h-64">
            <DailyChart data={byDay} />
          </div>
        </div>

        {/* By Template */}
        <div className="rounded-xl border bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">By Template</h3>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {byTemplate.length === 0 ? (
              <p className="text-sm text-gray-500">No data available</p>
            ) : (
              byTemplate.map((template) => <TemplateRow key={template.template} data={template} />)
            )}
          </div>
        </div>
      </div>

      {/* Recent Bounces */}
      <div className="rounded-xl border bg-white p-6">
        <h3 className="mb-4 font-semibold text-gray-900">Recent Bounces & Complaints</h3>
        {recentBounces.length === 0 ? (
          <p className="text-sm text-gray-500">No recent bounces or complaints</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-600">Email</th>
                  <th className="pb-2 font-medium text-gray-600">Status</th>
                  <th className="pb-2 font-medium text-gray-600">Type</th>
                  <th className="pb-2 font-medium text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentBounces.map((bounce) => (
                  <tr key={bounce.id} className="border-b last:border-0">
                    <td className="py-2 text-gray-900">{bounce.email}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          bounce.status === 'BOUNCED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {bounce.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">
                      {bounce.bounceType || bounce.complaintType || bounce.bounceSubType || '-'}
                    </td>
                    <td className="py-2 text-gray-500">
                      {new Date(bounce.date).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface StatCardProps {
  title: string;
  value: string;
  subValue?: string;
  icon: React.ElementType;
  color: 'blue' | 'green' | 'red' | 'orange' | 'purple' | 'indigo' | 'gray';
  trend?: 'up' | 'down';
}

function StatCard({ title, value, subValue, icon: Icon, color, trend }: StatCardProps) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    indigo: 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className={`rounded-lg p-2 ${colorClasses[color]}`}>
          <Icon className="h-4 w-4" />
        </div>
        {trend && (
          <div
            className={`flex items-center gap-1 text-xs ${
              trend === 'up' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend === 'up' ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{title}</p>
      {subValue && <p className="mt-1 text-xs text-gray-400">{subValue}</p>}
    </div>
  );
}

interface TemplateRowProps {
  data: TemplateStats;
}

function TemplateRow({ data }: TemplateRowProps) {
  const deliveryRate = data.count > 0 ? Math.round((data.delivered / data.count) * 100) : 0;

  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
      <div>
        <p className="font-medium capitalize text-gray-900">{data.template.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-500">{data.count.toLocaleString()} sent</p>
      </div>
      <div className="text-right">
        <p className="font-medium text-gray-900">{deliveryRate}%</p>
        <p className="text-xs text-gray-500">delivery rate</p>
      </div>
    </div>
  );
}

interface DailyChartProps {
  data: DayStats[];
}

function DailyChart({ data }: DailyChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">No data available</div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.sent), 1);

  return (
    <div className="flex h-full items-end gap-1">
      {data.map((day) => {
        const height = (day.sent / maxValue) * 100;
        const bouncedHeight = day.sent > 0 ? (day.bounced / day.sent) * height : 0;

        return (
          <div key={day.date} className="group relative flex flex-1 flex-col items-center">
            <div className="flex w-full flex-col-reverse" style={{ height: '200px' }}>
              <div
                className="w-full rounded-t bg-blue-500 transition-all group-hover:bg-blue-600"
                style={{ height: `${height}%` }}
              >
                {bouncedHeight > 0 && (
                  <div
                    className="w-full rounded-t bg-red-400"
                    style={{ height: `${bouncedHeight}%` }}
                  />
                )}
              </div>
            </div>
            <p className="mt-1 max-w-full truncate text-xs text-gray-400">
              {new Date(day.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </p>

            {/* Tooltip */}
            <div className="absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white group-hover:block">
              {day.sent} sent, {day.bounced} bounced
            </div>
          </div>
        );
      })}
    </div>
  );
}
