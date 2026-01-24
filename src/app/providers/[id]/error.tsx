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
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-amber-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Expired</h1>
          <p className="text-gray-600 mb-8">Please log in again to view provider details.</p>
          <Link
            href="/login?redirect=/providers"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            Log In Again
          </Link>
        </div>
      </div>
    );
  }

  if (isAccessError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="max-w-md w-full text-center">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-red-500" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-8">You don't have permission to view this provider's information.</p>
          <Link
            href="/providers"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Providers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-red-500" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Provider</h1>
        <p className="text-gray-600 mb-8">
          We encountered an error while loading this provider's information.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-xl text-left">
            <p className="text-sm font-mono text-red-700 break-words">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Try Again
          </button>
          <Link
            href="/providers"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Providers
          </Link>
        </div>
      </div>
    </div>
  );
}
