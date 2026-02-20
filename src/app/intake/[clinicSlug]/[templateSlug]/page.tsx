'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Intake Form Landing Page
 *
 * Route: /intake/[clinicSlug]/[templateSlug]
 *
 * Loads the form config, determines the startStep, and redirects
 * to /intake/[clinicSlug]/[templateSlug]/[startStep].
 */
export default function IntakeLandingPage() {
  const params = useParams();
  const router = useRouter();
  const clinicSlug = params.clinicSlug as string;
  const templateSlug = params.templateSlug as string;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAndRedirect() {
      try {
        const res = await fetch(
          `/api/intake-forms/config/${clinicSlug}/${templateSlug}`,
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Form not found. Please check the URL.');
          return;
        }

        const data = await res.json();
        const startStep = data.config?.startStep;

        if (!cancelled && startStep) {
          router.replace(`/intake/${clinicSlug}/${templateSlug}/${startStep}`);
        } else if (!cancelled) {
          setError('This form has no steps configured yet.');
        }
      } catch {
        if (!cancelled) {
          setError('Unable to load form. Please try again later.');
        }
      }
    }

    loadAndRedirect();
    return () => { cancelled = true; };
  }, [clinicSlug, templateSlug, router]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Form Unavailable</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-400">Loading your form...</p>
      </div>
    </div>
  );
}
