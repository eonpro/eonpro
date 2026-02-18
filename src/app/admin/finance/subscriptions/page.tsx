'use client';

import { useState, useEffect } from 'react';
import {
  Users,
  TrendingUp,
  TrendingDown,
  Filter,
  Loader2,
  DollarSign,
  Calendar,
  AlertTriangle,
  ChevronRight,
  Pause,
  Play,
  XCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { apiFetch } from '@/lib/api/fetch';
import { normalizedIncludes } from '@/lib/utils/search';

interface SubscriptionMetrics {
  activeSubscriptions: number;
  pausedSubscriptions: number;
  canceledSubscriptions: number;
  pastDueSubscriptions: number;
  totalMrr: number;
  averageSubscriptionValue: number;
}

interface Subscription {
  id: number;
  patientId: number;
  patientName: string;
  planName: string | null;
  status: string;
  amount: number;
  interval: string | null;
  startDate: string;
  canceledAt: string | null;
  daysSinceStart: number;
}

const formatCurrency = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
};

export default function SubscriptionsPage() {
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<SubscriptionMetrics | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [trends, setTrends] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, [statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const token =
        localStorage.getItem('auth-token') ||
        localStorage.getItem('super_admin-token') ||
        localStorage.getItem('token');

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await apiFetch(`/api/finance/subscriptions?status=${statusFilter}`, {
        credentials: 'include',
        headers,
      });

      if (response.ok) {
        const data = await response.json();
        setMetrics(data.metrics);
        setSubscriptions(data.subscriptions || []);
        setTrends(data.trends || []);
      }
    } catch (error) {
      console.error('Failed to load subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'bg-green-100 text-green-700';
      case 'PAUSED':
        return 'bg-yellow-100 text-yellow-700';
      case 'CANCELED':
        return 'bg-red-100 text-red-700';
      case 'PAST_DUE':
        return 'bg-orange-100 text-orange-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  // Mock data for demonstration
  const mockMetrics: SubscriptionMetrics = metrics || {
    activeSubscriptions: 450,
    pausedSubscriptions: 23,
    canceledSubscriptions: 156,
    pastDueSubscriptions: 12,
    totalMrr: 4500000,
    averageSubscriptionValue: 10000,
  };

  const mockSubscriptions: Subscription[] = subscriptions.length
    ? subscriptions
    : [
        {
          id: 1,
          patientId: 1,
          patientName: 'John Smith',
          planName: 'Semaglutide Monthly',
          status: 'ACTIVE',
          amount: 29900,
          interval: 'MONTHLY',
          startDate: '2024-01-15',
          canceledAt: null,
          daysSinceStart: 55,
        },
        {
          id: 2,
          patientId: 2,
          patientName: 'Sarah Johnson',
          planName: 'Tirzepatide Monthly',
          status: 'ACTIVE',
          amount: 49900,
          interval: 'MONTHLY',
          startDate: '2024-02-01',
          canceledAt: null,
          daysSinceStart: 38,
        },
        {
          id: 3,
          patientId: 3,
          patientName: 'Michael Brown',
          planName: 'Semaglutide Quarterly',
          status: 'PAUSED',
          amount: 79900,
          interval: 'QUARTERLY',
          startDate: '2023-11-20',
          canceledAt: null,
          daysSinceStart: 111,
        },
        {
          id: 4,
          patientId: 4,
          patientName: 'Emily Davis',
          planName: 'Tirzepatide Monthly',
          status: 'PAST_DUE',
          amount: 49900,
          interval: 'MONTHLY',
          startDate: '2024-01-05',
          canceledAt: null,
          daysSinceStart: 65,
        },
        {
          id: 5,
          patientId: 5,
          patientName: 'Robert Wilson',
          planName: 'Semaglutide Monthly',
          status: 'CANCELED',
          amount: 29900,
          interval: 'MONTHLY',
          startDate: '2023-09-10',
          canceledAt: '2024-02-15',
          daysSinceStart: 182,
        },
      ];

  const mockTrends = trends.length
    ? trends
    : [
        {
          month: '2023-10',
          newSubscriptions: 45,
          canceledSubscriptions: 12,
          netChange: 33,
          mrr: 3800000,
        },
        {
          month: '2023-11',
          newSubscriptions: 52,
          canceledSubscriptions: 15,
          netChange: 37,
          mrr: 4000000,
        },
        {
          month: '2023-12',
          newSubscriptions: 38,
          canceledSubscriptions: 18,
          netChange: 20,
          mrr: 4100000,
        },
        {
          month: '2024-01',
          newSubscriptions: 60,
          canceledSubscriptions: 14,
          netChange: 46,
          mrr: 4350000,
        },
        {
          month: '2024-02',
          newSubscriptions: 55,
          canceledSubscriptions: 16,
          netChange: 39,
          mrr: 4500000,
        },
        {
          month: '2024-03',
          newSubscriptions: 42,
          canceledSubscriptions: 10,
          netChange: 32,
          mrr: 4600000,
        },
      ];

  const filteredSubscriptions = mockSubscriptions.filter(
    (sub) =>
      (statusFilter === 'all' || sub.status === statusFilter) &&
      (normalizedIncludes(sub.patientName, searchQuery) ||
        normalizedIncludes(sub.planName || '', searchQuery))
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Subscription Analytics</h2>
          <p className="mt-1 text-sm text-gray-500">Monitor and manage patient subscriptions</p>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-green-50 p-2">
              <Users className="h-5 w-5 text-green-600" />
            </div>
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {mockMetrics.activeSubscriptions}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Active Subscriptions</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-lg bg-[var(--brand-primary-light)] p-2">
            <DollarSign className="h-5 w-5 text-[var(--brand-primary)]" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(mockMetrics.totalMrr)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Monthly Recurring Revenue</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="w-fit rounded-lg bg-blue-50 p-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {formatCurrency(mockMetrics.averageSubscriptionValue)}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Average Subscription Value</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="rounded-lg bg-orange-50 p-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            {mockMetrics.pastDueSubscriptions > 0 && (
              <span className="text-xs font-medium text-orange-600">Action needed</span>
            )}
          </div>
          <h3 className="mt-4 text-2xl font-bold text-gray-900">
            {mockMetrics.pastDueSubscriptions}
          </h3>
          <p className="mt-1 text-sm text-gray-500">Past Due</p>
        </div>
      </div>

      {/* Trend Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Subscription Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={mockTrends}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} />
            <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} />
            <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB' }} />
            <Legend />
            <Line
              type="monotone"
              dataKey="newSubscriptions"
              name="New"
              stroke="#10B981"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="canceledSubscriptions"
              name="Canceled"
              stroke="#EF4444"
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="netChange"
              name="Net Change"
              stroke="#3B82F6"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Subscriptions Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="relative">
              <input
                type="text"
                placeholder="Search subscriptions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 rounded-lg border border-gray-200 py-2 pl-4 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2">
              {['all', 'ACTIVE', 'PAUSED', 'PAST_DUE', 'CANCELED'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === status
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {status === 'all' ? 'All' : status.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Plan
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Duration
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                    <p className="text-gray-500">No subscriptions found</p>
                  </td>
                </tr>
              ) : (
                filteredSubscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">{sub.patientName}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-900">{sub.planName || 'Unknown Plan'}</p>
                      <p className="text-xs text-gray-500">{sub.interval || 'Monthly'}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(sub.amount)}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(sub.status)}`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-600">{sub.daysSinceStart} days</p>
                      <p className="text-xs text-gray-400">
                        Started {new Date(sub.startDate).toLocaleDateString()}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {sub.status === 'ACTIVE' && (
                          <button className="rounded p-1.5 hover:bg-gray-100" title="Pause">
                            <Pause className="h-4 w-4 text-gray-500" />
                          </button>
                        )}
                        {sub.status === 'PAUSED' && (
                          <button className="rounded p-1.5 hover:bg-gray-100" title="Resume">
                            <Play className="h-4 w-4 text-gray-500" />
                          </button>
                        )}
                        {sub.status !== 'CANCELED' && (
                          <button className="rounded p-1.5 hover:bg-gray-100" title="Cancel">
                            <XCircle className="h-4 w-4 text-gray-500" />
                          </button>
                        )}
                        <button className="rounded p-1.5 hover:bg-gray-100" title="View">
                          <ChevronRight className="h-4 w-4 text-gray-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
