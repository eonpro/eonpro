'use client';

import { useEffect, useState } from 'react';

/**
 * Patient detail loading skeleton.
 *
 * Shows a skeleton UI while the server component fetches patient data.
 * After 12s, shows a "taking longer than expected" banner with a manual
 * retry button. NO automatic reload — the previous auto-reload after 8s
 * caused infinite reload loops because the RSC queries take 8-20s,
 * restarting them from scratch on each reload.
 */
export default function PatientDetailLoading() {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowRetry(true);
    }, 12000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-[#efece7] p-6">
      {showRetry && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>This page is taking longer than expected to load.</span>
          <button
            onClick={() => window.location.reload()}
            className="ml-3 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      )}
      <div className="flex gap-6">
        {/* Left sidebar skeleton */}
        <div className="hidden w-80 flex-shrink-0 lg:block">
          <div className="animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            </div>
            <div className="space-y-2 pt-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-4 rounded bg-gray-100" style={{ width: `${70 + (i % 3) * 10}%` }} />
              ))}
            </div>
            <div className="space-y-2 border-t border-gray-100 pt-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg p-2">
                  <div className="h-5 w-5 rounded bg-gray-200" />
                  <div className="h-4 w-24 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="min-w-0 flex-1 animate-pulse space-y-6">
          {/* Search bar */}
          <div className="h-10 w-full rounded-xl bg-gray-200" />

          {/* Title */}
          <div className="h-7 w-48 rounded bg-gray-200" />

          {/* Vitals cards */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="mb-4 h-5 w-16 rounded bg-gray-200" />
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-[#efece7] p-4">
                  <div className="mb-1 h-3 w-14 rounded bg-gray-200" />
                  <div className="mb-3 h-7 w-16 rounded bg-gray-200" />
                  <div className="h-2 w-full rounded-full bg-gray-300" />
                </div>
              ))}
            </div>
          </div>

          {/* Overview card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="space-y-3">
              <div className="h-5 w-28 rounded bg-gray-200" />
              <div className="h-4 w-48 rounded bg-gray-100" />
              <div className="h-4 w-36 rounded bg-gray-100" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
