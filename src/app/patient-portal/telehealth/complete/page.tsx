'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CheckCircle,
  Clock,
  Users,
  FileText,
  ArrowRight,
  Loader2,
  Shield,
  HeadphonesIcon,
} from 'lucide-react';
import { portalFetch } from '@/lib/api/patient-portal-client';

interface CompletedVisit {
  title: string;
  providerName?: string;
  startTime: string;
  duration: number;
}

function PostCallContent() {
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');
  const [visit, setVisit] = useState<CompletedVisit | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appointmentId) {
      setLoading(false);
      return;
    }

    const fetchVisit = async () => {
      try {
        const res = await portalFetch(
          `/api/patient-portal/appointments?appointmentId=${appointmentId}`
        );
        if (res.ok) {
          const data = await res.json();
          const apt = data.appointment ?? data;
          if (apt?.id) {
            setVisit({
              title: apt.title || apt.reason || 'Video Consultation',
              providerName:
                apt.providerName ??
                (apt.provider ? `${apt.provider.firstName} ${apt.provider.lastName}` : undefined),
              startTime: apt.startTime,
              duration: apt.duration || 15,
            });
          }
        }
      } catch {
        // Non-blocking
      } finally {
        setLoading(false);
      }
    };

    void fetchVisit();
  }, [appointmentId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          {/* Success Header */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Visit Complete</h1>
            <p className="mt-1 text-sm text-emerald-100">
              Thank you for attending your telehealth appointment
            </p>
          </div>

          {/* Visit Details */}
          {visit && (
            <div className="border-b border-gray-100 px-6 py-5">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Visit</p>
                    <p className="text-sm font-medium text-gray-900">{visit.title}</p>
                  </div>
                </div>
                {visit.providerName && (
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Provider</p>
                      <p className="text-sm font-medium text-gray-900">{visit.providerName}</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-xs text-gray-500">Date</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(visit.startTime).toLocaleString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* What's Next */}
          <div className="px-6 py-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">What happens next</h2>
            <div className="space-y-3">
              <div className="flex items-start gap-3 rounded-lg bg-blue-50 p-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-blue-900">Clinical notes being prepared</p>
                  <p className="text-xs text-blue-700">
                    Your provider is reviewing and finalizing notes from today's visit.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg bg-purple-50 p-3">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-purple-900">Prescriptions</p>
                  <p className="text-xs text-purple-700">
                    If any medications were discussed, your prescription will be processed and
                    you'll be notified when it ships.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg bg-gray-50 p-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Your privacy</p>
                  <p className="text-xs text-gray-600">
                    All visit information is encrypted and stored securely in compliance with HIPAA.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-gray-100 px-6 py-5">
            <a
              href="/patient-portal"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              Return to Dashboard
            </a>
            <a
              href="/patient-portal/support"
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 px-6 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
            >
              <HeadphonesIcon className="h-4 w-4" />
              Contact Support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PatientTelehealthCompletePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
          <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
        </div>
      }
    >
      <PostCallContent />
    </Suspense>
  );
}
