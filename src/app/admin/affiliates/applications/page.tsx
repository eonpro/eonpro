'use client';

import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Globe,
  MapPin,
  Phone,
  Mail,
  Users,
  RefreshCw,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

interface SocialProfile {
  platform: string;
  url: string;
  handle?: string;
}

interface Application {
  id: number;
  fullName: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  socialProfiles: SocialProfile[];
  website: string | null;
  audienceSize: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedAt: string | null;
  affiliate: { id: number; displayName: string; status: string } | null;
}

interface StatusCounts {
  PENDING: number;
  APPROVED: number;
  REJECTED: number;
}

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';

export default function AffiliateApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [counts, setCounts] = useState<StatusCounts>({ PENDING: 0, APPROVED: 0, REJECTED: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedApp, setSelectedApp] = useState<Application | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectModal, setShowRejectModal] = useState<Application | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await apiFetch(`/api/admin/affiliates/applications?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load applications');
      }

      const data = await res.json();
      setApplications(data.applications || []);
      setCounts(data.counts || { PENDING: 0, APPROVED: 0, REJECTED: 0 });
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, [statusFilter, page]);

  const handleApprove = async (app: Application) => {
    setActionLoading(app.id);
    try {
      const res = await apiFetch(`/api/admin/affiliates/applications/${app.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (res.ok) {
        setSelectedApp(null);
        fetchApplications();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to approve');
      }
    } catch {
      alert('Failed to approve application');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (app: Application) => {
    setActionLoading(app.id);
    try {
      const res = await apiFetch(`/api/admin/affiliates/applications/${app.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNotes: rejectNotes }),
      });

      if (res.ok) {
        setShowRejectModal(null);
        setRejectNotes('');
        setSelectedApp(null);
        fetchApplications();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to reject');
      }
    } catch {
      alert('Failed to reject application');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const filteredApps = applications.filter(
    (app) =>
      !searchTerm ||
      app.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      app.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const statusTabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: 'PENDING', label: 'Pending', count: counts.PENDING },
    { value: 'APPROVED', label: 'Approved', count: counts.APPROVED },
    { value: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
    { value: 'ALL', label: 'All', count: counts.PENDING + counts.APPROVED + counts.REJECTED },
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            <Clock className="h-3 w-3" /> Pending
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            <CheckCircle className="h-3 w-3" /> Approved
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
            <XCircle className="h-3 w-3" /> Rejected
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#efece7' }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <a
              href="/admin/affiliates"
              className="rounded-lg p-2 transition-colors hover:bg-white/50"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </a>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Affiliate Applications</h1>
              <p className="text-gray-600">Review and manage partner applications</p>
            </div>
          </div>
          <button
            onClick={fetchApplications}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-600 transition-colors hover:bg-white/50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {/* Status Tabs */}
        <div className="mb-6 flex gap-2 overflow-x-auto">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => {
                setStatusFilter(tab.value);
                setPage(1);
              }}
              className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:bg-white/50'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    statusFilter === tab.value
                      ? 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 focus:border-[var(--brand-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
          />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">{error}</p>
            </div>
            <button
              onClick={fetchApplications}
              className="text-sm font-medium text-red-600 hover:text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredApps.length === 0 && (
          <div className="rounded-xl bg-white p-12 text-center">
            <Users className="mx-auto mb-3 h-10 w-10 text-gray-300" />
            <h3 className="text-lg font-semibold text-gray-900">No applications</h3>
            <p className="text-gray-500">
              {statusFilter === 'PENDING'
                ? 'No pending applications to review.'
                : 'No applications match your filters.'}
            </p>
          </div>
        )}

        {/* Applications List */}
        {!loading && filteredApps.length > 0 && (
          <div className="space-y-3">
            {filteredApps.map((app) => (
              <div
                key={app.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
              >
                <div className="flex items-center justify-between p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                      <span className="text-lg font-bold text-gray-600">
                        {app.fullName
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">{app.fullName}</h3>
                        {getStatusBadge(app.status)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {app.email}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {app.city}, {app.state}
                        </span>
                        <span className="text-gray-400">{formatDate(app.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedApp(selectedApp?.id === app.id ? null : app)}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                      title="View details"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                    {app.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(app)}
                          disabled={actionLoading === app.id}
                          className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {actionLoading === app.id ? '...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => setShowRejectModal(app)}
                          disabled={actionLoading === app.id}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Expanded Detail */}
                {selectedApp?.id === app.id && (
                  <div className="border-t border-gray-100 bg-gray-50/50 p-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                          Contact
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-gray-400" />
                            <span>{app.email}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-gray-400" />
                            <span>{app.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span>
                              {app.city}, {app.state}
                            </span>
                          </div>
                          {app.website && (
                            <div className="flex items-center gap-2">
                              <Globe className="h-4 w-4 text-gray-400" />
                              <a
                                href={app.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                {app.website}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase text-gray-500">
                          Social Profiles
                        </h4>
                        <div className="space-y-2">
                          {(app.socialProfiles as SocialProfile[])?.map((profile, i) => (
                            <a
                              key={i}
                              href={profile.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                            >
                              <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium uppercase text-gray-600">
                                {profile.platform}
                              </span>
                              {profile.handle || profile.url}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                        {app.audienceSize && (
                          <p className="mt-3 text-sm text-gray-600">
                            <span className="font-medium">Audience:</span> {app.audienceSize}
                          </p>
                        )}
                      </div>
                    </div>

                    {app.affiliate && (
                      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                        <p className="text-sm text-green-700">
                          Approved as affiliate:{' '}
                          <a
                            href={`/admin/affiliates/${app.affiliate.id}`}
                            className="font-medium underline"
                          >
                            {app.affiliate.displayName}
                          </a>{' '}
                          ({app.affiliate.status})
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-3">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">Reject Application</h3>
              <p className="mt-1 text-sm text-gray-500">
                Reject {showRejectModal.fullName}&apos;s application
              </p>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700">
                Reason (optional, shared with applicant)
              </label>
              <textarea
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                placeholder="e.g., Insufficient social media presence..."
                rows={3}
                className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="flex gap-3 border-t border-gray-200 p-6">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectNotes('');
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={actionLoading === showRejectModal.id}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === showRejectModal.id ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
