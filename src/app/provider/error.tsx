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
      <div className="min-h-screen flex items-center justify-center p-6 bg-[#efece7]">
        <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-lg p-8">
          <div className="mb-6">
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-amber-600" />
            </div>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-3">Session Expired</h1>
          <p className="text-gray-600 mb-6">Your provider session has expired. Please log in again.</p>
          <Link
            href="/login?redirect=/provider"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#4fa77e] text-white font-semibold rounded-xl hover:bg-[#3d8a66] transition-colors"
          >
            Log In Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#efece7]">
      <div className="max-w-md w-full text-center bg-white rounded-2xl shadow-lg p-8">
        <div className="mb-6">
          <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-3">Something Went Wrong</h1>
        <p className="text-gray-600 mb-6">
          An error occurred in your provider dashboard. Our team has been notified.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-xs font-mono text-red-700 break-words">{error.message}</p>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#4fa77e] text-white font-medium rounded-xl hover:bg-[#3d8a66] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Home className="w-4 h-4" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
