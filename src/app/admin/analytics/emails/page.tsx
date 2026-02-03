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
      const token =
        localStorage.getItem('admin-token') ||
        localStorage.getItem('auth-token');

      const response = await fetch(`/api/admin/email-analytics?days=${days}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

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
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-6 text-center">
        <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
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
          <p className="text-gray-500 mt-1">
            Track email delivery, opens, and engagement
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2">
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
          <button
            onClick={fetchData}
            className="p-2 bg-white border rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Volume Chart */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Daily Volume</h3>
          <div className="h-64">
            <DailyChart data={byDay} />
          </div>
        </div>

        {/* By Template */}
        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-4">By Template</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {byTemplate.length === 0 ? (
              <p className="text-gray-500 text-sm">No data available</p>
            ) : (
              byTemplate.map((template) => (
                <TemplateRow key={template.template} data={template} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Recent Bounces */}
      <div className="bg-white rounded-xl border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">
          Recent Bounces & Complaints
        </h3>
        {recentBounces.length === 0 ? (
          <p className="text-gray-500 text-sm">No recent bounces or complaints</p>
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
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          bounce.status === 'BOUNCED'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}
                      >
                        {bounce.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-600">
                      {bounce.bounceType ||
                        bounce.complaintType ||
                        bounce.bounceSubType ||
                        '-'}
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
    purple: 'bg-purple-50 text-purple-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
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
      {subValue && <p className="text-xs text-gray-400 mt-1">{subValue}</p>}
    </div>
  );
}

interface TemplateRowProps {
  data: TemplateStats;
}

function TemplateRow({ data }: TemplateRowProps) {
  const deliveryRate =
    data.count > 0 ? Math.round((data.delivered / data.count) * 100) : 0;

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div>
        <p className="font-medium text-gray-900 capitalize">
          {data.template.replace(/_/g, ' ')}
        </p>
        <p className="text-xs text-gray-500">
          {data.count.toLocaleString()} sent
        </p>
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
      <div className="h-full flex items-center justify-center text-gray-500">
        No data available
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.sent), 1);

  return (
    <div className="h-full flex items-end gap-1">
      {data.map((day) => {
        const height = (day.sent / maxValue) * 100;
        const bouncedHeight = day.sent > 0 ? (day.bounced / day.sent) * height : 0;

        return (
          <div
            key={day.date}
            className="flex-1 flex flex-col items-center group relative"
          >
            <div className="w-full flex flex-col-reverse" style={{ height: '200px' }}>
              <div
                className="w-full bg-blue-500 rounded-t transition-all group-hover:bg-blue-600"
                style={{ height: `${height}%` }}
              >
                {bouncedHeight > 0 && (
                  <div
                    className="w-full bg-red-400 rounded-t"
                    style={{ height: `${bouncedHeight}%` }}
                  />
                )}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-1 truncate max-w-full">
              {new Date(day.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </p>

            {/* Tooltip */}
            <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap z-10">
              {day.sent} sent, {day.bounced} bounced
            </div>
          </div>
        );
      })}
    </div>
  );
}
