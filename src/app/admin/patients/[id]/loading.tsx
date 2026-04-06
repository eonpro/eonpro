'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const SHOW_RETRY_MS = 20_000;

export default function PatientDetailLoading() {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const retryTimer = setTimeout(() => setShowRetry(true), SHOW_RETRY_MS);
    return () => {
      clearTimeout(retryTimer);
    };
  }, []);

  return (
    <div className="relative min-h-screen bg-[#efece7] p-3 md:p-6">
      {showRetry && (
        <div className="absolute inset-x-0 top-4 z-50 flex justify-center">
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 shadow-md">
            <span className="text-sm text-amber-800">Taking longer than expected...</span>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:gap-6">
        {/* Left sidebar skeleton */}
        <div className="hidden w-72 flex-shrink-0 md:block">
          <div className="animate-pulse space-y-4 rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="h-20 w-20 rounded-full bg-gray-200" />
              <div className="h-4 w-10 rounded bg-gray-100" />
            </div>
            <div className="space-y-2">
              <div className="h-6 w-36 rounded bg-gray-200" />
              <div className="h-4 w-20 rounded bg-gray-100" />
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="h-3.5 w-full rounded bg-gray-100" />
              <div className="h-3.5 w-3/4 rounded bg-gray-100" />
              <div className="h-3.5 w-1/2 rounded bg-gray-100" />
            </div>
            <div className="space-y-1 border-t border-gray-100 pt-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-gray-200" />
                  <div className="h-4 w-24 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile header skeleton */}
        <div className="md:hidden">
          <div className="animate-pulse rounded-2xl border border-gray-200 bg-white p-3.5">
            <div className="flex items-center gap-3">
              <div className="h-14 w-14 rounded-2xl bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 rounded bg-gray-200" />
                <div className="h-3 w-20 rounded bg-gray-100" />
              </div>
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <div className="min-w-0 flex-1 animate-pulse space-y-4 md:space-y-6">
          <div className="h-10 w-full rounded-xl bg-gray-200" />
          <div className="h-7 w-48 rounded bg-gray-200" />
          <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
            <div className="mb-4 h-5 w-16 rounded bg-gray-200" />
            <div className="grid grid-cols-2 gap-2.5 md:gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-xl bg-[#efece7] p-3 md:p-4">
                  <div className="mb-1 h-3 w-14 rounded bg-gray-200" />
                  <div className="mb-3 h-7 w-16 rounded bg-gray-200" />
                  <div className="h-2 w-full rounded-full bg-gray-300" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
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
