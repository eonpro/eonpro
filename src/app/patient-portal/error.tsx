'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, ShieldAlert, Phone } from 'lucide-react';
import { logger } from '@/lib/logger';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PatientPortalError({ error, reset }: ErrorProps) {
  const { branding } = useClinicBranding();
  const digits = branding?.supportPhone?.replace(/\D/g, '') ?? '';
  const supportTel = digits.length >= 10 ? `tel:+1${digits.slice(-10)}` : null;

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
      <div className="flex min-h-screen items-center justify-center bg-[#efece7] p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
          <div className="mb-6">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-8 w-8 text-amber-600" />
            </div>
          </div>
          <h1 className="mb-3 text-xl font-bold text-gray-900">Session Expired</h1>
          <p className="mb-6 text-gray-600">
            For your security, your session has expired. Please log in again to access your health
            information.
          </p>
          <Link
            href={`/login?redirect=${encodeURIComponent(PATIENT_PORTAL_PATH)}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-700"
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
          We're having trouble loading your patient portal. This error has been reported to our
          technical team.
        </p>

        {process.env.NODE_ENV === 'development' && error.message && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-left">
            <p className="break-words font-mono text-xs text-red-700">{error.message}</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-medium text-white transition-colors hover:bg-emerald-700"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>
          {supportTel && (
            <a
              href={supportTel}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-100 px-5 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              <Phone className="h-4 w-4" />
              Call Support
            </a>
          )}
        </div>

        <p className="mt-6 text-sm text-gray-500">
          If you're experiencing a medical emergency, please call 911.
        </p>
      </div>
    </div>
  );
}
