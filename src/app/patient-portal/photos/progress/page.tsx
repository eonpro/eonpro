'use client';

/**
 * Progress Photos Page
 *
 * Allows patients to upload and view progress photos with:
 * - Photo upload for front, side, and back views
 * - Weight correlation with photos
 * - Timeline view of progress
 * - Before/after comparison tool
 */

import { useState, useEffect, useCallback } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { PhotoUploader, PhotoGallery, PhotoComparison } from '@/components/patient-portal/photos';
import {
  Camera,
  TrendingDown,
  TrendingUp,
  Calendar,
  Scale,
  ChevronRight,
  Plus,
  ArrowLeft,
  Clock,
  Image as ImageIcon,
  Layers,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { PatientPhotoType } from '@prisma/client';
import { format, parseISO, differenceInDays } from 'date-fns';
import Link from 'next/link';

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  updatedAt: string;
  type: PatientPhotoType;
  category: string | null;
  s3Url: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  notes: string | null;
  weight: number | null;
  takenAt: string;
  verificationStatus: any;
  verifiedAt: string | null;
  isPrivate: boolean;
  isDeleted: boolean;
}

interface PhotoStats {
  total: number;
  byType: Record<string, number>;
  firstPhoto?: Photo;
  latestPhoto?: Photo;
  totalWeightChange: number;
}

type ViewMode = 'gallery' | 'upload' | 'compare';
type UploadType = 'PROGRESS_FRONT' | 'PROGRESS_SIDE' | 'PROGRESS_BACK';

// =============================================================================
// Progress Photo Types
// =============================================================================

const PROGRESS_TYPES: { type: PatientPhotoType; label: string; description: string }[] = [
  { type: 'PROGRESS_FRONT', label: 'Front View', description: 'Face the camera directly' },
  { type: 'PROGRESS_SIDE', label: 'Side View', description: 'Turn sideways to the camera' },
  { type: 'PROGRESS_BACK', label: 'Back View', description: 'Face away from the camera' },
];

const UPLOAD_GUIDELINES = [
  'Take photos in consistent lighting and location',
  'Wear form-fitting clothes to see progress clearly',
  'Stand in the same position each time',
  'Take all three views (front, side, back) together',
  'Log your current weight for better tracking',
];

// =============================================================================
// Component
// =============================================================================

