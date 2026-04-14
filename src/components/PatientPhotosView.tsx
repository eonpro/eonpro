'use client';

/**
 * Patient Photos View Component
 *
 * Displays patient photos for provider/admin review.
 * Shows progress photos, ID verification, and medical images.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  TrendingDown,
  Shield,
  Stethoscope,
  Package,
  ChevronRight,
  Image as ImageIcon,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  XCircle,
  ZoomIn,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Pill,
  Truck,
  ExternalLink,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { apiFetch } from '@/lib/api/fetch';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  type: string;
  category: string | null;
  s3Url: string | null;
  thumbnailUrl: string | null;
  title: string | null;
  notes: string | null;
  weight: number | null;
  takenAt: string;
  verificationStatus: string;
  verifiedAt: string | null;
}

interface PackagePhotoRx {
  id: number;
  medName: string;
  strength: string;
  form: string;
  quantity: string;
  sig: string;
}

interface PackagePhotoOrder {
  id: number;
  lifefileOrderId: string | null;
  status: string | null;
  trackingNumber: string | null;
  primaryMedName: string | null;
  primaryMedStrength: string | null;
  primaryMedForm: string | null;
  createdAt: string;
  rxs: PackagePhotoRx[];
}

interface PackagePhoto {
  id: number;
  createdAt: string;
  lifefileId: string;
  trackingNumber: string | null;
  trackingSource: string | null;
  s3Url: string | null;
  contentType: string;
  fileSize: number | null;
  notes: string | null;
  matched: boolean;
  matchStrategy: string | null;
  capturedBy: { id: number; firstName: string; lastName: string };
  order: PackagePhotoOrder | null;
}

interface PatientPhotosViewProps {
  patientId: number;
  patientName: string;
}

// =============================================================================
// Helpers
// =============================================================================

const photoTypeLabels: Record<string, string> = {
  PROGRESS_FRONT: 'Front View',
  PROGRESS_SIDE: 'Side View',
  PROGRESS_BACK: 'Back View',
  ID_FRONT: 'ID Front',
  ID_BACK: 'ID Back',
  SELFIE: 'Selfie',
  MEDICAL_SKIN: 'Skin Condition',
  MEDICAL_INJECTION_SITE: 'Injection Site',
  MEDICAL_OTHER: 'Medical Image',
  PROFILE_AVATAR: 'Profile Photo',
};

const categoryLabels: Record<string, { label: string; icon: typeof Camera; color: string }> = {
  progress: {
    label: 'Progress Photos',
    icon: TrendingDown,
    color: 'text-blue-600 bg-blue-50',
  },
  verification: {
    label: 'ID Verification',
    icon: Shield,
    color: 'text-[var(--brand-primary)] bg-[var(--brand-primary-light)]',
  },
  medical: {
    label: 'Medical Images',
    icon: Stethoscope,
    color: 'text-teal-600 bg-teal-50',
  },
  pharmacy: {
    label: 'Package Photos',
    icon: Package,
    color: 'text-indigo-600 bg-indigo-50',
  },
};

const statusConfig: Record<
  string,
  { color: string; bgColor: string; label: string; icon: typeof CheckCircle }
> = {
  PENDING: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', label: 'Pending', icon: Clock },
  IN_REVIEW: { color: 'text-blue-700', bgColor: 'bg-blue-100', label: 'In Review', icon: Clock },
  VERIFIED: {
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    label: 'Verified',
    icon: CheckCircle,
  },
  REJECTED: { color: 'text-red-700', bgColor: 'bg-red-100', label: 'Rejected', icon: AlertCircle },
  EXPIRED: {
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    label: 'Resubmit',
    icon: AlertCircle,
  },
  NOT_APPLICABLE: {
    color: 'text-gray-700',
    bgColor: 'bg-gray-100',
    label: 'N/A',
    icon: CheckCircle,
  },
};

function categorizePhotos(photos: Photo[]) {
  return {
    progress: photos.filter((p) =>
      ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'].includes(p.type)
    ),
    verification: photos.filter((p) => ['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(p.type)),
    medical: photos.filter((p) => p.type.startsWith('MEDICAL_')),
  };
}

// =============================================================================
// Component
// =============================================================================

export default function PatientPhotosView({ patientId, patientName }: PatientPhotosViewProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [packagePhotos, setPackagePhotos] = useState<PackagePhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [selectedPackagePhoto, setSelectedPackagePhoto] = useState<PackagePhoto | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'progress' | 'verification' | 'medical' | 'pharmacy'
  >('all');
  const [verifying, setVerifying] = useState(false);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [verificationSuccess, setVerificationSuccess] = useState<string | null>(null);
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = useState<Photo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [photosRes, pkgRes] = await Promise.all([
        apiFetch(`/api/patient-portal/photos?patientId=${patientId}&limit=200`),
        apiFetch(`/api/patients/${patientId}/package-photos?limit=100`),
      ]);

      if (!photosRes.ok) {
        throw new Error('Failed to load photos');
      }

      const photosData = await photosRes.json();
      setPhotos(photosData.photos || []);

      if (pkgRes.ok) {
        const pkgData = await pkgRes.json();
        setPackagePhotos(pkgData.data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const handleVerify = async (
    photoId: number,
    action: 'approve' | 'reject' | 'request_resubmit'
  ) => {
    setVerifying(true);
    setVerificationSuccess(null);

    try {
      const response = await apiFetch('/api/admin/verification-queue', {
        method: 'PATCH',
        body: JSON.stringify({
          photoId,
          action,
          notes: action !== 'approve' ? verificationNotes : undefined,
        }),
      });

      if (response.ok) {
        const statusLabel =
          action === 'approve'
            ? 'approved'
            : action === 'reject'
              ? 'rejected'
              : 'marked for resubmission';
        setVerificationSuccess(`Photo ${statusLabel} successfully`);
        setVerificationNotes('');

        const newStatus =
          action === 'approve' ? 'VERIFIED' : action === 'reject' ? 'REJECTED' : 'EXPIRED';

        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? { ...p, verificationStatus: newStatus, verifiedAt: new Date().toISOString() }
              : p
          )
        );

        if (selectedPhoto?.id === photoId) {
          setSelectedPhoto((prev) =>
            prev
              ? { ...prev, verificationStatus: newStatus, verifiedAt: new Date().toISOString() }
              : prev
          );
        }

        setTimeout(() => setVerificationSuccess(null), 3000);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to update verification status');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification');
    } finally {
      setVerifying(false);
    }
  };

  const handleDeletePhoto = async (photo: Photo) => {
    setIsDeleting(true);
    try {
      const response = await apiFetch(`/api/patient-portal/photos/${photo.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
        if (selectedPhoto?.id === photo.id) setSelectedPhoto(null);
        setDeleteConfirmPhoto(null);
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Failed to delete photo');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete photo');
    } finally {
      setIsDeleting(false);
    }
  };

  const categorized = categorizePhotos(photos);
  const categorizedWithPharmacy = { ...categorized, pharmacy: packagePhotos };

  const getFilteredPhotos = () => {
    if (activeCategory === 'all' || activeCategory === 'pharmacy') return photos;
    return categorized[activeCategory] || [];
  };

  const filteredPhotos = activeCategory === 'pharmacy' ? [] : getFilteredPhotos();
  const totalCount = photos.length + packagePhotos.length;

  // Group progress photos by date for comparison view
  const progressPhotosByDate = categorized.progress.reduce(
    (acc: Record<string, Photo[]>, photo) => {
      const dateKey = format(parseISO(photo.takenAt), 'yyyy-MM-dd');
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(photo);
      return acc;
    },
    {}
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-center md:p-6">
        <AlertCircle className="mx-auto h-8 w-8 text-red-500" />
        <p className="mt-2 text-red-700">{error}</p>
        <button
          onClick={fetchPhotos}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Patient Photos</h2>
          <p className="text-sm text-gray-500">
            {totalCount} photo{totalCount !== 1 ? 's' : ''} for {patientName}
            {packagePhotos.length > 0 && (
              <span className="ml-1 text-indigo-600">({packagePhotos.length} package)</span>
            )}
          </p>
        </div>
        <button
          onClick={fetchPhotos}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Category Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(categoryLabels).map(([key, config]) => {
          const count =
            categorizedWithPharmacy[key as keyof typeof categorizedWithPharmacy]?.length || 0;
          const Icon = config.icon;
          const isActive = activeCategory === key;

          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key as any)}
              className={`rounded-xl p-4 text-left transition-all ${
                isActive ? 'ring-2 ring-[var(--brand-primary)]' : 'hover:shadow-md'
              } ${config.color}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  <div>
                    <p className="font-medium">{config.label}</p>
                    <p className="text-sm opacity-75">{count} photos</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 opacity-50" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Category Filter Tabs */}
      <div
        className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-2 [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none' as any }}
      >
        {['all', 'progress', 'verification', 'medical', 'pharmacy'].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat as any)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === cat
                ? 'bg-[var(--brand-primary-light)] text-[var(--brand-primary)]'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {cat === 'all' ? 'All Photos' : categoryLabels[cat]?.label}
          </button>
        ))}
      </div>

      {/* Package Photos Grid (pharmacy tab or "all" tab) */}
      {(activeCategory === 'pharmacy' || activeCategory === 'all') && packagePhotos.length > 0 && (
        <div className="space-y-3">
          {activeCategory === 'all' && (
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-gray-900">Package Photos from Pharmacy</h3>
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {packagePhotos.length}
              </span>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {packagePhotos.map((pkg) => (
              <div
                key={`pkg-${pkg.id}`}
                onClick={() => setSelectedPackagePhoto(pkg)}
                className="group cursor-pointer overflow-hidden rounded-xl border border-indigo-200 bg-white transition-shadow hover:shadow-md"
              >
                <div className="relative aspect-[4/3] bg-gray-100">
                  {pkg.s3Url ? (
                    <img
                      src={pkg.s3Url}
                      alt={`Package ${pkg.lifefileId}`}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = 'none';
                        const fallback = target.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="flex h-full flex-col items-center justify-center gap-1"
                    style={{ display: pkg.s3Url ? 'none' : 'flex' }}
                  >
                    <Package className="h-6 w-6 text-gray-400" />
                    <p className="text-[10px] text-gray-400">Image not available</p>
                  </div>

                  {pkg.order && (
                    <div className="absolute bottom-2 left-2 right-2">
                      <span className="inline-flex w-full items-center justify-center gap-1 rounded-full bg-indigo-600/90 px-2 py-1 text-xs font-medium text-white">
                        <Pill className="h-3 w-3" />
                        {pkg.order.primaryMedName || 'Rx Linked'}
                      </span>
                    </div>
                  )}

                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/30">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>

                <div className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-gray-800">
                      LF-{pkg.lifefileId}
                    </span>
                    {pkg.matched && (
                      <CheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                    )}
                  </div>
                  {pkg.order?.primaryMedName && (
                    <p className="mt-0.5 truncate text-xs text-indigo-600">
                      {pkg.order.primaryMedName} {pkg.order.primaryMedStrength || ''}
                    </p>
                  )}
                  {pkg.trackingNumber && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-gray-500">
                      <Truck className="h-3 w-3" />
                      {pkg.trackingNumber}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {format(parseISO(pkg.createdAt), 'MMM d, yyyy h:mm a')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patient Photos Grid */}
      {activeCategory !== 'pharmacy' && (
        <>
          {activeCategory === 'all' && photos.length > 0 && packagePhotos.length > 0 && (
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-gray-600" />
              <h3 className="text-sm font-semibold text-gray-900">Patient Photos</h3>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {photos.length}
              </span>
            </div>
          )}
          {filteredPhotos.length === 0 && packagePhotos.length === 0 ? (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <Camera className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No photos found</p>
              <p className="text-sm text-gray-400">
                {activeCategory === 'all'
                  ? 'This patient has not uploaded any photos yet.'
                  : `No ${categoryLabels[activeCategory]?.label?.toLowerCase() || activeCategory} photos uploaded.`}
              </p>
            </div>
          ) : filteredPhotos.length === 0 && activeCategory !== 'all' ? (
            <div className="rounded-xl bg-gray-50 py-12 text-center">
              <Camera className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-2 text-gray-500">No photos found</p>
              <p className="text-sm text-gray-400">
                {`No ${categoryLabels[activeCategory]?.label?.toLowerCase() || activeCategory} photos uploaded.`}
              </p>
            </div>
          ) : filteredPhotos.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredPhotos.map((photo) => {
                const status =
                  statusConfig[photo.verificationStatus] || statusConfig.NOT_APPLICABLE;
                const StatusIcon = status.icon;

                return (
                  <div
                    key={photo.id}
                    onClick={() => setSelectedPhoto(photo)}
                    className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
                  >
                    <div className="relative aspect-[3/4] bg-gray-100">
                      {photo.thumbnailUrl || photo.s3Url ? (
                        <img
                          src={photo.thumbnailUrl || photo.s3Url || ''}
                          alt={photoTypeLabels[photo.type] || photo.type}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            const target = e.currentTarget;
                            target.style.display = 'none';
                            const fallback = target.nextElementSibling as HTMLElement | null;
                            if (fallback) fallback.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="flex h-full flex-col items-center justify-center gap-1"
                        style={{ display: photo.thumbnailUrl || photo.s3Url ? 'none' : 'flex' }}
                      >
                        <AlertCircle className="h-6 w-6 text-gray-400" />
                        <p className="text-[10px] text-gray-400">Image not available</p>
                      </div>

                      {['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(photo.type) && (
                        <div className="absolute bottom-2 left-2 right-2">
                          <span
                            className={`inline-flex w-full items-center justify-center gap-1 rounded-full px-2 py-1 text-xs font-medium ${status.bgColor} ${status.color}`}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {status.label}
                          </span>
                        </div>
                      )}

                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/30">
                        <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </div>

                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-gray-700">
                        {photoTypeLabels[photo.type] || photo.type}
                      </p>
                      <p className="text-xs text-gray-500">
                        {format(parseISO(photo.takenAt), 'MMM d, yyyy')}
                      </p>
                      {photo.weight && (
                        <p className="mt-1 text-xs font-medium text-[var(--brand-primary)]">
                          {photo.weight} lbs
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </>
      )}

      {/* Empty state when pharmacy tab has no photos */}
      {activeCategory === 'pharmacy' && packagePhotos.length === 0 && (
        <div className="rounded-xl bg-gray-50 py-12 text-center">
          <Package className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No package photos</p>
          <p className="text-sm text-gray-400">
            No pharmacy package photos have been linked to this patient yet.
          </p>
        </div>
      )}

      {/* Progress Photo Comparison View */}
      {activeCategory === 'progress' && Object.keys(progressPhotosByDate).length > 1 && (
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 font-semibold text-gray-900">Progress Timeline</h3>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {Object.entries(progressPhotosByDate)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, datePhotos]) => (
                <div key={date} className="flex-shrink-0">
                  <p className="mb-2 text-center text-xs font-medium text-gray-500">
                    {format(parseISO(date), 'MMM d, yyyy')}
                  </p>
                  <div className="flex gap-2">
                    {datePhotos.map((photo) => (
                      <div
                        key={photo.id}
                        onClick={() => setSelectedPhoto(photo)}
                        className="h-24 w-20 cursor-pointer overflow-hidden rounded-lg bg-gray-100"
                      >
                        {photo.thumbnailUrl || photo.s3Url ? (
                          <img
                            src={photo.thumbnailUrl || photo.s3Url || ''}
                            alt={photoTypeLabels[photo.type]}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-0.5">
                            <AlertCircle className="h-4 w-4 text-gray-400" />
                            <p className="text-[8px] text-gray-400">N/A</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {datePhotos[0]?.weight && (
                    <p className="mt-1 text-center text-xs font-medium text-[var(--brand-primary)]">
                      {datePhotos[0].weight} lbs
                    </p>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Photo Detail Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-white">
            {/* Close Button */}
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col md:flex-row">
              {/* Image */}
              <div className="flex-1 bg-gray-900">
                {selectedPhoto.s3Url ? (
                  <img
                    src={selectedPhoto.s3Url}
                    alt={photoTypeLabels[selectedPhoto.type]}
                    className="h-full max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <AlertCircle className="h-12 w-12 text-gray-500" />
                    <p className="text-sm text-gray-400">Image not available</p>
                    <p className="text-xs text-gray-500">
                      The signed URL may have expired. Try refreshing.
                    </p>
                  </div>
                )}
              </div>

              {/* Details Sidebar */}
              <div className="w-full p-6 md:w-80">
                <h3 className="text-lg font-semibold text-gray-900">
                  {photoTypeLabels[selectedPhoto.type] || selectedPhoto.type}
                </h3>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Date Taken</p>
                    <p className="text-gray-900">
                      {format(parseISO(selectedPhoto.takenAt), 'MMMM d, yyyy h:mm a')}
                    </p>
                  </div>

                  {selectedPhoto.weight && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Weight</p>
                      <p className="text-lg font-semibold text-[var(--brand-primary)]">
                        {selectedPhoto.weight} lbs
                      </p>
                    </div>
                  )}

                  {['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(selectedPhoto.type) && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">
                        Verification Status
                      </p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium ${
                          statusConfig[selectedPhoto.verificationStatus]?.bgColor || 'bg-gray-100'
                        } ${statusConfig[selectedPhoto.verificationStatus]?.color || 'text-gray-700'}`}
                      >
                        {statusConfig[selectedPhoto.verificationStatus]?.label ||
                          selectedPhoto.verificationStatus}
                      </span>
                      {selectedPhoto.verifiedAt && (
                        <p className="mt-1 text-xs text-gray-500">
                          Verified: {format(parseISO(selectedPhoto.verifiedAt), 'MMM d, yyyy')}
                        </p>
                      )}

                      {/* Admin Verification Actions */}
                      {(selectedPhoto.verificationStatus === 'PENDING' ||
                        selectedPhoto.verificationStatus === 'IN_REVIEW') && (
                        <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                          <p className="text-xs font-semibold uppercase text-gray-600">
                            Verification Actions
                          </p>

                          {verificationSuccess && (
                            <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                              <CheckCircle className="h-3.5 w-3.5" />
                              {verificationSuccess}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVerify(selectedPhoto.id, 'approve')}
                              disabled={verifying}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                            >
                              {verifying ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              onClick={() => handleVerify(selectedPhoto.id, 'reject')}
                              disabled={verifying}
                              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                              {verifying ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5" />
                              )}
                              Reject
                            </button>
                          </div>

                          <button
                            onClick={() => handleVerify(selectedPhoto.id, 'request_resubmit')}
                            disabled={verifying}
                            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Request Resubmission
                          </button>

                          <textarea
                            value={verificationNotes}
                            onChange={(e) => setVerificationNotes(e.target.value)}
                            placeholder="Notes (required for reject/resubmit)..."
                            rows={2}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-[var(--brand-primary)] focus:outline-none"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {selectedPhoto.title && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Title</p>
                      <p className="text-gray-900">{selectedPhoto.title}</p>
                    </div>
                  )}

                  {selectedPhoto.notes && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Notes</p>
                      <p className="text-gray-700">{selectedPhoto.notes}</p>
                    </div>
                  )}

                  {selectedPhoto.category && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Category</p>
                      <p className="text-gray-700">{selectedPhoto.category}</p>
                    </div>
                  )}

                  {/* Delete Photo */}
                  <div className="border-t border-gray-200 pt-4">
                    <button
                      onClick={() => setDeleteConfirmPhoto(selectedPhoto)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete Photo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Package Photo Detail Modal */}
      {selectedPackagePhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white">
            <button
              onClick={() => setSelectedPackagePhoto(null)}
              className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col md:flex-row">
              <div className="flex-1 bg-gray-900">
                {selectedPackagePhoto.s3Url ? (
                  <img
                    src={selectedPackagePhoto.s3Url}
                    alt={`Package ${selectedPackagePhoto.lifefileId}`}
                    className="h-full max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <div className="flex h-96 flex-col items-center justify-center gap-2">
                    <Package className="h-12 w-12 text-gray-500" />
                    <p className="text-sm text-gray-400">Image not available</p>
                  </div>
                )}
              </div>

              <div className="w-full overflow-y-auto p-6 md:w-96">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Package Photo</h3>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">LifeFile Order ID</p>
                    <p className="font-mono text-sm font-semibold text-gray-900">
                      {selectedPackagePhoto.lifefileId}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase text-gray-500">Date Captured</p>
                    <p className="text-gray-900">
                      {format(parseISO(selectedPackagePhoto.createdAt), 'MMMM d, yyyy h:mm a')}
                    </p>
                  </div>

                  {selectedPackagePhoto.capturedBy && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Captured By</p>
                      <p className="text-gray-900">
                        {selectedPackagePhoto.capturedBy.firstName}{' '}
                        {selectedPackagePhoto.capturedBy.lastName}
                      </p>
                    </div>
                  )}

                  {selectedPackagePhoto.trackingNumber && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Tracking Number</p>
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-gray-400" />
                        <p className="font-mono text-sm text-gray-900">
                          {selectedPackagePhoto.trackingNumber}
                        </p>
                      </div>
                      {selectedPackagePhoto.trackingSource && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          Source: {selectedPackagePhoto.trackingSource}
                        </p>
                      )}
                    </div>
                  )}

                  {selectedPackagePhoto.matched && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium text-green-700">
                        Matched to patient record
                      </span>
                    </div>
                  )}

                  {/* Linked Prescription */}
                  {selectedPackagePhoto.order && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Pill className="h-4 w-4 text-indigo-600" />
                        <p className="text-xs font-semibold uppercase text-indigo-700">
                          Linked Prescription
                        </p>
                      </div>

                      <div className="space-y-2">
                        {selectedPackagePhoto.order.primaryMedName && (
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {selectedPackagePhoto.order.primaryMedName}
                              {selectedPackagePhoto.order.primaryMedStrength && (
                                <span className="ml-1 font-normal text-gray-600">
                                  {selectedPackagePhoto.order.primaryMedStrength}
                                </span>
                              )}
                            </p>
                            {selectedPackagePhoto.order.primaryMedForm && (
                              <p className="text-xs text-gray-500">
                                {selectedPackagePhoto.order.primaryMedForm}
                              </p>
                            )}
                          </div>
                        )}

                        {selectedPackagePhoto.order.lifefileOrderId && (
                          <div className="flex items-center gap-1.5 text-xs text-gray-600">
                            <ExternalLink className="h-3 w-3" />
                            Order: {selectedPackagePhoto.order.lifefileOrderId}
                          </div>
                        )}

                        {selectedPackagePhoto.order.status && (
                          <div>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                selectedPackagePhoto.order.status === 'completed' ||
                                selectedPackagePhoto.order.status === 'Shipped'
                                  ? 'bg-green-100 text-green-700'
                                  : selectedPackagePhoto.order.status === 'cancelled'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {selectedPackagePhoto.order.status}
                            </span>
                          </div>
                        )}

                        <p className="text-xs text-gray-500">
                          Prescribed:{' '}
                          {format(parseISO(selectedPackagePhoto.order.createdAt), 'MMM d, yyyy')}
                        </p>

                        {/* Rx line items */}
                        {selectedPackagePhoto.order.rxs.length > 0 && (
                          <div className="mt-2 border-t border-indigo-200 pt-2">
                            <p className="mb-1.5 text-xs font-semibold text-indigo-700">
                              Medications ({selectedPackagePhoto.order.rxs.length})
                            </p>
                            <div className="space-y-1.5">
                              {selectedPackagePhoto.order.rxs.map((rx) => (
                                <div key={rx.id} className="rounded-lg bg-white p-2 text-xs">
                                  <p className="font-medium text-gray-900">
                                    {rx.medName} {rx.strength}
                                  </p>
                                  <p className="text-gray-500">
                                    {rx.form} &middot; Qty: {rx.quantity}
                                  </p>
                                  <p className="mt-0.5 italic text-gray-400">{rx.sig}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedPackagePhoto.notes && (
                    <div>
                      <p className="text-xs font-medium uppercase text-gray-500">Notes</p>
                      <p className="text-gray-700">{selectedPackagePhoto.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Photo</h3>
                <p className="text-sm text-gray-500">
                  {photoTypeLabels[deleteConfirmPhoto.type] || deleteConfirmPhoto.type}
                </p>
              </div>
            </div>
            <p className="mb-4 text-sm text-gray-600">
              This will permanently remove this photo from the patient&apos;s record. This action
              cannot be undone.
            </p>
            {(deleteConfirmPhoto.thumbnailUrl || deleteConfirmPhoto.s3Url) && (
              <div className="mb-4 overflow-hidden rounded-xl">
                <img
                  src={deleteConfirmPhoto.thumbnailUrl || deleteConfirmPhoto.s3Url || ''}
                  alt="Photo to delete"
                  className="h-40 w-full object-cover"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmPhoto(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePhoto(deleteConfirmPhoto)}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
              >
                {isDeleting ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
