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
  ChevronRight,
  Image as ImageIcon,
  CheckCircle,
  Clock,
  AlertCircle,
  X,
  ZoomIn,
  Loader2,
  RefreshCw,
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const [activeCategory, setActiveCategory] = useState<
    'all' | 'progress' | 'verification' | 'medical'
  >('all');

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiFetch(`/api/patient-portal/photos?patientId=${patientId}&limit=200`);

      if (!response.ok) {
        throw new Error('Failed to load photos');
      }

      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const categorized = categorizePhotos(photos);

  const getFilteredPhotos = () => {
    if (activeCategory === 'all') return photos;
    return categorized[activeCategory] || [];
  };

  const filteredPhotos = getFilteredPhotos();

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
      <div className="rounded-xl bg-red-50 p-6 text-center">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Patient Photos</h2>
          <p className="text-sm text-gray-500">
            {photos.length} photo{photos.length !== 1 ? 's' : ''} for {patientName}
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
      <div className="grid gap-4 sm:grid-cols-3">
        {Object.entries(categoryLabels).map(([key, config]) => {
          const count = categorized[key as keyof typeof categorized]?.length || 0;
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
      <div className="flex gap-2 border-b border-gray-200 pb-2">
        {['all', 'progress', 'verification', 'medical'].map((cat) => (
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

      {/* Photo Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="rounded-xl bg-gray-50 py-12 text-center">
          <Camera className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-2 text-gray-500">No photos found</p>
          <p className="text-sm text-gray-400">
            {activeCategory === 'all'
              ? 'This patient has not uploaded any photos yet.'
              : `No ${categoryLabels[activeCategory]?.label?.toLowerCase() || activeCategory} photos uploaded.`}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filteredPhotos.map((photo) => {
            const status = statusConfig[photo.verificationStatus] || statusConfig.NOT_APPLICABLE;
            const StatusIcon = status.icon;

            return (
              <div
                key={photo.id}
                onClick={() => setSelectedPhoto(photo)}
                className="group cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
              >
                {/* Photo */}
                <div className="relative aspect-[3/4] bg-gray-100">
                  {photo.thumbnailUrl || photo.s3Url ? (
                    <img
                      src={photo.thumbnailUrl || photo.s3Url || ''}
                      alt={photoTypeLabels[photo.type] || photo.type}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-gray-300" />
                    </div>
                  )}

                  {/* Verification Badge */}
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

                  {/* Zoom Icon on Hover */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-all group-hover:bg-black/30">
                    <ZoomIn className="h-8 w-8 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  </div>
                </div>

                {/* Photo Info */}
                <div className="p-2">
                  <p className="truncate text-xs font-medium text-gray-700">
                    {photoTypeLabels[photo.type] || photo.type}
                  </p>
                  <p className="text-xs text-gray-500">
                    {format(parseISO(photo.takenAt), 'MMM d, yyyy')}
                  </p>
                  {photo.weight && (
                    <p className="mt-1 text-xs font-medium text-[var(--brand-primary)]">{photo.weight} lbs</p>
                  )}
                </div>
              </div>
            );
          })}
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
                          <div className="flex h-full items-center justify-center">
                            <ImageIcon className="h-6 w-6 text-gray-300" />
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
                  <div className="flex h-96 items-center justify-center">
                    <ImageIcon className="h-16 w-16 text-gray-600" />
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
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
