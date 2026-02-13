'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  ChevronLeft,
  Instagram,
  Facebook,
  Youtube,
  Linkedin,
  Twitter,
  Globe,
  ExternalLink,
} from 'lucide-react';

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
  affiliate: {
    id: number;
    displayName: string;
    status: string;
  } | null;
}

interface ApplicationDetail extends Application {
  addressLine1: string;
  addressLine2: string | null;
  zipCode: string;
  country: string;
  promotionPlan: string | null;
  reviewNotes: string | null;
  reviewedBy: number | null;
}

interface CommissionPlan {
  id: number;
  name: string;
  planType: string;
  flatAmountCents: number | null;
  percentBps: number | null;
  // Separate initial/recurring rates
  initialPercentBps: number | null;
  initialFlatAmountCents: number | null;
  recurringPercentBps: number | null;
  recurringFlatAmountCents: number | null;
  recurringEnabled: boolean;
  isActive: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}

const SocialIcon = ({ platform }: { platform: string }) => {
  const iconClass = 'h-4 w-4';
  switch (platform) {
    case 'instagram':
      return <Instagram className={iconClass} />;
    case 'facebook':
      return <Facebook className={iconClass} />;
    case 'youtube':
      return <Youtube className={iconClass} />;
    case 'linkedin':
      return <Linkedin className={iconClass} />;
    case 'twitter':
      return <Twitter className={iconClass} />;
    default:
      return <Globe className={iconClass} />;
  }
};

