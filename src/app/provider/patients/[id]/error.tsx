'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProviderPatientDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Provider patient detail page error:', error.message, error.digest);
  }, [error]);

  const isAuthError =
    error.message.includes('Authentication') ||
    error.message.includes('401') ||
    error.message.includes('Unauthorized') ||
    error.message.includes('session');

  const isConnectionError =
    error.message.includes('Connection closed') ||
    error.message.includes('connection closed') ||
    error.message.includes('fetch failed') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError') ||
    error.message.includes('Load failed') ||
    error.message.includes('timed out');

  if (isAuthError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mb-3 text-xl font-bold text-gray-900">Session Expired</h1>
          <p className="mb-6 text-sm text-gray-600">
            Your session has expired. Please log in again.
          </p>
          <a
            href="/login?redirect=/provider/patients"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Log In Again
          </a>
        </div>
      </div>
    );
  }

  if (isConnectionError) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <AlertTriangle className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mb-3 text-xl font-bold text-gray-900">Connection Problem</h1>
          <p className="mb-6 text-sm text-gray-600">
            The patient data couldn&apos;t load due to a network or timeout issue. Please try again.
          </p>
          <div className="flex flex-col justify-center gap-3 sm:flex-row">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <RefreshCw className="h-4 w-4" />
              Try Again
            </button>
            <a
              href="/provider/patients"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Patients
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h1 className="mb-3 text-xl font-bold text-gray-900">Error Loading Patient</h1>
        <p className="mb-6 text-sm text-gray-600">
          Something went wrong loading this patient&apos;s data. This has been logged.
        </p>
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-3 text-left">
            <p className="break-words font-mono text-xs text-red-700">{error.message}</p>
          </div>
        )}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <a
            href="/provider/patients"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </a>
        </div>
      </div>
    </div>
  );
}
