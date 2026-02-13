'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ArrowLeft, ShieldAlert } from 'lucide-react';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProviderDetailError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error('Provider detail page error:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const isAuthError =
    error.message.includes('Authentication') ||
    error.message.includes('401') ||
    error.message.includes('session');

  const isAccessError =
    error.message.includes('Access denied') ||
    error.message.includes('403') ||
    error.message.includes('permission');

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
          <p className="mb-8 text-gray-600">Please log in again to view provider details.</p>
          <Link
            href="/login?redirect=/providers"
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
            You don't have permission to view this provider's information.
          </p>
          <Link
            href="/providers"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Providers
          </Link>
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
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Error Loading Provider</h1>
        <p className="mb-8 text-gray-600">
          We encountered an error while loading this provider's information.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-4 text-left">
            <p className="break-words font-mono text-sm text-red-700">{error.message}</p>
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
            href="/providers"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-6 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ArrowLeft className="h-5 w-5" />
            Back to Providers
          </Link>
        </div>
      </div>
    </div>
  );
}
