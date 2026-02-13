'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home, ShieldAlert } from 'lucide-react';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProviderDashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error('Provider dashboard error:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const isAuthError =
    error.message.includes('Authentication') ||
    error.message.includes('401') ||
    error.message.includes('session');

  if (isAuthError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <h1 className="mb-3 text-xl font-bold text-gray-900">Session Expired</h1>
          <p className="mb-6 text-gray-600">
            Your provider session has expired. Please log in again.
          </p>
          <Link
            href="/login?redirect=/provider"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4fa77e] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#3d8a66]"
          >
            Log In Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <div className="mb-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
        </div>
        <h1 className="mb-3 text-xl font-bold text-gray-900">Something Went Wrong</h1>
        <p className="mb-6 text-gray-600">
          An error occurred in your provider dashboard. Our team has been notified.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-left">
            <p className="break-words font-mono text-xs text-red-700">{error.message}</p>
          </div>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4fa77e] px-5 py-2.5 font-medium text-white transition-colors hover:bg-[#3d8a66]"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-5 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
