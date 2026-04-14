'use client';

/**
 * Admin ID Verification Queue
 *
 * Modern card-based UI for reviewing and approving/rejecting patient ID photos.
 * Displays compact cards with photo thumbnails, patient info, and quick actions.
 */

import { useEffect, useState, useCallback } from 'react';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Shield,
  ShieldCheck,
  ShieldX,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  User,
  CreditCard,
  Camera,
  Loader2,
  AlertTriangle,
  X,
  Check,
  RotateCcw,
  Search,
} from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  type: 'ID_FRONT' | 'ID_BACK' | 'SELFIE';
  s3Url: string | null;
  thumbnailUrl: string | null;
  verificationStatus: string;
  verificationNotes: string | null;
  verifiedAt: string | null;
}

interface Patient {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  patientId: string;
}

interface Clinic {
  id: number;
  name: string;
}

interface Verification {
  patient: Patient;
  clinic: Clinic;
  photos: Photo[];
}

interface VerificationData {
  verifications: Verification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  stats: {
    byStatus: Record<string, number>;
  };
}

// =============================================================================
// Helpers
// =============================================================================

function timeAgo(dateStr: string): string {
  const now = new Date();
  const then = new Date(dateStr);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const photoTypeConfig: Record<string, { label: string; icon: typeof CreditCard }> = {
  ID_FRONT: { label: 'Front', icon: CreditCard },
  ID_BACK: { label: 'Back', icon: CreditCard },
  SELFIE: { label: 'Selfie', icon: Camera },
};

const statusTabs = [
  { key: 'PENDING', label: 'Pending', icon: Clock },
  { key: 'VERIFIED', label: 'Verified', icon: ShieldCheck },
  { key: 'REJECTED', label: 'Rejected', icon: ShieldX },
  { key: 'all', label: 'All', icon: Shield },
];

// =============================================================================
// Component
// =============================================================================

export default function VerificationQueuePage() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchVerifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: '20' });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const response = await apiFetch(`/api/admin/verification-queue?${params}`);
      if (response.ok) {
        setData(await response.json());
        return;
      }

      const payload = await response.json().catch(() => ({}));
      const message =
        (payload as { error?: string })?.error ||
        (response.status === 403
          ? 'Access denied for ID verification queue.'
          : 'Failed to load verification queue.');
      setError(message);
      setData({
        verifications: [],
        pagination: { page, limit: 20, total: 0, totalPages: 0 },
        stats: { byStatus: {} },
      });
    } catch (error) {
      process.env.NODE_ENV === 'development' &&
        console.error('Failed to fetch verifications:', error);
      setError('Failed to load verification queue.');
      setData({
        verifications: [],
        pagination: { page, limit: 20, total: 0, totalPages: 0 },
        stats: { byStatus: {} },
      });
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  const handleVerify = async (
    photoId: number,
    action: 'approve' | 'reject' | 'request_resubmit'
  ) => {
    setProcessing(true);
    try {
      const response = await apiFetch('/api/admin/verification-queue', {
        method: 'PATCH',
        body: JSON.stringify({
          photoId,
          action,
          notes: action === 'reject' || action === 'request_resubmit' ? rejectionNotes : undefined,
        }),
      });
      if (response.ok) {
        await fetchVerifications();
        setRejectionNotes('');
        if (selectedVerification) {
          const updatedPhotos = selectedVerification.photos.map((p) =>
            p.id === photoId
              ? {
                  ...p,
                  verificationStatus:
                    action === 'approve'
                      ? 'VERIFIED'
                      : action === 'reject'
                        ? 'REJECTED'
                        : 'EXPIRED',
                }
              : p
          );
          setSelectedVerification({ ...selectedVerification, photos: updatedPhotos });
          if (updatedPhotos.every((p) => p.verificationStatus === 'VERIFIED')) {
            setTimeout(() => {
              setSelectedVerification(null);
              fetchVerifications();
            }, 1200);
          }
        }
      }
    } catch (error) {
      process.env.NODE_ENV === 'development' && console.error('Failed to verify:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleApproveAll = async (verification: Verification) => {
    setProcessing(true);
    for (const photo of verification.photos) {
      if (photo.verificationStatus === 'PENDING' || photo.verificationStatus === 'IN_REVIEW') {
        try {
          await apiFetch('/api/admin/verification-queue', {
            method: 'PATCH',
            body: JSON.stringify({ photoId: photo.id, action: 'approve' }),
          });
        } catch (error) {
          process.env.NODE_ENV === 'development' &&
            console.error('Failed to approve photo:', photo.id);
        }
      }
    }
    setSelectedVerification(null);
    fetchVerifications();
    setProcessing(false);
  };

  const filteredVerifications = (data?.verifications || []).filter((v) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      v.patient.firstName.toLowerCase().includes(term) ||
      v.patient.lastName.toLowerCase().includes(term) ||
      v.patient.email.toLowerCase().includes(term) ||
      formatPatientDisplayId(v.patient.patientId, v.patient.id).toLowerCase().includes(term)
    );
  });

  const pendingCount = data?.stats.byStatus.PENDING || 0;
  const verifiedCount = data?.stats.byStatus.VERIFIED || 0;
  const rejectedCount = (data?.stats.byStatus.REJECTED || 0) + (data?.stats.byStatus.EXPIRED || 0);

  // =========================================================================
  // Loading State
  // =========================================================================
  if (loading && !data) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-400" />
          <p className="mt-3 text-sm text-gray-500">Loading verifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      {/* ================================================================= */}
      {/* Header */}
      {/* ================================================================= */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
              <Shield className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">ID Verification</h1>
              <p className="text-sm text-gray-500">Review patient identity documents</p>
            </div>
          </div>
          <button
            onClick={fetchVerifications}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Stats Row */}
      {/* ================================================================= */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-amber-700">{pendingCount}</p>
              <p className="text-xs font-medium text-amber-600/70">Awaiting Review</p>
            </div>
            <Clock className="h-5 w-5 text-amber-400" />
          </div>
        </div>
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-emerald-700">{verifiedCount}</p>
              <p className="text-xs font-medium text-emerald-600/70">Verified</p>
            </div>
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-red-700">{rejectedCount}</p>
              <p className="text-xs font-medium text-red-600/70">Rejected</p>
            </div>
            <ShieldX className="h-5 w-5 text-red-400" />
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* Filters: Tabs + Search */}
      {/* ================================================================= */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-lg bg-gray-100/80 p-1">
          {statusTabs.map((tab) => {
            const isActive = statusFilter === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusFilter(tab.key);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 shadow-sm focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64"
          />
        </div>
      </div>

      {/* ================================================================= */}
      {/* Verification Cards */}
      {/* ================================================================= */}
      <div className="space-y-3">
        {filteredVerifications?.map((verification) => {
          const pending = verification.photos.filter(
            (p) => p.verificationStatus === 'PENDING' || p.verificationStatus === 'IN_REVIEW'
          );
          const verified = verification.photos.filter((p) => p.verificationStatus === 'VERIFIED');
          const allVerified = verified.length === verification.photos.length;
          const hasRejection = verification.photos.some(
            (p) => p.verificationStatus === 'REJECTED' || p.verificationStatus === 'EXPIRED'
          );
          const latestDate = verification.photos.reduce(
            (latest, p) => (p.createdAt > latest ? p.createdAt : latest),
            verification.photos[0]?.createdAt || ''
          );

          return (
            <div
              key={verification.patient.id}
              className={`group overflow-hidden rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
                allVerified
                  ? 'border-emerald-200'
                  : hasRejection
                    ? 'border-red-200'
                    : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-4 p-4">
                {/* Patient Avatar */}
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100">
                  <User className="h-5 w-5 text-gray-400" />
                </div>

                {/* Patient Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold text-gray-900">
                      {verification.patient.firstName} {verification.patient.lastName}
                    </h3>
                    {allVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Verified
                      </span>
                    )}
                    {hasRejection && !allVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-600">
                        <XCircle className="h-3 w-3" /> Rejected
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-gray-500">
                    ID:{' '}
                    {formatPatientDisplayId(
                      verification.patient.patientId,
                      verification.patient.id
                    )}
                    <span className="mx-1.5 text-gray-300">·</span>
                    {verification.clinic.name}
                    <span className="mx-1.5 text-gray-300">·</span>
                    {timeAgo(latestDate)}
                  </p>
                </div>

                {/* Photo Thumbnails */}
                <div className="hidden items-center gap-1.5 sm:flex">
                  {verification.photos.map((photo) => {
                    const isVerified = photo.verificationStatus === 'VERIFIED';
                    const isRejected =
                      photo.verificationStatus === 'REJECTED' ||
                      photo.verificationStatus === 'EXPIRED';
                    return (
                      <div
                        key={photo.id}
                        className={`relative h-12 w-10 overflow-hidden rounded-lg border-2 ${
                          isVerified
                            ? 'border-emerald-400'
                            : isRejected
                              ? 'border-red-400'
                              : 'border-gray-200'
                        }`}
                      >
                        {photo.thumbnailUrl || photo.s3Url ? (
                          <img
                            src={photo.thumbnailUrl || photo.s3Url || ''}
                            alt={photoTypeConfig[photo.type]?.label || photo.type}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gray-50">
                            <Camera className="h-3 w-3 text-gray-300" />
                          </div>
                        )}
                        {isVerified && (
                          <div className="absolute -bottom-px -right-px rounded-tl-md bg-emerald-500 p-0.5">
                            <Check className="h-2 w-2 text-white" />
                          </div>
                        )}
                        {isRejected && (
                          <div className="absolute -bottom-px -right-px rounded-tl-md bg-red-500 p-0.5">
                            <X className="h-2 w-2 text-white" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress + Action */}
                <div className="flex items-center gap-3">
                  <div className="hidden text-right sm:block">
                    <p className="text-xs font-medium text-gray-900">
                      {verified.length}/{verification.photos.length}
                    </p>
                    <p className="text-[10px] text-gray-400">verified</p>
                  </div>
                  <button
                    onClick={() => setSelectedVerification(verification)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm transition-all hover:bg-gray-800"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Review
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ================================================================= */}
      {/* Empty State */}
      {/* ================================================================= */}
      {filteredVerifications.length === 0 && (
        <div className="mt-2 rounded-xl border border-dashed border-gray-200 bg-white py-16 text-center">
          <Shield className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">
            {searchTerm ? 'No matching verifications' : 'No verifications found'}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {statusFilter === 'PENDING'
              ? 'All caught up — no pending reviews'
              : searchTerm
                ? 'Try a different search term'
                : 'Try changing the filter'}
          </p>
        </div>
      )}

      {/* ================================================================= */}
      {/* Pagination */}
      {/* ================================================================= */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Page {data.pagination.page} of {data.pagination.totalPages}
          </p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page === data.pagination.totalPages}
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 shadow-sm hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* Review Modal */}
      {/* ================================================================= */}
      {selectedVerification && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedVerification(null);
          }}
        >
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    {selectedVerification.patient.firstName} {selectedVerification.patient.lastName}
                  </h2>
                  <p className="text-xs text-gray-500">
                    {selectedVerification.clinic.name}
                    <span className="mx-1.5 text-gray-300">·</span>
                    ID:{' '}
                    {formatPatientDisplayId(
                      selectedVerification.patient.patientId,
                      selectedVerification.patient.id
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedVerification(null)}
                className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Photos Grid */}
            <div className="max-h-[60vh] overflow-y-auto p-6">
              <div className="grid gap-4 sm:grid-cols-3">
                {selectedVerification.photos.map((photo) => {
                  const isPending =
                    photo.verificationStatus === 'PENDING' ||
                    photo.verificationStatus === 'IN_REVIEW';
                  const isVerified = photo.verificationStatus === 'VERIFIED';
                  const isRejected =
                    photo.verificationStatus === 'REJECTED' ||
                    photo.verificationStatus === 'EXPIRED';
                  const typeInfo = photoTypeConfig[photo.type] || {
                    label: photo.type,
                    icon: Camera,
                  };
                  const Icon = typeInfo.icon;

                  return (
                    <div
                      key={photo.id}
                      className={`overflow-hidden rounded-xl border-2 transition-all ${
                        isVerified
                          ? 'border-emerald-300 bg-emerald-50/30'
                          : isRejected
                            ? 'border-red-300 bg-red-50/30'
                            : 'border-gray-200 bg-white'
                      }`}
                    >
                      {/* Photo Label */}
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-gray-400" />
                          <span className="text-xs font-medium text-gray-600">
                            {typeInfo.label}
                          </span>
                        </div>
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600">
                            <Clock className="h-3 w-3" /> Pending
                          </span>
                        )}
                      </div>

                      {/* Photo */}
                      <div className="aspect-[4/3] bg-gray-100">
                        {photo.s3Url ? (
                          <img
                            src={photo.s3Url}
                            alt={typeInfo.label}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-1">
                            <AlertTriangle className="h-5 w-5 text-gray-300" />
                            <p className="text-[10px] text-gray-400">Unavailable</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {isPending && (
                        <div className="flex gap-1.5 p-2">
                          <button
                            onClick={() => handleVerify(photo.id, 'approve')}
                            disabled={processing}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleVerify(photo.id, 'reject')}
                            disabled={processing}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-white py-2 text-xs font-medium text-red-600 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            <X className="h-3 w-3" />
                            Reject
                          </button>
                        </div>
                      )}

                      {/* Verification Metadata */}
                      {photo.verifiedAt && (
                        <div className="border-t border-gray-100 px-3 py-1.5">
                          <p className="text-[10px] text-gray-400">
                            {new Date(photo.verifiedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </p>
                          {photo.verificationNotes && (
                            <p className="mt-0.5 text-[10px] text-gray-500">
                              {photo.verificationNotes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Rejection Notes */}
              {selectedVerification.photos.some(
                (p) => p.verificationStatus === 'PENDING' || p.verificationStatus === 'IN_REVIEW'
              ) && (
                <div className="mt-4">
                  <textarea
                    value={rejectionNotes}
                    onChange={(e) => setRejectionNotes(e.target.value)}
                    placeholder="Add notes (optional, for rejection or resubmit requests)..."
                    rows={2}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6 py-3">
              <button
                onClick={() => setSelectedVerification(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Close
              </button>
              <div className="flex gap-2">
                {selectedVerification.photos.some(
                  (p) => p.verificationStatus === 'PENDING' || p.verificationStatus === 'IN_REVIEW'
                ) && (
                  <>
                    <button
                      onClick={() => {
                        for (const photo of selectedVerification.photos) {
                          if (
                            photo.verificationStatus === 'PENDING' ||
                            photo.verificationStatus === 'IN_REVIEW'
                          ) {
                            handleVerify(photo.id, 'request_resubmit');
                          }
                        }
                      }}
                      disabled={processing}
                      className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-50 disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Request Resubmit
                    </button>
                    <button
                      onClick={() => handleApproveAll(selectedVerification)}
                      disabled={processing}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {processing ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      Approve All
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
