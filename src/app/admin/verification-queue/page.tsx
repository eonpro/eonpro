'use client';

/**
 * Admin ID Verification Queue
 *
 * Allows admins to review and approve/reject patient ID verification photos.
 * Displays ID front, ID back, and selfie photos for comparison.
 */

import { useEffect, useState, useCallback } from 'react';
import { formatPatientDisplayId } from '@/lib/utils/formatPatientDisplayId';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  User,
  CreditCard,
  Camera,
  Loader2,
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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  PENDING: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Pending' },
  IN_REVIEW: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'In Review' },
  VERIFIED: { color: 'text-green-700', bgColor: 'bg-green-100', label: 'Verified' },
  REJECTED: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Rejected' },
  EXPIRED: { color: 'text-orange-700', bgColor: 'bg-orange-100', label: 'Resubmit Required' },
  NOT_APPLICABLE: { color: 'text-gray-700', bgColor: 'bg-gray-100', label: 'N/A' },
};

const photoTypeLabels: Record<string, string> = {
  ID_FRONT: 'ID Front',
  ID_BACK: 'ID Back',
  SELFIE: 'Selfie',
};

// =============================================================================
// Component
// =============================================================================

export default function VerificationQueuePage() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [selectedVerification, setSelectedVerification] = useState<Verification | null>(null);
  const [processing, setProcessing] = useState(false);
  const [rejectionNotes, setRejectionNotes] = useState('');

  const fetchVerifications = useCallback(async () => {
    setLoading(true);

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
      });

      if (statusFilter !== 'all') {
        params.set('status', statusFilter);
      }

      const response = await apiFetch(`/api/admin/verification-queue?${params}`);

      if (response.ok) {
        setData(await response.json());
      }
    } catch (error) {
      console.error('Failed to fetch verifications:', error);
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
        // Refresh the list
        await fetchVerifications();
        setRejectionNotes('');

        // If reviewing a specific verification, update its photos
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

          // Check if all photos are verified
          const allVerified = updatedPhotos.every((p) => p.verificationStatus === 'VERIFIED');
          if (allVerified) {
            setTimeout(() => {
              setSelectedVerification(null);
              fetchVerifications();
            }, 1500);
          }
        }
      }
    } catch (error) {
      console.error('Failed to verify:', error);
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
            body: JSON.stringify({
              photoId: photo.id,
              action: 'approve',
            }),
          });
        } catch (error) {
          console.error('Failed to approve photo:', photo.id);
        }
      }
    }

    setSelectedVerification(null);
    fetchVerifications();
    setProcessing(false);
  };

  if (loading && !data) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ID Verification Queue</h1>
          <p className="text-gray-500">Review and verify patient identity documents</p>
        </div>
        <button
          onClick={fetchVerifications}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-yellow-50 p-4">
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-2xl font-bold text-yellow-700">
                {data?.stats.byStatus.PENDING || 0}
              </p>
              <p className="text-sm text-yellow-600">Pending</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Eye className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {data?.stats.byStatus.IN_REVIEW || 0}
              </p>
              <p className="text-sm text-blue-600">In Review</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">
                {data?.stats.byStatus.VERIFIED || 0}
              </p>
              <p className="text-sm text-green-600">Verified</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-4">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">
                {(data?.stats.byStatus.REJECTED || 0) + (data?.stats.byStatus.EXPIRED || 0)}
              </p>
              <p className="text-sm text-red-600">Rejected</p>
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
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="IN_REVIEW">In Review</option>
          <option value="VERIFIED">Verified</option>
          <option value="REJECTED">Rejected</option>
          <option value="EXPIRED">Resubmit Required</option>
        </select>
      </div>

      {/* Verifications List */}
      <div className="space-y-4">
        {data?.verifications.map((verification) => {
          const pendingCount = verification.photos.filter(
            (p) => p.verificationStatus === 'PENDING' || p.verificationStatus === 'IN_REVIEW'
          ).length;
          const verifiedCount = verification.photos.filter(
            (p) => p.verificationStatus === 'VERIFIED'
          ).length;

          return (
            <div
              key={verification.patient.id}
              className="overflow-hidden rounded-xl bg-white shadow-sm"
            >
              <div className="border-b border-gray-100 bg-gray-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary-light)]">
                      <User className="h-6 w-6 text-[var(--brand-primary)]" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {verification.patient.firstName} {verification.patient.lastName}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {verification.patient.email} • ID: {formatPatientDisplayId(verification.patient.patientId, verification.patient.id)}
                      </p>
                      <p className="text-xs text-gray-400">{verification.clinic.name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {verifiedCount}/{verification.photos.length} verified
                      </p>
                      {pendingCount > 0 && (
                        <p className="text-xs text-yellow-600">{pendingCount} pending review</p>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedVerification(verification)}
                      className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:brightness-90"
                    >
                      <Eye className="h-4 w-4" />
                      Review
                    </button>
                  </div>
                </div>
              </div>

              {/* Photo thumbnails */}
              <div className="flex gap-4 p-4">
                {verification.photos.map((photo) => {
                  const status = statusConfig[photo.verificationStatus] || statusConfig.PENDING;
                  return (
                    <div key={photo.id} className="flex-1">
                      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100">
                        {photo.thumbnailUrl || photo.s3Url ? (
                          <img
                            src={photo.thumbnailUrl || photo.s3Url || ''}
                            alt={photoTypeLabels[photo.type]}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Camera className="h-8 w-8 text-gray-300" />
                          </div>
                        )}
                        <div className="absolute bottom-2 left-2 right-2">
                          <span
                            className={`inline-flex w-full justify-center rounded-full px-2 py-1 text-xs font-medium ${status.bgColor} ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-center text-xs font-medium text-gray-500">
                        {photoTypeLabels[photo.type]}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {(!data?.verifications || data.verifications.length === 0) && (
        <div className="rounded-xl bg-white py-12 text-center shadow-sm">
          <Shield className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No verifications found</p>
          <p className="text-sm text-gray-400">
            {statusFilter === 'PENDING'
              ? 'No pending verifications to review'
              : 'Try changing the filter'}
          </p>
        </div>
      )}

      {/* Pagination */}
      {data?.pagination && data.pagination.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-white px-6 py-3 shadow-sm">
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

      {/* Verification Review Modal */}
      {selectedVerification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white">
            {/* Modal Header */}
            <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand-primary-light)]">
                    <User className="h-6 w-6 text-[var(--brand-primary)]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {selectedVerification.patient.firstName}{' '}
                      {selectedVerification.patient.lastName}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {selectedVerification.patient.email} • {selectedVerification.clinic.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedVerification(null)}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
            </div>

            {/* Photos Grid */}
            <div className="grid gap-6 p-6 md:grid-cols-3">
              {selectedVerification.photos.map((photo) => {
                const status = statusConfig[photo.verificationStatus] || statusConfig.PENDING;
                const isPending =
                  photo.verificationStatus === 'PENDING' ||
                  photo.verificationStatus === 'IN_REVIEW';

                return (
                  <div key={photo.id} className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {photo.type === 'SELFIE' ? (
                            <Camera className="h-4 w-4 text-gray-500" />
                          ) : (
                            <CreditCard className="h-4 w-4 text-gray-500" />
                          )}
                          <span className="font-medium text-gray-700">
                            {photoTypeLabels[photo.type]}
                          </span>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.bgColor} ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>

                    {/* Photo */}
                    <div className="aspect-[3/4] bg-gray-100">
                      {photo.s3Url ? (
                        <img
                          src={photo.s3Url}
                          alt={photoTypeLabels[photo.type]}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <AlertTriangle className="h-8 w-8 text-gray-300" />
                          <p className="text-sm text-gray-400">Image unavailable</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    {isPending && (
                      <div className="border-t border-gray-100 p-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleVerify(photo.id, 'approve')}
                            disabled={processing}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleVerify(photo.id, 'reject')}
                            disabled={processing}
                            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Verification info */}
                    {photo.verifiedAt && (
                      <div className="border-t border-gray-100 bg-gray-50 px-3 py-2">
                        <p className="text-xs text-gray-500">
                          Verified: {formatDate(photo.verifiedAt)}
                        </p>
                        {photo.verificationNotes && (
                          <p className="mt-1 text-xs text-gray-600">{photo.verificationNotes}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Rejection Notes */}
            <div className="border-t border-gray-100 px-6 py-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Notes (for rejection/resubmit)
              </label>
              <textarea
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                placeholder="Enter reason for rejection or resubmit request..."
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              />
            </div>

            {/* Footer Actions */}
            <div className="sticky bottom-0 border-t border-gray-100 bg-gray-50 px-6 py-4">
              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedVerification(null)}
                  className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
                <button
                  onClick={() => handleApproveAll(selectedVerification)}
                  disabled={
                    processing ||
                    !selectedVerification.photos.some(
                      (p) =>
                        p.verificationStatus === 'PENDING' || p.verificationStatus === 'IN_REVIEW'
                    )
                  }
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  Approve All Pending
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
