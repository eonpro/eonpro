'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home, ArrowLeft } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-md text-center">
        {/* Error Icon */}
        <div className="mb-8">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
        </div>

        {/* Error Message */}
        <h1 className="mb-4 text-3xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mb-8 text-gray-600">
          We apologize for the inconvenience. An unexpected error occurred while processing your
          request.
        </p>

        {/* Error Details (Development only) */}
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-left">
            <p className="break-words font-mono text-sm text-red-700">{error.message}</p>
            {error.digest && <p className="mt-2 text-xs text-red-500">Error ID: {error.digest}</p>}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RefreshCw className="h-5 w-5" />
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Home className="h-5 w-5" />
            Go Home
          </a>
        </div>

        {/* Back Link */}
        <button
          onClick={() => window.history.back()}
          className="mt-6 inline-flex items-center gap-2 text-gray-500 transition-colors hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Go back to previous page
        </button>

        {/* Support Info */}
        <div className="mt-12 border-t border-gray-200 pt-6">
          <p className="text-sm text-gray-500">
            If this problem persists, please contact support at{' '}
            <a href="mailto:support@eonpro.io" className="text-emerald-600 hover:underline">
              support@eonpro.io
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
