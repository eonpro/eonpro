'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PatientDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for monitoring (Sentry, etc.)
    logger.error('Patient detail page error:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  // Check if this is an auth-related error
  const isAuthError =
    error.message.includes('Authentication') ||
    error.message.includes('401') ||
    error.message.includes('Unauthorized') ||
    error.message.includes('session');

  // Check if this is an access/permission error
  const isAccessError =
    error.message.includes('Access denied') ||
    error.message.includes('403') ||
    error.message.includes('permission') ||
    error.message.includes('not authorized');

  // Check if this is a connection/network error (often seen when server closes stream)
  const isConnectionError =
    error.message.includes('Connection closed') ||
    error.message.includes('connection closed') ||
    error.message.includes('fetch failed') ||
    error.message.includes('Failed to fetch') ||
    error.message.includes('NetworkError') ||
    error.message.includes('Load failed');

  if (isAuthError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-10 w-10 text-amber-600" />
            </div>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Session Expired</h1>
          <p className="mb-8 text-gray-600">
            Your session has expired or you need to log in again to view this patient.
          </p>
          <Link
            href="/login?redirect=/patients"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Log In Again
          </Link>
        </div>
      </div>
    );
  }

  if (isAccessError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
              <ShieldAlert className="h-10 w-10 text-red-500" />
            </div>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Access Denied</h1>
          <p className="mb-8 text-gray-600">
            You don't have permission to view this patient record. This may be because the patient
            belongs to a different clinic.
          </p>
          <Link
            href="/provider/patients"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Patient List
          </Link>
        </div>
      </div>
    );
  }

  if (isConnectionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
        <div className="w-full max-w-md text-center">
          <div className="mb-8">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-10 w-10 text-amber-600" />
            </div>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-gray-900">Connection Problem</h1>
          <p className="mb-4 text-gray-600">
            The connection was closed before the patient data could load. This can happen due to
            network issues or a brief server hiccup.
          </p>
          <p className="mb-8 text-sm text-gray-500">
            If you are a clinic admin, this can also occur when the patient belongs to another
            clinic. Try again or go back to the patient list.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <button
              onClick={reset}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <RefreshCw className="h-5 w-5" />
              Try Again
            </button>
            <Link
              href="/provider/patients"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
              Back to Patients
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="w-full max-w-md text-center">
        <div className="mb-8">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-10 w-10 text-red-500" />
          </div>
        </div>
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Error Loading Patient</h1>
        <p className="mb-8 text-gray-600">
          We encountered an error while loading this patient's information. This has been logged and
          our team will investigate.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-left">
            <p className="break-words font-mono text-sm text-red-700">{error.message}</p>
            {error.digest && <p className="mt-2 text-xs text-red-500">Error ID: {error.digest}</p>}
          </div>
        )}

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <RefreshCw className="h-5 w-5" />
            Try Again
          </button>
          <Link
            href="/provider/patients"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Patients
          </Link>
        </div>
      </div>
    </div>
  );
}
