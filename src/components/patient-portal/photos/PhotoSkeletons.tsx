'use client';

/**
 * Photo Skeleton Loading Components
 *
 * Provides consistent loading states for photo-related pages:
 * - PhotoGallerySkeleton
 * - PhotoCardSkeleton
 * - PhotoUploadSkeleton
 * - VerificationStatusSkeleton
 * - PhotoStatsSkeleton
 */

import React from 'react';

// =============================================================================
// Base Skeleton Component
// =============================================================================

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return <div className={`rounded bg-gray-200 ${animate ? 'animate-pulse' : ''} ${className}`} />;
}

// =============================================================================
// Photo Card Skeleton
// =============================================================================

export function PhotoCardSkeleton() {
  return (
    <div className="aspect-square animate-pulse overflow-hidden rounded-xl bg-gray-100">
      <Skeleton className="h-full w-full rounded-none" animate={false} />
    </div>
  );
}

// =============================================================================
// Photo Gallery Skeleton
// =============================================================================

interface PhotoGallerySkeletonProps {
  count?: number;
  columns?: number;
}

export function PhotoGallerySkeleton({ count = 8, columns = 4 }: PhotoGallerySkeletonProps) {
  return (
    <div className="space-y-6">
      {/* Filter Bar Skeleton */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Skeleton className="h-4 w-4 rounded" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Date Group Skeleton */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24 rounded" />
        </div>

        {/* Photo Grid */}
        <div
          className={`grid gap-3`}
          style={{
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: count }).map((_, i) => (
            <PhotoCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Photo Upload Skeleton
// =============================================================================

export function PhotoUploadSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      {/* Guidelines Skeleton */}
      <div className="rounded-lg bg-gray-50 p-4">
        <Skeleton className="mb-2 h-4 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-2 w-2 rounded-full" />
              <Skeleton className="h-3 w-48" />
            </div>
          ))}
        </div>
      </div>

      {/* Upload Zone Skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 rounded-xl border-2 border-dashed border-gray-200 p-8">
          <div className="flex flex-col items-center">
            <Skeleton className="mb-3 h-10 w-10 rounded-full" />
            <Skeleton className="mb-2 h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
        </div>
        <Skeleton className="h-24 w-full rounded-xl sm:w-32" />
      </div>
    </div>
  );
}

// =============================================================================
// Verification Status Skeleton
// =============================================================================

export function VerificationStatusSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Status Card Skeleton */}
      <div className="rounded-2xl bg-gray-100 p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1">
            <Skeleton className="mb-2 h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </div>

      {/* Document List Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-100 bg-white p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div>
                  <Skeleton className="mb-1 h-4 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Photo Stats Skeleton
// =============================================================================

export function PhotoStatsSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-2 gap-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-white p-4 shadow-sm">
          <Skeleton className="mb-2 h-8 w-8 rounded-lg" />
          <Skeleton className="mb-1 h-8 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Progress Page Skeleton
// =============================================================================

export function ProgressPageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="mb-2 h-7 w-48" />
          <Skeleton className="h-4 w-36" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Stats Skeleton */}
      <PhotoStatsSkeleton />

      {/* Compare Button Skeleton */}
      <Skeleton className="h-20 w-full rounded-2xl" />

      {/* Gallery Skeleton */}
      <PhotoGallerySkeleton count={6} />
    </div>
  );
}

// =============================================================================
// Photos Hub Skeleton
// =============================================================================

export function PhotosHubSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="mb-1 h-7 w-24" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Quick Stats Skeleton */}
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-4 text-center">
            <Skeleton className="mx-auto mb-1 h-8 w-12" />
            <Skeleton className="mx-auto h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Section Cards Skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4"
          >
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="mb-1 h-5 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
            <Skeleton className="h-5 w-5 rounded" />
          </div>
        ))}
      </div>

      {/* Recent Photos Skeleton */}
      <div>
        <Skeleton className="mb-3 h-4 w-32" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>

      {/* Button Skeleton */}
      <Skeleton className="h-14 w-full rounded-xl" />
    </div>
  );
}

// =============================================================================
// Export all skeletons
// =============================================================================

export { Skeleton };

export default {
  PhotoCardSkeleton,
  PhotoGallerySkeleton,
  PhotoUploadSkeleton,
  VerificationStatusSkeleton,
  PhotoStatsSkeleton,
  ProgressPageSkeleton,
  PhotosHubSkeleton,
};
