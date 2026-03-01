'use client';

/**
 * Photos Hub Page
 *
 * Main entry point for patient photos with links to:
 * - Progress photos
 * - ID verification
 * - Medical images
 * - Quick stats and recent uploads
 */

import { useState, useEffect, useCallback } from 'react';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import {
  Camera,
  TrendingDown,
  Image as ImageIcon,
  Shield,
  Stethoscope,
  ChevronRight,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  Trash2,
  X,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { safeParseJson } from '@/lib/utils/safe-json';
import { logger } from '@/lib/logger';
import { format, parseISO } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface RecentPhoto {
  id: number;
  type: string;
  thumbnailUrl: string | null;
  s3Url: string | null;
  createdAt: string;
  verificationStatus: string;
}

interface PhotoStats {
  progress: number;
  verification: {
    status: 'none' | 'pending' | 'verified' | 'rejected';
    count: number;
  };
  medical: number;
  recent: RecentPhoto[];
}

const ID_VERIFICATION_TYPES = ['ID_FRONT', 'ID_BACK', 'SELFIE'];

function isPhotoDeletable(photo: RecentPhoto): boolean {
  if (ID_VERIFICATION_TYPES.includes(photo.type) && photo.verificationStatus === 'VERIFIED') {
    return false;
  }
  return true;
}

// =============================================================================
// Component
// =============================================================================

export default function PhotosHubPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<RecentPhoto | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch photo stats
  const fetchStats = useCallback(async () => {
    setLoadError(null);
    try {
      const response = await portalFetch('/api/patient-portal/photos?limit=100');
      const sessionErr = getPortalResponseError(response);
      if (sessionErr) {
        setLoadError(sessionErr);
        setLoading(false);
        return;
      }
      if (!response.ok) throw new Error('Failed to load');

      const data = await safeParseJson(response);
      const photos =
        data !== null && typeof data === 'object' && 'photos' in data
          ? (data as { photos?: unknown[] }).photos ?? []
          : [];

      // Calculate stats
      const progressPhotos = photos.filter((p: any) =>
        ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'].includes(p.type)
      );

      const verificationPhotos = photos.filter((p: any) =>
        ['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(p.type)
      );

      const medicalPhotos = photos.filter((p: any) => p.type.startsWith('MEDICAL_'));

      // Determine verification status
      let verificationStatus: 'none' | 'pending' | 'verified' | 'rejected' = 'none';
      if (verificationPhotos.length > 0) {
        if (verificationPhotos.some((p: any) => p.verificationStatus === 'REJECTED')) {
          verificationStatus = 'rejected';
        } else if (verificationPhotos.every((p: any) => p.verificationStatus === 'VERIFIED')) {
          verificationStatus = 'verified';
        } else {
          verificationStatus = 'pending';
        }
      }

      setStats({
        progress: progressPhotos.length,
        verification: {
          status: verificationStatus,
          count: verificationPhotos.length,
        },
        medical: medicalPhotos.length,
        recent: photos.slice(0, 8).map((p: any) => ({
          id: p.id,
          type: p.type,
          thumbnailUrl: p.thumbnailUrl || p.s3Url,
          s3Url: p.s3Url,
          createdAt: p.createdAt,
          verificationStatus: p.verificationStatus || 'NOT_APPLICABLE',
        })),
      });
    } catch (err) {
      logger.error('Failed to load photo stats', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      setStats({
        progress: 0,
        verification: { status: 'none', count: 0 },
        medical: 0,
        recent: [],
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleDeletePhoto = async (photo: RecentPhoto) => {
    if (!isPhotoDeletable(photo)) return;
    setIsDeleting(true);
    try {
      const response = await portalFetch(`/api/patient-portal/photos/${photo.id}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setStats((prev) =>
          prev
            ? { ...prev, recent: prev.recent.filter((p) => p.id !== photo.id) }
            : prev,
        );
        fetchStats();
      } else {
        const data = await response.json().catch(() => ({}));
        logger.error('Failed to delete photo', { photoId: photo.id, error: data.error });
      }
    } catch (err) {
      logger.error('Failed to delete photo', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  const sections = [
    {
      href: '/patient-portal/photos/progress',
      icon: TrendingDown,
      title: 'Progress Photos',
      description: 'Track your transformation journey',
      count: stats?.progress || 0,
      countLabel: 'photos',
      color: 'bg-blue-500',
      bgColor: 'bg-blue-50',
    },
    {
      href: '/patient-portal/photos/verification',
      icon: Shield,
      title: 'ID Verification',
      description: 'Verify your identity securely',
      status: stats?.verification.status,
      color: 'bg-emerald-500',
      bgColor: 'bg-emerald-50',
    },
    {
      href: '/patient-portal/photos/medical',
      icon: Stethoscope,
      title: 'Medical Images',
      description: 'Share photos with your care team',
      count: stats?.medical || 0,
      countLabel: 'images',
      color: 'bg-teal-500',
      bgColor: 'bg-teal-50',
    },
  ];

  const getVerificationBadge = (status: string | undefined) => {
    switch (status) {
      case 'verified':
        return (
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-600">
            <CheckCircle className="h-3 w-3" />
            Verified
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-600">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-600">
            <AlertCircle className="h-3 w-3" />
            Action Needed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
            <Plus className="h-3 w-3" />
            Not Started
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <div
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"
          role="alert"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="flex-1 text-sm font-medium text-amber-900">{loadError}</p>
          <Link
            href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/photos`)}&reason=session_expired`}
            className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${primaryColor}20` }}
          >
            <Camera className="h-5 w-5" style={{ color: primaryColor }} />
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Photos</h1>
        </div>
        <p className="text-sm text-gray-500">Manage your photos and documents</p>
      </div>

      {/* Quick Stats */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{stats?.progress || 0}</p>
          <p className="text-xs text-gray-500">Progress</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{stats?.verification.count || 0}</p>
          <p className="text-xs text-gray-500">Verification</p>
        </div>
        <div className="rounded-xl bg-white p-4 text-center shadow-sm">
          <p className="text-2xl font-bold text-gray-900">{stats?.medical || 0}</p>
          <p className="text-xs text-gray-500">Medical</p>
        </div>
      </div>

      {/* Section Cards */}
      <div className="mb-6 space-y-3">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition-all hover:shadow-md"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-xl ${section.bgColor}`}
              >
                <Icon
                  className={`h-7 w-7 text-${section.color.replace('bg-', '')}`}
                  style={{
                    color: section.color.includes('blue')
                      ? '#3B82F6'
                      : section.color.includes('emerald')
                        ? '#10B981'
                        : '#14B8A6',
                  }}
                />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{section.title}</p>
                <p className="text-sm text-gray-500">{section.description}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {'count' in section ? (
                  <span className="text-sm font-medium text-gray-700">
                    {section.count} {section.countLabel}
                  </span>
                ) : (
                  getVerificationBadge(section.status)
                )}
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Photos */}
      {stats && stats.recent.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Recent Uploads</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {stats.recent.map((photo) => {
              const deletable = isPhotoDeletable(photo);
              const isVerifiedId =
                ID_VERIFICATION_TYPES.includes(photo.type) &&
                photo.verificationStatus === 'VERIFIED';

              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-gray-100"
                >
                  {photo.thumbnailUrl ? (
                    <img
                      src={photo.thumbnailUrl}
                      alt="Recent photo"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-gray-300" />
                    </div>
                  )}

                  {/* Verified badge for protected photos */}
                  {isVerifiedId && (
                    <div className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-full bg-green-500/90 px-2 py-1">
                      <ShieldCheck className="h-3 w-3 text-white" />
                      <span className="text-[10px] font-medium text-white">Verified</span>
                    </div>
                  )}

                  {/* Delete button — always visible on mobile, hover on desktop */}
                  {deletable && (
                    <button
                      onClick={() => setDeleteConfirm(photo)}
                      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <Trash2 className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Photo</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>
            {deleteConfirm.thumbnailUrl && (
              <div className="mb-4 overflow-hidden rounded-xl">
                <img
                  src={deleteConfirm.thumbnailUrl}
                  alt="Photo to delete"
                  className="h-40 w-full object-cover"
                />
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-gray-100 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeletePhoto(deleteConfirm)}
                disabled={isDeleting}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white transition-colors hover:bg-red-700"
              >
                {isDeleting ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Upload Button */}
      <Link
        href="/patient-portal/photos/progress"
        className="flex w-full items-center justify-center gap-2 rounded-xl py-4 font-semibold text-white shadow-lg transition-all hover:shadow-xl"
        style={{ backgroundColor: primaryColor }}
      >
        <Plus className="h-5 w-5" />
        Upload New Photo
      </Link>

      {/* Info */}
      <div className="mt-6 text-center">
        <p className="text-xs text-gray-400">
          All photos are encrypted and stored securely.
          <br />
          Only you and your care team have access.
        </p>
      </div>
    </div>
  );
}
