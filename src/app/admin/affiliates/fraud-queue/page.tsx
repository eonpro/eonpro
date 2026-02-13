'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  Shield,
  Clock,
  DollarSign,
} from 'lucide-react';

interface FraudAlert {
  id: number;
  createdAt: string;
  affiliateId: number;
  affiliateName: string;
  affiliateEmail: string;
  affiliateStatus: string;
  alertType: string;
  severity: string;
  description: string;
  evidence: Record<string, any>;
  riskScore: number;
  affectedAmountCents: number | null;
  status: string;
  resolvedAt: string | null;
  resolution: string | null;
}

interface AlertsData {
  alerts: FraudAlert[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
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
    hour: 'numeric',
    minute: '2-digit',
  });
}

const severityConfig: Record<string, { color: string; bgColor: string }> = {
  LOW: { color: 'text-blue-700', bgColor: 'bg-blue-100' },
  MEDIUM: { color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  HIGH: { color: 'text-orange-700', bgColor: 'bg-orange-100' },
  CRITICAL: { color: 'text-red-700', bgColor: 'bg-red-100' },
};

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  OPEN: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Open' },
  INVESTIGATING: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'Investigating' },
  CONFIRMED_FRAUD: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Confirmed' },
  FALSE_POSITIVE: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'False Positive' },
  DISMISSED: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'Dismissed' },
};

export default function FraudQueuePage() {
  const [data, setData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('OPEN');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    fetchAlerts();
  }, [page, statusFilter, severityFilter]);

  const fetchAlerts = async () => {
    setLoading(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (severityFilter !== 'all') params.set('severity', severityFilter);

      const response = await fetch(`/api/admin/affiliates/fraud-queue?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (alertId: number, action: string, resolutionAction?: string) => {
    setResolving(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch('/api/admin/affiliates/fraud-queue', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alertId,
          action,
          resolutionAction,
          reversCommission: action === 'confirm',
        }),
      });

      if (response.ok) {
        setSelectedAlert(null);
        fetchAlerts();
      }
    } catch (error) {
      console.error('Failed to resolve alert:', error);
    } finally {
      setResolving(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Fraud Queue</h1>
        <p className="text-gray-500">Review and resolve fraud alerts</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold text-yellow-700">{data?.stats.byStatus.OPEN || 0}</p>
              <p className="text-sm text-yellow-600">Open</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">
                {data?.stats.bySeverity.CRITICAL || 0}
              </p>
              <p className="text-sm text-red-600">Critical</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-orange-50 p-4">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-orange-600" />
            <div>
              <p className="text-2xl font-bold text-orange-700">
                {data?.stats.bySeverity.HIGH || 0}
              </p>
              <p className="text-sm text-orange-600">High</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">
                {(data?.stats.byStatus.FALSE_POSITIVE || 0) + (data?.stats.byStatus.DISMISSED || 0)}
              </p>
              <p className="text-sm text-green-600">Resolved</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Filter className="h-5 w-5 text-gray-400" />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="CONFIRMED_FRAUD">Confirmed Fraud</option>
          <option value="FALSE_POSITIVE">False Positive</option>
          <option value="DISMISSED">Dismissed</option>
        </select>
        <select
          value={severityFilter}
          onChange={(e) => {
            setSeverityFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
        >
          <option value="all">All Severity</option>
          <option value="CRITICAL">Critical</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
      </div>

      {/* Alerts Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Alert
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Affiliate
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Severity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Amount at Risk
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {data?.alerts.map((alert) => {
                const severity = severityConfig[alert.severity] || severityConfig.MEDIUM;
                const status = statusConfig[alert.status] || statusConfig.OPEN;

                return (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {alert.alertType.replace(/_/g, ' ')}
                        </p>
                        <p className="max-w-xs truncate text-sm text-gray-500">
                          {alert.description}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">{formatDate(alert.createdAt)}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{alert.affiliateName}</p>
                        <p className="text-sm text-gray-500">{alert.affiliateEmail}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${severity.bgColor} ${severity.color}`}
                      >
                        {alert.severity}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-900">
                        {alert.affectedAmountCents
                          ? formatCurrency(alert.affectedAmountCents)
                          : '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status.bgColor} ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => setSelectedAlert(alert)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4" />
                        Review
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(!data?.alerts || data.alerts.length === 0) && (
          <div className="py-12 text-center">
            <Shield className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No fraud alerts found</p>
          </div>
        )}

        {/* Pagination */}
        {data?.pagination && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
            <div className="text-sm text-gray-500">
              Page {data.pagination.page} of {data.pagination.totalPages}
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

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selectedAlert.alertType.replace(/_/g, ' ')}
                </h2>
                <p className="mt-1 text-sm text-gray-500">{formatDate(selectedAlert.createdAt)}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${severityConfig[selectedAlert.severity]?.bgColor} ${severityConfig[selectedAlert.severity]?.color}`}
              >
                {selectedAlert.severity}
              </span>
            </div>

            <div className="mb-4 rounded-lg bg-gray-50 p-4">
              <p className="text-gray-700">{selectedAlert.description}</p>
            </div>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-gray-500">Affiliate</p>
                <p className="mt-1 text-gray-900">{selectedAlert.affiliateName}</p>
                <p className="text-sm text-gray-500">{selectedAlert.affiliateEmail}</p>
              </div>
              {selectedAlert.affectedAmountCents && (
                <div>
                  <p className="text-sm font-medium text-gray-500">Amount at Risk</p>
                  <p className="mt-1 text-xl font-bold text-red-600">
                    {formatCurrency(selectedAlert.affectedAmountCents)}
                  </p>
                </div>
              )}
            </div>

            <div className="mb-6">
              <p className="mb-2 text-sm font-medium text-gray-500">Evidence</p>
              <pre className="max-h-48 overflow-auto rounded-lg bg-gray-900 p-4 text-sm text-green-400">
                {JSON.stringify(selectedAlert.evidence, null, 2)}
              </pre>
            </div>

            {selectedAlert.status === 'OPEN' || selectedAlert.status === 'INVESTIGATING' ? (
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleResolve(selectedAlert.id, 'investigate')}
                  disabled={resolving}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Mark Investigating
                </button>
                <button
                  onClick={() => handleResolve(selectedAlert.id, 'false_positive')}
                  disabled={resolving}
                  className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  False Positive
                </button>
                <button
                  onClick={() => handleResolve(selectedAlert.id, 'confirm', 'COMMISSION_REVERSED')}
                  disabled={resolving}
                  className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm Fraud
                </button>
              </div>
            ) : (
              <div className="rounded-lg bg-gray-50 p-4 text-center">
                <p className="text-sm text-gray-500">
                  This alert has been resolved as:{' '}
                  <strong>{statusConfig[selectedAlert.status]?.label}</strong>
                </p>
                {selectedAlert.resolution && (
                  <p className="mt-1 text-sm text-gray-500">
                    Resolution: {selectedAlert.resolution}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={() => setSelectedAlert(null)}
              className="mt-4 w-full rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
