'use client';

import { useEffect, useState } from 'react';

export default function SuperAdminLoading() {
  const [showRetry, setShowRetry] = useState(false);

  useEffect(() => {
    const key = `sa-loading-reload-${window.location.pathname}`;
    const alreadyReloaded = sessionStorage.getItem(key);

    const timer = setTimeout(() => {
      if (!alreadyReloaded) {
        sessionStorage.setItem(key, '1');
        window.location.reload();
      } else {
        setShowRetry(true);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen animate-pulse p-6">
      {showRetry && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <span>This page is taking longer than expected to load.</span>
          <button
            onClick={() => {
              const key = `sa-loading-reload-${window.location.pathname}`;
              sessionStorage.removeItem(key);
              window.location.reload();
            }}
            className="ml-3 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      )}
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="h-8 w-52 rounded bg-gray-200" />
          <div className="mt-2 h-4 w-80 rounded bg-gray-100" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="h-4 w-28 rounded bg-gray-200" />
              <div className="mt-3 h-8 w-20 rounded bg-gray-200" />
              <div className="mt-2 h-3 w-36 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 h-6 w-32 rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-4 w-32 rounded bg-gray-200" />
                <div className="h-4 flex-1 rounded bg-gray-100" />
                <div className="h-6 w-20 rounded-full bg-gray-200" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
