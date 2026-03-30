'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mail,
  Search,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Send,
  Eye,
  MousePointer,
  Filter,
  X,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface EmailLogEntry {
  id: number;
  createdAt: string;
  recipientEmail: string;
  subject: string;
  status: string;
  template: string | null;
  sourceType: string | null;
  sourceId: string | null;
  messageId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  bounceType: string | null;
  bounceSubType: string | null;
  complaintType: string | null;
  retryCount: number;
  clinicId: number | null;
  clinicName: string | null;
}

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  DELIVERED: { color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
  SENT: { color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Send },
  OPENED: { color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', icon: Eye },
  CLICKED: { color: 'text-teal-700', bg: 'bg-teal-50 border-teal-200', icon: MousePointer },
  PENDING: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: Clock },
  QUEUED: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: Clock },
  SENDING: { color: 'text-yellow-700', bg: 'bg-yellow-50 border-yellow-200', icon: Send },
  BOUNCED: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
  FAILED: { color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
  COMPLAINED: { color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: AlertTriangle },
  SUPPRESSED: { color: 'text-gray-700', bg: 'bg-gray-50 border-gray-200', icon: XCircle },
};

const ALL_STATUSES = [
  'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'PENDING', 'QUEUED',
  'SENDING', 'BOUNCED', 'FAILED', 'COMPLAINED', 'SUPPRESSED',
];

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SuperAdminEmailLogsPage() {
  const [emails, setEmails] = useState<EmailLogEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [emailSearch, setEmailSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', '25');
      if (statusFilter) params.set('status', statusFilter);
      if (emailSearch.trim()) params.set('recipientEmail', emailSearch.trim());
      if (sourceFilter) params.set('sourceType', sourceFilter);
      if (fromDate) params.set('from', new Date(fromDate).toISOString());
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        params.set('to', end.toISOString());
      }

      const res = await apiFetch(`/api/super-admin/email-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails);
        setPagination(data.pagination);
      }
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [statusFilter, emailSearch, sourceFilter, fromDate, toDate]);

  useEffect(() => { fetchLogs(1); }, [fetchLogs]);

  const handleExportCSV = () => {
    const headers = ['Time', 'Recipient', 'Subject', 'Status', 'Clinic', 'Source', 'Template', 'Error', 'Message ID'];
    const rows = emails.map(e => [
      e.createdAt, e.recipientEmail, e.subject, e.status,
      e.clinicName || '', e.sourceType || '', e.template || '',
      e.errorMessage || '', e.messageId || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `email-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setStatusFilter('');
    setEmailSearch('');
    setSourceFilter('');
    setFromDate('');
    setToDate('');
  };

  const hasActiveFilters = statusFilter || emailSearch || sourceFilter || fromDate || toDate;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email Logs</h1>
          <p className="mt-1 text-sm text-gray-500">
            All emails sent from the platform — {pagination.total.toLocaleString()} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={emails.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            onClick={() => fetchLogs(pagination.page)}
            className="flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700"
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            Filters
            {hasActiveFilters && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">Active</span>
            )}
          </div>
          {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showFilters && (
          <div className="border-t border-gray-100 px-4 pb-4 pt-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {/* Email search */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Recipient</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={emailSearch}
                    onChange={(e) => setEmailSearch(e.target.value)}
                    placeholder="Search email..."
                    className="w-full rounded-lg border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All statuses</option>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Source type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Source</label>
                <select
                  value={sourceFilter}
                  onChange={(e) => setSourceFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All sources</option>
                  <option value="notification">Notification</option>
                  <option value="automation">Automation</option>
                  <option value="manual">Manual</option>
                  <option value="digest">Digest</option>
                </select>
              </div>

              {/* Date from */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-1.5 px-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Date to */}
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 py-1.5 px-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <X className="h-3 w-3" /> Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Clinic</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Source</th>
                <th className="w-8 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && emails.length === 0 ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : emails.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Mail className="mx-auto h-8 w-8 text-gray-300" />
                    <p className="mt-2 text-sm text-gray-500">No email logs found</p>
                  </td>
                </tr>
              ) : (
                emails.map((email) => (
                  <>
                    <tr
                      key={email.id}
                      onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-600">
                        {formatTime(email.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">
                        {email.recipientEmail}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[250px] truncate">
                        {email.subject}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <StatusBadge status={email.status} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {email.clinicName || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {email.sourceType || '—'}
                      </td>
                      <td className="px-2 py-3">
                        {expandedId === email.id
                          ? <ChevronDown className="h-4 w-4 text-gray-400" />
                          : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      </td>
                    </tr>

                    {expandedId === email.id && (
                      <tr key={`${email.id}-detail`}>
                        <td colSpan={7} className="bg-gray-50 px-6 py-4">
                          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm lg:grid-cols-4">
                            <div>
                              <p className="text-xs font-medium text-gray-400">Message ID</p>
                              <p className="mt-0.5 font-mono text-xs text-gray-600 break-all">{email.messageId || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Template</p>
                              <p className="mt-0.5 text-gray-700">{email.template || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Source ID</p>
                              <p className="mt-0.5 text-gray-700 break-all">{email.sourceId || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Retry Count</p>
                              <p className="mt-0.5 text-gray-700">{email.retryCount}</p>
                            </div>

                            {/* Timestamps */}
                            <div>
                              <p className="text-xs font-medium text-gray-400">Sent</p>
                              <p className="mt-0.5 text-gray-700">{formatTime(email.sentAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Delivered</p>
                              <p className="mt-0.5 text-gray-700">{formatTime(email.deliveredAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Opened</p>
                              <p className="mt-0.5 text-gray-700">{formatTime(email.openedAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-gray-400">Clicked</p>
                              <p className="mt-0.5 text-gray-700">{formatTime(email.clickedAt)}</p>
                            </div>

                            {/* Error details */}
                            {(email.errorMessage || email.bounceType) && (
                              <div className="col-span-2 lg:col-span-4 rounded-lg border border-red-200 bg-red-50 p-3">
                                <p className="text-xs font-medium text-red-600">Error Details</p>
                                {email.errorMessage && (
                                  <p className="mt-1 text-sm text-red-700">{email.errorMessage}</p>
                                )}
                                {email.errorCode && (
                                  <p className="mt-0.5 text-xs text-red-500">Code: {email.errorCode}</p>
                                )}
                                {email.bounceType && (
                                  <p className="mt-0.5 text-xs text-red-500">
                                    Bounce: {email.bounceType}{email.bounceSubType ? ` / ${email.bounceSubType}` : ''}
                                  </p>
                                )}
                                {email.complaintType && (
                                  <p className="mt-0.5 text-xs text-red-500">Complaint: {email.complaintType}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-600">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} emails)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => fetchLogs(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => fetchLogs(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-white disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
