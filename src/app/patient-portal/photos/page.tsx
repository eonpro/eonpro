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
} from 'lucide-react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';

// =============================================================================
// Types
// =============================================================================

interface PhotoStats {
  progress: number;
  verification: {
    status: 'none' | 'pending' | 'verified' | 'rejected';
    count: number;
  };
  medical: number;
  recent: {
    id: number;
    type: string;
    thumbnailUrl: string | null;
    createdAt: string;
  }[];
}

// =============================================================================
// Component
// =============================================================================

export default function PhotosHubPage() {
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [stats, setStats] = useState<PhotoStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch photo stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('/api/patient-portal/photos?limit=100');
      if (!response.ok) throw new Error('Failed to load');

      const data = await response.json();
      const photos = data.photos || [];

      // Calculate stats
      const progressPhotos = photos.filter((p: any) =>
        ['PROGRESS_FRONT', 'PROGRESS_SIDE', 'PROGRESS_BACK'].includes(p.type)
      );

      const verificationPhotos = photos.filter((p: any) =>
        ['ID_FRONT', 'ID_BACK', 'SELFIE'].includes(p.type)
      );

      const medicalPhotos = photos.filter((p: any) =>
        p.type.startsWith('MEDICAL_')
      );

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
        recent: photos.slice(0, 4).map((p: any) => ({
          id: p.id,
          type: p.type,
          thumbnailUrl: p.thumbnailUrl || p.s3Url,
          createdAt: p.createdAt,
        })),
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
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
      color: 'bg-purple-500',
      bgColor: 'bg-purple-50',
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
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
            <CheckCircle className="h-3 w-3" />
            Verified
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-100 px-2 py-1 rounded-full">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-100 px-2 py-1 rounded-full">
            <AlertCircle className="h-3 w-3" />
            Action Needed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-xs font-medium text-gray-600 bg-gray-100 px-2 py-1 rounded-full">
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

  return (
    <div className="min-h-[100dvh] px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
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
      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="rounded-xl bg-white p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{stats?.progress || 0}</p>
          <p className="text-xs text-gray-500">Progress</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{stats?.verification.count || 0}</p>
          <p className="text-xs text-gray-500">Verification</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{stats?.medical || 0}</p>
          <p className="text-xs text-gray-500">Medical</p>
        </div>
      </div>

      {/* Section Cards */}
      <div className="space-y-3 mb-6">
        {sections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm border border-gray-100 hover:shadow-md transition-all"
            >
              <div className={`flex h-14 w-14 items-center justify-center rounded-xl ${section.bgColor}`}>
                <Icon className={`h-7 w-7 text-${section.color.replace('bg-', '')}`} style={{ color: section.color.includes('blue') ? '#3B82F6' : section.color.includes('purple') ? '#8B5CF6' : '#14B8A6' }} />
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
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Uploads</h3>
          <div className="grid grid-cols-4 gap-2">
            {stats.recent.map((photo) => (
              <div
                key={photo.id}
                className="aspect-square rounded-xl overflow-hidden bg-gray-100"
              >
                {photo.thumbnailUrl ? (
                  <img
                    src={photo.thumbnailUrl}
                    alt="Recent photo"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageIcon className="h-6 w-6 text-gray-300" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Upload Button */}
      <Link
        href="/patient-portal/photos/progress"
        className="flex items-center justify-center gap-2 w-full rounded-xl py-4 font-semibold text-white shadow-lg transition-all hover:shadow-xl"
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