export default function AdminAffiliateApplicationsPage() {
  const router = useRouter();
  const [applications, setApplications] = useState<Application[]>([]);
  const [plans, setPlans] = useState<CommissionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>(
    'PENDING'
  );
  const [counts, setCounts] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0 });

  // Detail modal state
  const [selectedApplication, setSelectedApplication] = useState<ApplicationDetail | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Approve modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveForm, setApproveForm] = useState({
    commissionPlanId: '',
    initialRefCode: '',
    reviewNotes: '',
  });
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Reject modal state
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [rejecting, setRejecting] = useState(false);

  useEffect(() => {
    fetchApplications();
    fetchPlans();
  }, [statusFilter]);

  const fetchApplications = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') {
        params.append('status', statusFilter);
      }

      const response = await fetch(`/api/admin/affiliates/applications?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setApplications(data.applications);
        setCounts(data.counts);
      }
    } catch (error) {
      console.error('Failed to fetch applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPlans = async () => {
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch('/api/admin/commission-plans', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPlans(data.plans.filter((p: CommissionPlan) => p.isActive));
      }
    } catch (error) {
      console.error('Failed to fetch plans:', error);
    }
  };

  const fetchApplicationDetail = async (id: number) => {
    setLoadingDetail(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch(`/api/admin/affiliates/applications/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSelectedApplication(data.application);
        setShowDetailModal(true);
      }
    } catch (error) {
      console.error('Failed to fetch application detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedApplication) return;

    setApproving(true);
    setApproveError(null);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch(
        `/api/admin/affiliates/applications/${selectedApplication.id}/approve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            commissionPlanId: approveForm.commissionPlanId
              ? parseInt(approveForm.commissionPlanId)
              : undefined,
            initialRefCode: approveForm.initialRefCode || undefined,
            reviewNotes: approveForm.reviewNotes || undefined,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve application');
      }

      setShowApproveModal(false);
      setShowDetailModal(false);
      setSelectedApplication(null);
      setApproveForm({ commissionPlanId: '', initialRefCode: '', reviewNotes: '' });
      fetchApplications();
    } catch (error) {
      setApproveError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApplication) return;

    setRejecting(true);
    const token = localStorage.getItem('auth-token') || localStorage.getItem('admin-token');

    try {
      const response = await fetch(
        `/api/admin/affiliates/applications/${selectedApplication.id}/reject`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reviewNotes: rejectNotes || undefined,
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject application');
      }

      setShowRejectModal(false);
      setShowDetailModal(false);
      setSelectedApplication(null);
      setRejectNotes('');
      fetchApplications();
    } catch (error) {
      console.error('Failed to reject:', error);
    } finally {
      setRejecting(false);
    }
  };

  const filteredApplications = applications.filter(
    (a) =>
      a.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-green-100 text-green-800',
    REJECTED: 'bg-red-100 text-red-800',
  };

  const statusIcons: Record<string, React.ReactNode> = {
    PENDING: <Clock className="h-4 w-4" />,
    APPROVED: <CheckCircle className="h-4 w-4" />,
    REJECTED: <XCircle className="h-4 w-4" />,
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
      <div className="mb-6">
        <button
          onClick={() => (window.location.href = '/admin/affiliates')}
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Affiliates
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Partner Applications</h1>
        <p className="text-gray-500">Review and approve new partner applications</p>
      </div>

      {/* Status Tabs */}
      <div className="mb-6 flex gap-2">
        {[
          { key: 'PENDING', label: 'Pending', count: counts.PENDING },
          { key: 'APPROVED', label: 'Approved', count: counts.APPROVED },
          { key: 'REJECTED', label: 'Rejected', count: counts.REJECTED },
          { key: 'ALL', label: 'All', count: counts.PENDING + counts.APPROVED + counts.REJECTED },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key as typeof statusFilter)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              statusFilter === tab.key
                ? 'bg-violet-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  statusFilter === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-gray-200 py-2 pl-10 pr-4 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
          />
        </div>
      </div>

      {/* Applications Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Applicant
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Location
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Social Profiles
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Applied
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Status
              </th>
              <th className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filteredApplications.map((application) => (
              <tr key={application.id} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-6 py-4">
                  <div>
                    <p className="font-medium text-gray-900">{application.fullName}</p>
                    <p className="text-sm text-gray-500">{application.email}</p>
                    <p className="text-sm text-gray-400">{application.phone}</p>
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <p className="text-sm text-gray-900">
                    {application.city}, {application.state}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2">
                    {(application.socialProfiles as SocialProfile[])
                      .slice(0, 3)
                      .map((profile, i) => (
                        <a
                          key={i}
                          href={profile.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
                        >
                          <SocialIcon platform={profile.platform} />
                          {profile.platform}
                        </a>
                      ))}
                    {application.audienceSize && (
                      <span className="text-xs text-gray-400">{application.audienceSize}</span>
                    )}
                  </div>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <p className="text-sm text-gray-900">{formatDate(application.createdAt)}</p>
                </td>
                <td className="whitespace-nowrap px-6 py-4">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      statusColors[application.status]
                    }`}
                  >
                    {statusIcons[application.status]}
                    {application.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-right">
                  <button
                    onClick={() => fetchApplicationDetail(application.id)}
                    disabled={loadingDetail}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredApplications.length === 0 && (
          <div className="py-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-2 text-gray-500">No applications found</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selectedApplication.fullName}</h2>
                <span
                  className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                    statusColors[selectedApplication.status]
                  }`}
                >
                  {statusIcons[selectedApplication.status]}
                  {selectedApplication.status}
                </span>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedApplication(null);
                }}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"
              >
                <XCircle className="h-6 w-6" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Contact Info */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                  Contact Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{selectedApplication.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Phone</p>
                    <p className="font-medium text-gray-900">{selectedApplication.phone}</p>
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">Address</h3>
                <p className="text-gray-900">{selectedApplication.addressLine1}</p>
                {selectedApplication.addressLine2 && (
                  <p className="text-gray-900">{selectedApplication.addressLine2}</p>
                )}
                <p className="text-gray-600">
                  {selectedApplication.city}, {selectedApplication.state}{' '}
                  {selectedApplication.zipCode}
                </p>
              </div>

              {/* Social Profiles */}
              <div className="rounded-lg bg-gray-50 p-4">
                <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                  Social Profiles
                </h3>
                <div className="space-y-2">
                  {(selectedApplication.socialProfiles as SocialProfile[]).map((profile, i) => (
                    <a
                      key={i}
                      href={profile.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-blue-600 hover:underline"
                    >
                      <SocialIcon platform={profile.platform} />
                      <span className="capitalize">{profile.platform}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  ))}
                </div>
                {selectedApplication.audienceSize && (
                  <p className="mt-2 text-sm text-gray-600">
                    Audience:{' '}
                    <span className="font-medium">{selectedApplication.audienceSize}</span>
                  </p>
                )}
                {selectedApplication.website && (
                  <p className="mt-1 text-sm">
                    <a
                      href={selectedApplication.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {selectedApplication.website}
                    </a>
                  </p>
                )}
              </div>

              {/* Promotion Plan */}
              {selectedApplication.promotionPlan && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                    Promotion Plan
                  </h3>
                  <p className="whitespace-pre-wrap text-gray-900">
                    {selectedApplication.promotionPlan}
                  </p>
                </div>
              )}

              {/* Review Notes (if already reviewed) */}
              {selectedApplication.reviewNotes && (
                <div className="rounded-lg bg-gray-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold uppercase text-gray-500">
                    Review Notes
                  </h3>
                  <p className="text-gray-900">{selectedApplication.reviewNotes}</p>
                </div>
              )}

              {/* Application Date */}
              <div className="text-sm text-gray-500">
                Applied on {formatDate(selectedApplication.createdAt)}
                {selectedApplication.reviewedAt && (
                  <span> • Reviewed on {formatDate(selectedApplication.reviewedAt)}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            {selectedApplication.status === 'PENDING' && (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="flex-1 rounded-lg border border-red-300 py-2 font-medium text-red-600 hover:bg-red-50"
                >
                  Reject
                </button>
                <button
                  onClick={() => setShowApproveModal(true)}
                  className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700"
                >
                  Approve
                </button>
              </div>
            )}

            {selectedApplication.status === 'APPROVED' && selectedApplication.affiliate && (
              <div className="mt-6">
                <button
                  onClick={() =>
                    (window.location.href = `/admin/affiliates/${selectedApplication.affiliate!.id}`)
                  }
                  className="w-full rounded-lg bg-violet-600 py-2 font-medium text-white hover:bg-violet-700"
                >
                  View Affiliate Profile
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedApplication && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Approve Application</h2>
            <p className="mb-4 text-sm text-gray-600">
              Approving <strong>{selectedApplication.fullName}</strong> will create their affiliate
              account.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Commission Plan</label>
                <select
                  value={approveForm.commissionPlanId}
                  onChange={(e) =>
                    setApproveForm((f) => ({ ...f, commissionPlanId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">Select a plan (optional)</option>
                  {plans.map((plan) => {
                    // Check if plan has separate initial/recurring rates
                    const hasSeperateRates =
                      plan.initialPercentBps !== null ||
                      plan.initialFlatAmountCents !== null ||
                      plan.recurringPercentBps !== null ||
                      plan.recurringFlatAmountCents !== null;

                    let rateDisplay = '';
                    if (hasSeperateRates) {
                      const initialRate =
                        plan.planType === 'PERCENT'
                          ? formatPercent(plan.initialPercentBps ?? plan.percentBps ?? 0)
                          : formatCurrency(
                              plan.initialFlatAmountCents ?? plan.flatAmountCents ?? 0
                            );
                      const recurringRate =
                        plan.planType === 'PERCENT'
                          ? formatPercent(plan.recurringPercentBps ?? plan.percentBps ?? 0)
                          : formatCurrency(
                              plan.recurringFlatAmountCents ?? plan.flatAmountCents ?? 0
                            );
                      rateDisplay = `${initialRate} init / ${recurringRate} rec`;
                    } else {
                      rateDisplay =
                        plan.planType === 'PERCENT' && plan.percentBps
                          ? formatPercent(plan.percentBps)
                          : plan.flatAmountCents
                            ? formatCurrency(plan.flatAmountCents)
                            : 'N/A';
                    }

                    return (
                      <option key={plan.id} value={plan.id}>
                        {plan.name} ({rateDisplay})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Initial Ref Code</label>
                <input
                  type="text"
                  value={approveForm.initialRefCode}
                  onChange={(e) =>
                    setApproveForm((f) => ({ ...f, initialRefCode: e.target.value.toUpperCase() }))
                  }
                  placeholder="Auto-generated if empty"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Internal Notes</label>
                <textarea
                  value={approveForm.reviewNotes}
                  onChange={(e) => setApproveForm((f) => ({ ...f, reviewNotes: e.target.value }))}
                  placeholder="Optional notes about this approval..."
                  rows={2}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              {approveError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{approveError}</div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApproveModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approving}
                  className="flex-1 rounded-lg bg-green-600 py-2 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {approving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedApplication && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6">
            <h2 className="mb-4 text-xl font-bold text-gray-900">Reject Application</h2>
            <p className="mb-4 text-sm text-gray-600">
              Are you sure you want to reject <strong>{selectedApplication.fullName}</strong>'s
              application?
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Reason (internal notes)
                </label>
                <textarea
                  value={rejectNotes}
                  onChange={(e) => setRejectNotes(e.target.value)}
                  placeholder="Optional reason for rejection..."
                  rows={3}
                  className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRejectModal(false)}
                  className="flex-1 rounded-lg border border-gray-300 py-2 font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting}
                  className="flex-1 rounded-lg bg-red-600 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {rejecting ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
