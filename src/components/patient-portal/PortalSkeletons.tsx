'use client';

/**
 * Skeleton Loading Components for Patient Portal Pages
 * Follows the pattern from PhotoSkeletons.tsx
 */

import React from 'react';

interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

function Skeleton({ className = '', animate = true }: SkeletonProps) {
  return <div className={`rounded bg-gray-200 ${animate ? 'animate-pulse' : ''} ${className}`} />;
}

// =============================================================================
// Billing Page Skeleton
// =============================================================================

export function BillingPageSkeleton() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse p-4 pb-24 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-8 w-32" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Subscription Card */}
      <Skeleton className="mb-6 h-48 w-full rounded-2xl" />

      {/* Tabs */}
      <div className="mb-6 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-28 rounded-xl" />
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mb-6 grid grid-cols-2 gap-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>

      {/* Invoice List */}
      <Skeleton className="mb-3 h-5 w-32" />
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="mb-1 h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
              <div className="text-right">
                <Skeleton className="mb-1 h-5 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Medications Page Skeleton
// =============================================================================

export function MedicationsPageSkeleton() {
  return (
    <div className="min-h-[100dvh] animate-pulse px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <Skeleton className="mb-2 h-9 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Reminders Card */}
      <div className="mb-10 overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50">
        <div className="border-b border-gray-100 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-6 w-44" />
            </div>
            <Skeleton className="h-10 w-32 rounded-xl" />
          </div>
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <div className="space-y-3 p-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-2xl bg-gray-50 p-4">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div>
                  <Skeleton className="mb-1 h-4 w-36" />
                  <Skeleton className="h-3 w-28" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-3xl bg-white p-6 shadow-xl shadow-gray-200/50">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-14 rounded-2xl" />
              <div>
                <Skeleton className="mb-1 h-5 w-32" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Subscription Page Skeleton
// =============================================================================

export function SubscriptionPageSkeleton() {
  return (
    <div className="min-h-screen animate-pulse p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6">
        <Skeleton className="mb-2 h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Plan Card */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <Skeleton className="h-40 w-full rounded-none" />
            <div className="space-y-4 p-6">
              <div className="rounded-xl bg-gray-50 p-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div>
                    <Skeleton className="mb-1 h-3 w-24" />
                    <Skeleton className="h-5 w-36" />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-4 w-40" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Billing History */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <Skeleton className="mb-4 h-5 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Skeleton className="mb-1 h-4 w-32" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <Skeleton className="mb-4 h-5 w-28" />
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

export { Skeleton };
