'use client';

import { useEffect } from 'react';
import { RefreshCw, Home, ArrowLeft } from 'lucide-react';
import { EONPRO_LOGO } from '@/lib/constants/brand-assets';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Application error:', error);
  }, [error]);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center p-6"
      style={{ backgroundColor: '#EFECE7' }}
    >
      <div className="w-full max-w-lg text-center">
        {/* EonPro Logo */}
        <div className="mb-12">
          <img
            src={EONPRO_LOGO}
            alt="EONPRO"
            className="mx-auto h-8 w-auto opacity-90"
          />
        </div>

        {/* Error Illustration */}
        <div className="mb-8">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-white/70 shadow-sm">
            <svg
              className="h-12 w-12 text-[#B8544F]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
        </div>

        {/* Error Message */}
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900">
          Something went wrong
        </h1>
        <p className="mx-auto mb-10 max-w-sm text-base leading-relaxed text-gray-500">
          We apologize for the inconvenience. An unexpected error occurred while
          processing your request.
        </p>

        {/* Error Details (Development only) */}
        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-8 rounded-2xl border border-red-200/60 bg-white/60 p-5 text-left backdrop-blur-sm">
            <p className="break-words font-mono text-sm text-red-700">
              {error.message}
            </p>
            {error.digest && (
              <p className="mt-2 font-mono text-xs text-red-400">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col justify-center gap-3 sm:flex-row">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-gray-900 px-7 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-gray-800 hover:shadow-md active:scale-[0.98]"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center gap-2.5 rounded-full border border-gray-300/60 bg-white/80 px-7 py-3 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md active:scale-[0.98]"
          >
            <Home className="h-4 w-4" />
            Go Home
          </a>
        </div>

        {/* Back Link */}
        <button
          onClick={() => window.history.back()}
          className="mt-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Go back to previous page
        </button>

        {/* Footer */}
        <div className="mt-16 space-y-4">
          <p className="text-sm text-gray-400">
            If this problem persists, please contact{' '}
            <a
              href="mailto:support@eonpro.io"
              className="text-gray-500 underline decoration-gray-300 underline-offset-2 transition-colors hover:text-gray-700"
            >
              support@eonpro.io
            </a>
          </p>
          <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            Powered by
            <img src={EONPRO_LOGO} alt="EONPRO" className="h-[18px] w-auto opacity-50" />
          </div>
        </div>
      </div>
    </div>
  );
}
