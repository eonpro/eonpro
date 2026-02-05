'use client';

/**
 * Skeleton UI Components
 *
 * Reusable loading skeleton components for improved perceived performance.
 * Follows enterprise design patterns with customizable variants.
 */

import { cn } from '@/lib/utils';

// =============================================================================
// Base Skeleton Component
// =============================================================================

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Additional className */
  className?: string;
  /** Animation style */
  animation?: 'pulse' | 'shimmer' | 'none';
}

export function Skeleton({ className, animation = 'pulse', ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-md bg-gray-200',
        animation === 'pulse' && 'animate-pulse',
        animation === 'shimmer' &&
          'relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
        className
      )}
      {...props}
    />
  );
}

// =============================================================================
// Card Skeleton
// =============================================================================

interface CardSkeletonProps {
  /** Show avatar placeholder */
  showAvatar?: boolean;
  /** Number of text lines */
  lines?: number;
  /** Card padding */
  padding?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CardSkeleton({
  showAvatar = false,
  lines = 3,
  padding = 'md',
  className,
}: CardSkeletonProps) {
  const paddingClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  return (
    <div
      className={cn(
        'rounded-xl bg-white shadow-sm',
        paddingClasses[padding],
        className
      )}
    >
      {showAvatar && (
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// List Skeleton
// =============================================================================

interface ListSkeletonProps {
  /** Number of list items */
  items?: number;
  /** Show avatar/icon for each item */
  showAvatar?: boolean;
  /** Show action button placeholder */
  showAction?: boolean;
  className?: string;
}

export function ListSkeleton({
  items = 5,
  showAvatar = true,
  showAction = false,
  className,
}: ListSkeletonProps) {
  return (
    <div className={cn('divide-y divide-gray-100 rounded-xl bg-white', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          {showAvatar && <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {showAction && <Skeleton className="h-8 w-20 rounded-lg" />}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Table Skeleton
// =============================================================================

interface TableSkeletonProps {
  /** Number of rows */
  rows?: number;
  /** Number of columns */
  columns?: number;
  /** Show header */
  showHeader?: boolean;
  className?: string;
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: TableSkeletonProps) {
  return (
    <div className={cn('overflow-hidden rounded-xl bg-white shadow-sm', className)}>
      <table className="min-w-full divide-y divide-gray-200">
        {showHeader && (
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, i) => (
                <th key={i} className="px-6 py-3">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, rowI) => (
            <tr key={rowI}>
              {Array.from({ length: columns }).map((_, colI) => (
                <td key={colI} className="px-6 py-4">
                  <Skeleton
                    className={cn('h-4', colI === 0 ? 'w-32' : 'w-20')}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// =============================================================================
// Profile Skeleton
// =============================================================================

interface ProfileSkeletonProps {
  /** Show cover image */
  showCover?: boolean;
  /** Show stats section */
  showStats?: boolean;
  className?: string;
}

export function ProfileSkeleton({
  showCover = false,
  showStats = true,
  className,
}: ProfileSkeletonProps) {
  return (
    <div className={cn('overflow-hidden rounded-xl bg-white shadow-sm', className)}>
      {showCover && <Skeleton className="h-32 w-full rounded-none" />}
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="-mt-8 h-20 w-20 rounded-full border-4 border-white" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-10 w-24 rounded-lg" />
        </div>
        {showStats && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton className="mx-auto h-8 w-12" />
                <Skeleton className="mx-auto mt-2 h-3 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Chart Skeleton
// =============================================================================

interface ChartSkeletonProps {
  /** Chart type */
  type?: 'bar' | 'line' | 'pie' | 'area';
  /** Chart height */
  height?: number;
  className?: string;
}

export function ChartSkeleton({
  type = 'bar',
  height = 300,
  className,
}: ChartSkeletonProps) {
  return (
    <div
      className={cn('rounded-xl bg-white p-6 shadow-sm', className)}
      style={{ height }}
    >
      {/* Chart Header */}
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>

      {/* Chart Area */}
      <div className="relative h-[calc(100%-60px)]">
        {type === 'bar' && (
          <div className="flex h-full items-end justify-around gap-2">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton
                key={i}
                className="flex-1 rounded-t"
                style={{ height: `${30 + Math.random() * 60}%` }}
              />
            ))}
          </div>
        )}
        {type === 'line' && (
          <div className="flex h-full flex-col justify-between">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-px w-full" />
            ))}
          </div>
        )}
        {type === 'pie' && (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        )}
        {type === 'area' && (
          <Skeleton className="h-full w-full rounded-lg" />
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Grid Skeleton
// =============================================================================

interface GridSkeletonProps {
  /** Number of items */
  items?: number;
  /** Number of columns */
  columns?: 2 | 3 | 4;
  /** Aspect ratio of items */
  aspectRatio?: 'square' | 'video' | 'portrait';
  className?: string;
}

export function GridSkeleton({
  items = 6,
  columns = 3,
  aspectRatio = 'square',
  className,
}: GridSkeletonProps) {
  const columnClasses = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  };

  const aspectClasses = {
    square: 'aspect-square',
    video: 'aspect-video',
    portrait: 'aspect-[3/4]',
  };

  return (
    <div className={cn('grid gap-4', columnClasses[columns], className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl bg-white shadow-sm">
          <Skeleton className={cn('w-full', aspectClasses[aspectRatio])} />
          <div className="p-3 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Form Skeleton
// =============================================================================

interface FormSkeletonProps {
  /** Number of fields */
  fields?: number;
  /** Show submit button */
  showSubmit?: boolean;
  className?: string;
}

export function FormSkeleton({
  fields = 4,
  showSubmit = true,
  className,
}: FormSkeletonProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
      {showSubmit && (
        <Skeleton className="h-12 w-full rounded-lg" />
      )}
    </div>
  );
}

// =============================================================================
// Text Skeleton
// =============================================================================

interface TextSkeletonProps {
  /** Number of lines */
  lines?: number;
  /** Show heading */
  showHeading?: boolean;
  className?: string;
}

export function TextSkeleton({
  lines = 4,
  showHeading = true,
  className,
}: TextSkeletonProps) {
  return (
    <div className={cn('space-y-4', className)}>
      {showHeading && <Skeleton className="h-8 w-1/3" />}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className={cn('h-4', i === lines - 1 ? 'w-2/3' : 'w-full')}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Stats Skeleton
// =============================================================================

interface StatsSkeletonProps {
  /** Number of stat cards */
  items?: number;
  className?: string;
}

export function StatsSkeleton({ items = 4, className }: StatsSkeletonProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        items === 2 && 'grid-cols-2',
        items === 3 && 'grid-cols-3',
        items >= 4 && 'grid-cols-2 md:grid-cols-4',
        className
      )}
    >
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Export All
// =============================================================================

export default Skeleton;
