'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/fetch';
import {
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface CommissionEvent {
  id: number;
  occurredAt: string;
  eventAmountCents: number;
  commissionAmountCents: number;
  status: string;
  refCode: string;
  planName: string;
  tierName?: string;
  promotionName?: string;
}

interface CommissionsData {
  events: CommissionEvent[];
  totals: {
    pending: number;
    approved: number;
    paid: number;
    reversed: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const statusConfig: Record<string, { color: string; icon: any; label: string }> = {
  PENDING: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, label: 'Pending' },
  APPROVED: { color: 'bg-blue-100 text-blue-800', icon: CheckCircle, label: 'Approved' },
  PAID: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Paid' },
  REVERSED: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Reversed' },
};

export default function CommissionsPage() {
  const [data, setData] = useState<CommissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const token = localStorage.getItem('auth-token') || localStorage.getItem('affiliate-token');

      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '20',
        });

        if (statusFilter !== 'all') {
          params.set('status', statusFilter);
        }

        const response = await apiFetch(`/api/affiliate/commissions?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch (error) {
        console.error('Failed to fetch commissions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [page, statusFilter]);

  const handleExport = () => {
    // Generate CSV export
    if (!data?.events) return;

    const headers = ['Date', 'Order Amount', 'Commission', 'Status', 'Ref Code', 'Plan'];
    const rows = data.events.map((e) => [
      formatDate(e.occurredAt),
      formatCurrency(e.eventAmountCents),
      formatCurrency(e.commissionAmountCents),
      e.status,
      e.refCode,
      e.planName,
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `commissions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--brand-primary)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
          <p className="mt-1 text-gray-500">Your commission history</p>
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 hover:bg-gray-50"
        >
          <Download className="h-5 w-5" />
          Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-yellow-100 p-2 text-yellow-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-yellow-700">
                {formatCurrency(data?.totals.pending || 0)}
              </p>
              <p className="text-sm text-yellow-600">Pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {formatCurrency(data?.totals.approved || 0)}
              </p>
              <p className="text-sm text-blue-600">Approved</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-600">
              <DollarSign className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(data?.totals.paid || 0)}
              </p>
              <p className="text-sm text-green-600">Paid</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-100 p-2 text-red-600">
              <XCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold text-red-700">
                {formatCurrency(data?.totals.reversed || 0)}
              </p>
              <p className="text-sm text-red-600">Reversed</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        <Filter className="h-5 w-5 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
        >
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
          <option value="REVERSED">Reversed</option>
        </select>
      </div>

      {/* Commissions Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Order Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Commission
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Ref Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data?.events.map((event) => {
                const status = statusConfig[event.status] || statusConfig.PENDING;
                const StatusIcon = status.icon;

                return (
                  <tr key={event.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatDate(event.occurredAt)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                      {formatCurrency(event.eventAmountCents)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="text-sm font-semibold text-green-600">
                        +{formatCurrency(event.commissionAmountCents)}
                      </span>
                      {(event.tierName || event.promotionName) && (
                        <div className="mt-0.5 flex gap-1">
                          {event.tierName && (
                            <span className="rounded bg-[var(--brand-primary-light)] px-1.5 py-0.5 text-xs text-[var(--brand-primary)]">
                              {event.tierName}
                            </span>
                          )}
                          {event.promotionName && (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-700">
                              {event.promotionName}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className="font-mono text-sm text-gray-600">{event.refCode}</span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${status.color}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(!data?.events || data.events.length === 0) && (
          <div className="py-12 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No commissions found</p>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
            <div className="text-sm text-gray-500">
              Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{' '}
              {Math.min(data.pagination.page * data.pagination.limit, data.pagination.total)} of{' '}
              {data.pagination.total}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page === data.pagination.totalPages}
                className="rounded-lg border border-gray-300 p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
