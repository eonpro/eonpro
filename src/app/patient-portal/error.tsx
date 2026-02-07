'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ShieldAlert, Phone } from 'lucide-react';
import { logger } from '@/lib/logger';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PatientPortalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error('Patient portal error:', {
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
          <p className="text-gray-600 mb-6">
            For your security, your session has expired. Please log in again to access your health information.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors w-full"
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
          We're having trouble loading your patient portal. This error has been reported to our technical team.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-left">
            <p className="text-xs font-mono text-red-700 break-words">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
          <a
            href="tel:+18001234567"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
          >
            <Phone className="w-4 h-4" />
            Call Support
          </a>
        </div>

        <p className="mt-6 text-sm text-gray-500">
          If you're experiencing a medical emergency, please call 911.
        </p>
      </div>
    </div>
  );
}
