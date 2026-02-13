'use client';

/**
 * Offline Page
 * Displayed when user is offline and the requested page isn't cached
 */

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw, Home, Pill, Scale, Package } from 'lucide-react';
import Link from 'next/link';

export default function OfflinePage() {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleRetry = () => {
    window.location.reload();
  };

  // If back online, redirect to dashboard
  useEffect(() => {
    if (isOnline) {
      window.location.href = '/patient-portal';
    }
  }, [isOnline]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md text-center">
        {/* Offline Icon */}
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gray-100">
          <WifiOff className="h-12 w-12 text-gray-400" />
        </div>

        {/* Title */}
        <h1 className="mb-2 text-2xl font-bold text-gray-900">You&apos;re Offline</h1>

        <p className="mb-8 text-gray-600">
          It looks like you&apos;ve lost your internet connection. Some features may be limited
          until you&apos;re back online.
        </p>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          className="mb-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand-primary,#4fa77e)] px-6 py-3 font-medium text-white transition-opacity hover:opacity-90"
        >
          <RefreshCw className="h-5 w-5" />
          Try Again
        </button>

        {/* Cached Pages */}
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-sm font-medium text-gray-500">Available Offline</h2>

          <div className="space-y-3">
            <Link
              href="/patient-portal"
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <Home className="h-5 w-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Dashboard</p>
                <p className="text-sm text-gray-500">View your cached health summary</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/medications"
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                <Pill className="h-5 w-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Medications</p>
                <p className="text-sm text-gray-500">View your medication list</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/progress"
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <Scale className="h-5 w-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Progress</p>
                <p className="text-sm text-gray-500">Log weight (syncs when online)</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/shipments"
              className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-gray-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100">
                <Package className="h-5 w-5 text-orange-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Shipments</p>
                <p className="text-sm text-gray-500">View last known status</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Help Text */}
        <p className="mt-6 text-sm text-gray-500">
          Data you log while offline will automatically sync when your connection is restored.
        </p>
      </div>
    </div>
  );
}