export default function ProgressPhotosPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [uploadType, setUploadType] = useState<UploadType>('PROGRESS_FRONT');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [currentWeight, setCurrentWeight] = useState<string>('');
  const [uploadedCount, setUploadedCount] = useState(0);
  const [comparePhotos, setComparePhotos] = useState<{ before: Photo | null; after: Photo | null }>(
    {
      before: null,
      after: null,
    }
  );
  const [showSuccess, setShowSuccess] = useState(false);

  // Fetch photos
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const response = await portalFetch(
        `/api/patient-portal/photos?type=PROGRESS_FRONT&type=PROGRESS_SIDE&type=PROGRESS_BACK`
      );

      if (!response.ok) {
        throw new Error('Failed to load photos');
      }

      const data = await safeParseJson(response);
      const allPhotos: Photo[] =
        data !== null && typeof data === 'object' && 'photos' in data
          ? ((data as { photos?: Photo[] }).photos ?? [])
          : [];

      // Filter to only progress photos
      const progressPhotos = allPhotos.filter((p) =>
        ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'].includes(p.type)
      );

      setPhotos(progressPhotos);

      // Calculate stats
      if (progressPhotos.length > 0) {
        const sorted = [...progressPhotos].sort(
          (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()
        );
        const first = sorted[0];
        const latest = sorted[sorted.length - 1];

        const byType = progressPhotos.reduce(
          (acc, p) => {
            acc[p.type] = (acc[p.type] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        );

        const firstWeight = first?.weight;
        const latestWeight = latest?.weight;
        const weightChange = firstWeight && latestWeight ? latestWeight - firstWeight : 0;

        setStats({
          total: progressPhotos.length,
          byType,
          firstPhoto: first,
          latestPhoto: latest,
          totalWeightChange: weightChange,
        });
      } else {
        setStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Handle upload complete
  const handleUploadComplete = () => {
    setUploadedCount((prev) => prev + 1);

    // After uploading all three types, show success and go back to gallery
    if (uploadedCount >= 2) {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        setViewMode('gallery');
        setUploadedCount(0);
        fetchPhotos();
      }, 2000);
    } else {
      // Move to next type
      const typeOrder: UploadType[] = ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'];
      const currentIndex = typeOrder.indexOf(uploadType);
      if (currentIndex < typeOrder.length - 1) {
        setUploadType(typeOrder[currentIndex + 1]);
      }
    }
  };

  // Handle photo delete
  const handleDeletePhoto = async (photoId: number) => {
    try {
      const response = await portalFetch(`/api/patient-portal/photos/${photoId}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setPhotos((prev) => prev.filter((p) => p.id !== photoId));
      }
    } catch (err) {
      logger.error('Failed to delete photo', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  };

  // Select photos for comparison
  const handleSelectForCompare = (photo: Photo) => {
    if (!comparePhotos.before) {
      setComparePhotos({ before: photo, after: null });
    } else if (!comparePhotos.after && photo.id !== comparePhotos.before.id) {
      setComparePhotos((prev) => ({ ...prev, after: photo }));
      setViewMode('compare');
    }
  };

  // Get photos by type for comparison selector
  const getPhotosByType = (type: PatientPhotoType) => {
    return photos.filter((p) => p.type === type);
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-4">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <p className="mb-2 font-medium text-red-600">Error Loading Photos</p>
        <p className="mb-4 text-sm text-gray-500">{error}</p>
        <button
          onClick={() => {
            setError(null);
            fetchPhotos();
          }}
          className="rounded-lg bg-red-100 px-4 py-2 font-medium text-red-700 hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Success Toast */}
      {showSuccess && (
        <div className="animate-in slide-in-from-top-2 fixed right-4 top-4 z-50 flex items-center gap-3 rounded-2xl bg-gray-900 px-5 py-4 text-white shadow-2xl">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500">
            <CheckCircle className="h-4 w-4" />
          </div>
          <span className="font-medium">Photos uploaded successfully!</span>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode !== 'gallery' && (
            <button
              onClick={() => {
                setViewMode('gallery');
                setComparePhotos({ before: null, after: null });
              }}
              className="-ml-2 rounded-full p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {viewMode === 'gallery' && 'Progress Photos'}
              {viewMode === 'upload' && 'Take Progress Photos'}
              {viewMode === 'compare' && 'Compare Progress'}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {viewMode === 'gallery' && 'Track your transformation journey'}
              {viewMode === 'upload' && 'Capture front, side, and back views'}
              {viewMode === 'compare' && 'See your before and after'}
            </p>
          </div>
        </div>

        {viewMode === 'gallery' && (
          <button
            onClick={() => setViewMode('upload')}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-medium text-white shadow-lg transition-all hover:shadow-xl"
            style={{ backgroundColor: primaryColor }}
          >
            <Camera className="h-5 w-5" />
            <span className="hidden sm:inline">Add Photos</span>
          </button>
        )}
      </div>

      {/* Gallery View */}
      {viewMode === 'gallery' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          {stats && stats.total > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                </div>
                <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
                <p className="text-xs font-medium text-gray-500">Total Photos</p>
              </div>

              {stats.totalWeightChange !== 0 && (
                <div className="rounded-2xl bg-white p-4 shadow-sm">
                  <div
                    className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${
                      stats.totalWeightChange <= 0 ? 'bg-emerald-100' : 'bg-rose-100'
                    }`}
                  >
                    {stats.totalWeightChange <= 0 ? (
                      <TrendingDown className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <TrendingUp className="h-4 w-4 text-rose-600" />
                    )}
                  </div>
                  <p
                    className={`text-2xl font-semibold ${
                      stats.totalWeightChange <= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {stats.totalWeightChange > 0 ? '+' : ''}
                    {stats.totalWeightChange.toFixed(1)}
                  </p>
                  <p className="text-xs font-medium text-gray-500">Weight Change (lbs)</p>
                </div>
              )}
            </div>
          )}

          {/* Quick Compare Button */}
          {stats && stats.firstPhoto && stats.latestPhoto && stats.total >= 2 && (
            <button
              onClick={() => {
                setComparePhotos({
                  before: stats.firstPhoto!,
                  after: stats.latestPhoto!,
                });
                setViewMode('compare');
              }}
              className="w-full rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 p-5 text-white shadow-lg transition-all hover:shadow-xl"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Layers className="h-8 w-8" />
                  <div className="text-left">
                    <p className="font-semibold">Compare First vs Latest</p>
                    <p className="text-sm text-white/80">
                      {differenceInDays(
                        parseISO(stats.latestPhoto.takenAt),
                        parseISO(stats.firstPhoto.takenAt)
                      )}{' '}
                      days of progress
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-6 w-6" />
              </div>
            </button>
          )}

          {/* Photo Gallery */}
          {photos.length > 0 ? (
            <PhotoGallery
              photos={photos}
              onDelete={handleDeletePhoto}
              showFilters
              showDateGroups
              showWeight
              emptyMessage="No progress photos yet"
            />
          ) : (
            <div className="rounded-2xl bg-gray-50 p-8 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
                <Camera className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">No Progress Photos Yet</h3>
              <p className="mb-6 text-sm text-gray-500">
                Start documenting your journey by taking your first set of progress photos.
              </p>
              <button
                onClick={() => setViewMode('upload')}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3 font-medium text-white transition-all hover:opacity-90"
                style={{ backgroundColor: primaryColor }}
              >
                <Plus className="h-5 w-5" />
                Take First Photos
              </button>
            </div>
          )}
        </div>
      )}

      {/* Upload View */}
      {viewMode === 'upload' && (
        <div className="space-y-6">
          {/* Progress Indicator */}
          <div className="flex items-center justify-center gap-2">
            {PROGRESS_TYPES.map((type, index) => {
              const isActive = type.type === uploadType;
              const isComplete = PROGRESS_TYPES.slice(0, index).some((t) => t.type === uploadType)
                ? uploadedCount > index
                : index < PROGRESS_TYPES.findIndex((t) => t.type === uploadType);

              return (
                <div key={type.type} className="flex items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-gray-900 text-white'
                        : isComplete
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isComplete ? <CheckCircle className="h-4 w-4" /> : index + 1}
                  </div>
                  {index < PROGRESS_TYPES.length - 1 && (
                    <div
                      className={`mx-2 h-0.5 w-8 ${isComplete ? 'bg-emerald-500' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Current Type Info */}
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${primaryColor}20` }}
              >
                <Camera className="h-6 w-6" style={{ color: primaryColor }} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">
                  {PROGRESS_TYPES.find((t) => t.type === uploadType)?.label}
                </h3>
                <p className="text-sm text-gray-500">
                  {PROGRESS_TYPES.find((t) => t.type === uploadType)?.description}
                </p>
              </div>
            </div>

            {/* Weight Input */}
            <div className="mb-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Current Weight (optional)
              </label>
              <div className="relative">
                <Scale className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="number"
                  step="0.1"
                  value={currentWeight}
                  onChange={(e) => setCurrentWeight(e.target.value)}
                  placeholder="Enter weight"
                  className="w-full rounded-xl border-2 border-gray-100 bg-gray-50 py-3 pl-10 pr-16 font-medium outline-none focus:border-gray-300 focus:bg-white"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">lbs</span>
              </div>
            </div>

            {/* Photo Uploader */}
            <PhotoUploader
              photoType={uploadType as PatientPhotoType}
              maxPhotos={1}
              onUploadComplete={handleUploadComplete}
              showGuidelines={uploadType === 'PROGRESS_FRONT'}
              guidelines={UPLOAD_GUIDELINES}
            />
          </div>

          {/* Skip Button */}
          <button
            onClick={() => {
              const typeOrder: UploadType[] = ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'];
              const currentIndex = typeOrder.indexOf(uploadType);
              if (currentIndex < typeOrder.length - 1) {
                setUploadType(typeOrder[currentIndex + 1]);
              } else {
                setViewMode('gallery');
                fetchPhotos();
              }
            }}
            className="w-full py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            Skip this angle
          </button>
        </div>
      )}

      {/* Compare View */}
      {viewMode === 'compare' && comparePhotos.before && comparePhotos.after && (
        <PhotoComparison
          beforePhoto={comparePhotos.before}
          afterPhoto={comparePhotos.after}
          onClose={() => {
            setViewMode('gallery');
            setComparePhotos({ before: null, after: null });
          }}
          showFullscreen
        />
      )}

      {/* Tips Card */}
      {viewMode === 'gallery' && photos.length > 0 && (
        <div className="mt-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Consistency Tips</h3>
          </div>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
              Take photos weekly or bi-weekly for best progress tracking
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
              Use the same lighting, time of day, and clothing
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
              Always log your weight to correlate with visual changes
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
