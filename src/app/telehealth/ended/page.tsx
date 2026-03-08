'use client';

import { Video, CheckCircle, ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function EndedContent() {
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="mx-auto w-full max-w-md px-4">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 px-8 py-8 text-center">
            <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
            <h1 className="text-2xl font-bold text-gray-900">Meeting Ended</h1>
            <p className="mt-2 text-gray-600">
              Your telehealth consultation has concluded.
            </p>
          </div>

          <div className="space-y-3 px-8 py-6">
            {appointmentId && (
              <Link
                href={`/provider/soap-notes?appointmentId=${appointmentId}`}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700"
              >
                <FileText className="h-5 w-5" />
                Add SOAP Notes
              </Link>
            )}

            <Link
              href="/telehealth"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 font-medium text-gray-700 hover:bg-gray-50"
            >
              <Video className="h-5 w-5" />
              Telehealth Center
            </Link>

            <Link
              href="/provider"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-200"
            >
              <ArrowLeft className="h-4 w-4" />
              Provider Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TelehealthEndedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <CheckCircle className="h-12 w-12 text-green-500" />
        </div>
      }
    >
      <EndedContent />
    </Suspense>
  );
}
