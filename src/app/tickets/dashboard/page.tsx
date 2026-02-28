'use client';

/**
 * Ticket Analytics Dashboard
 * ==========================
 *
 * KPI cards, volume trends, status/priority charts, agent performance table.
 * Uses Recharts for all visualizations.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Loader2,
  AlertTriangle,
  Ticket,
  Clock,
  Shield,
  UserX,
  TrendingUp,
  Users,
  RefreshCw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';

interface Stats {
  total: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byCategory: Record<string, number>;
  unassigned: number;
  slaBreach: number;
  avgResolutionTime: number;
}

interface TrendPoint {
  date: string;
  created: number;
  resolved: number;
}

interface AgentMetric {
  userId: number;
  name: string;
  role: string;
  openTickets: number;
  resolvedTickets: number;
  avgResolutionMinutes: number;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: '#3b82f6',
  OPEN: '#eab308',
  IN_PROGRESS: '#6366f1',
  PENDING_CUSTOMER: '#f97316',
  PENDING_INTERNAL: '#f97316',
  ON_HOLD: '#9ca3af',
  ESCALATED: '#ef4444',
  RESOLVED: '#22c55e',
  CLOSED: '#6b7280',
  CANCELLED: '#d1d5db',
  REOPENED: '#f59e0b',
};

const PRIORITY_COLORS: Record<string, string> = {
  P0_CRITICAL: '#dc2626',
  P1_URGENT: '#ef4444',
  P2_HIGH: '#f97316',
  P3_MEDIUM: '#eab308',
  P4_LOW: '#3b82f6',
  P5_PLANNING: '#9ca3af',
};

function formatDuration(minutes: number) {
  if (minutes === 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function TicketDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [agents, setAgents] = useState<AgentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, trendsRes, agentsRes] = await Promise.all([
        apiFetch('/api/tickets/stats'),
        apiFetch('/api/tickets/stats/trends?days=30'),
        apiFetch('/api/tickets/stats/agents'),
      ]);

      if (statsRes.ok) {
        const d = await statsRes.json();
        setStats(d.stats);
      }
      if (trendsRes.ok) {
        const d = await trendsRes.json();
        setTrends(d.trends || []);
      }
      if (agentsRes.ok) {
        const d = await agentsRes.json();
        setAgents(d.agents || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-gray-500">{error}</p>
        <button onClick={fetchAll} className="text-blue-600 hover:text-blue-700">Retry</button>
      </div>
    );
  }

  const openCount = stats
    ? (stats.byStatus['NEW'] || 0) +
      (stats.byStatus['OPEN'] || 0) +
      (stats.byStatus['IN_PROGRESS'] || 0) +
      (stats.byStatus['PENDING_CUSTOMER'] || 0) +
      (stats.byStatus['PENDING_INTERNAL'] || 0) +
      (stats.byStatus['ON_HOLD'] || 0) +
      (stats.byStatus['ESCALATED'] || 0) +
      (stats.byStatus['REOPENED'] || 0)
    : 0;

  const slaCompliance = stats && stats.total > 0
    ? Math.round(((stats.total - stats.slaBreach) / stats.total) * 100)
    : 100;

  const statusData = stats
    ? Object.entries(stats.byStatus)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value, fill: STATUS_COLORS[name] || '#9ca3af' }))
    : [];

  const priorityData = stats
    ? Object.entries(stats.byPriority)
        .filter(([, v]) => v > 0)
        .map(([name, value]) => ({
          name: name.replace(/^P\d_/, '').replace(/_/g, ' '),
          value,
          fill: PRIORITY_COLORS[name] || '#9ca3af',
        }))
    : [];

  const categoryData = stats
    ? Object.entries(stats.byCategory)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ticket Dashboard</h1>
          <p className="text-sm text-gray-500">Analytics and performance overview</p>
        </div>
        <button
          onClick={fetchAll}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Open Tickets</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{openCount}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <Ticket className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Resolution</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {formatDuration(stats?.avgResolutionTime || 0)}
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50">
              <Clock className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">SLA Compliance</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{slaCompliance}%</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Unassigned</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">{stats?.unassigned || 0}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
              <UserX className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Trend Chart */}
      {trends.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <TrendingUp className="h-4 w-4" />
            Ticket Volume (Last 30 Days)
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tickFormatter={formatShortDate} tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={formatShortDate} />
              <Legend />
              <Area type="monotone" dataKey="created" name="Created" stroke="#3b82f6" fill="#3b82f680" strokeWidth={2} />
              <Area type="monotone" dataKey="resolved" name="Resolved" stroke="#22c55e" fill="#22c55e80" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Status Distribution */}
        {statusData.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Status Distribution</h2>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name} (${value})`}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Priority Breakdown */}
        {priorityData.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Priority Breakdown</h2>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={priorityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" name="Tickets">
                  {priorityData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Top Categories */}
      {categoryData.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Top Categories</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, angle: -25 }} height={60} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="value" name="Tickets" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Agent Performance */}
      {agents.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Users className="h-4 w-4" />
            Agent Performance
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Role</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Open</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Resolved</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">Avg Resolution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {agents.map((agent) => (
                  <tr key={agent.userId}>
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">{agent.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">{agent.role}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{agent.openTickets}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{agent.resolvedTickets}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">{formatDuration(agent.avgResolutionMinutes)}</td>
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
