'use client';

import { useState, useEffect, Suspense } from 'react';

import { Video, Loader2, AlertTriangle, Settings } from 'lucide-react';

import { Feature } from '@/components/Feature';
import TelehealthDashboard from '@/components/telehealth/TelehealthDashboard';
import { type TelehealthPhase } from '@/components/telehealth/types';
import { safeParseJsonString } from '@/lib/utils/safe-json';

function TelehealthDisabledFallback() {
  const [hasUpcomingVideo, setHasUpcomingVideo] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { apiFetch } = await import('@/lib/api/fetch');
        const res = await apiFetch('/api/provider/telehealth/upcoming');
        if (res.ok) {
          const data = await res.json();
          if ((data.sessions ?? []).length > 0) {
            setHasUpcomingVideo(true);
          }
        }
      } catch {
        // non-blocking
      }
    })();
  }, []);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="mx-auto max-w-lg rounded-2xl bg-white p-12 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
          <Video className="h-10 w-10 text-blue-400" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-gray-900">Telehealth Not Enabled</h2>
        <p className="text-sm text-gray-500">
          Virtual consultations with embedded Zoom video, AI-powered SOAP notes, and more.
        </p>

        {hasUpcomingVideo && (
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Video appointments detected</p>
              <p className="mt-1 text-xs text-amber-700">
                You have upcoming video appointments but Zoom Telehealth is not enabled.
                Set <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px]">NEXT_PUBLIC_ENABLE_ZOOM_TELEHEALTH=&quot;true&quot;</code> in
                your environment and ensure Zoom API credentials are configured.
              </p>
            </div>
          </div>
        )}

        <a
          href="/admin/integrations"
          className="mt-6 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50"
        >
          <Settings className="h-4 w-4" />
          Configure Integrations
        </a>
      </div>
    </div>
  );
}

function TelehealthContent() {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      const parsed = safeParseJsonString(user);
      if (!parsed) {
        setLoading(false);
        return;
      }

      const displayName =
        parsed.firstName && parsed.lastName
          ? `Dr. ${parsed.firstName} ${parsed.lastName}`
          : parsed.name ?? parsed.email?.split('@')[0] ?? 'Provider';

      setUserName(displayName.trim());
      setUserEmail(parsed.email ?? '');
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line no-unused-vars
  const handlePhaseChange = (_phase: TelehealthPhase) => {
    // Future: could toggle layout based on phase
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <Feature
      feature="ZOOM_TELEHEALTH"
      fallback={<TelehealthDisabledFallback />}
    >
      <TelehealthDashboard
        userName={userName}
        userEmail={userEmail}
        onPhaseChange={handlePhaseChange}
      />
    </Feature>
  );
}

export default function ProviderTelehealthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <TelehealthContent />
    </Suspense>
  );
}
