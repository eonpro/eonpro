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
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Offline Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-100 flex items-center justify-center">
          <WifiOff className="w-12 h-12 text-gray-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">You&apos;re Offline</h1>

        <p className="text-gray-600 mb-8">
          It looks like you&apos;ve lost your internet connection. Some features may be limited
          until you&apos;re back online.
        </p>

        {/* Retry Button */}
        <button
          onClick={handleRetry}
          className="w-full mb-6 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[var(--brand-primary,#4fa77e)] text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          <RefreshCw className="w-5 h-5" />
          Try Again
        </button>

        {/* Cached Pages */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500 mb-4">Available Offline</h2>

          <div className="space-y-3">
            <Link
              href="/patient-portal"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Home className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Dashboard</p>
                <p className="text-sm text-gray-500">View your cached health summary</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/medications"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Pill className="w-5 h-5 text-purple-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Medications</p>
                <p className="text-sm text-gray-500">View your medication list</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/progress"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                <Scale className="w-5 h-5 text-green-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-gray-900">Progress</p>
                <p className="text-sm text-gray-500">Log weight (syncs when online)</p>
              </div>
            </Link>

            <Link
              href="/patient-portal/shipments"
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                <Package className="w-5 h-5 text-orange-600" />
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
