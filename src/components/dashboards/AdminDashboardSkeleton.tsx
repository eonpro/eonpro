'use client';

/**
 * Skeleton loader for admin dashboard.
 * Preserves layout to prevent CLS; no blocking spinners.
 */

import {
  UserPlus,
  Users,
  Pill,
  TrendingUp,
  CreditCard,
  RefreshCw,
  FileText,
  Building2,
} from 'lucide-react';

export function AdminDashboardSkeleton() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-gray-200" />
          <div className="mb-1 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-[#4fa77e]" />
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
              System
            </span>
          </div>
          <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="relative w-96">
          <div className="h-12 animate-pulse rounded-full bg-gray-100" />
        </div>
      </div>

      {/* Welcome */}
      <div className="mb-6 h-9 w-64 animate-pulse rounded bg-gray-200" />

      {/* Stats Cards - Row 1 */}
      <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[UserPlus, Users, Pill, TrendingUp].map((Icon, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <Icon className="h-6 w-6 text-gray-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 h-8 w-16 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Stats Cards - Row 2 (Revenue) */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[CreditCard, RefreshCw, FileText].map((Icon, i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100">
              <Icon className="h-6 w-6 text-gray-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="mb-2 h-8 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      {/* Patient Intakes Card */}
      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="h-6 w-40 animate-pulse rounded bg-gray-200" />
        </div>
        <div className="px-6 pb-4">
          <div className="h-12 w-full animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="overflow-x-auto px-6 pb-4">
          {/* Table skeleton */}
          <div className="space-y-3">
            <div className="flex gap-4 border-b border-gray-100 pb-3">
              <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
            </div>
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex gap-4 py-4">
                <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-4 w-16 animate-pulse rounded bg-gray-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
