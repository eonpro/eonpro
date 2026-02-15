'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api/fetch';

/**
 * When the user is on a clinic subdomain (e.g. ot.eonpro.io) but their session
 * is for a different clinic, show a banner offering to switch to the subdomain's clinic.
 * Backup for server-side subdomain override (auth middleware).
 */
export function SubdomainClinicBanner() {
  const [banner, setBanner] = useState<{
    subdomainName: string;
    subdomainClinicId: number;
  } | null>(null);
  const [switching, setSwitching] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || dismissed) return;

    let cancelled = false;
    (async () => {
      const hostname = window.location.hostname;
      // Only run on *.eonpro.io (or similar) - skip main app and localhost
      if (
        hostname === 'localhost' ||
        hostname.startsWith('localhost:') ||
        hostname === 'app.eonpro.io' ||
        hostname.endsWith('.vercel.app')
      ) {
        return;
      }

      try {
        const [resolveRes, currentRes] = await Promise.all([
          apiFetch(`/api/clinic/resolve?domain=${encodeURIComponent(hostname)}`, {
            cache: 'no-store',
          }),
          apiFetch('/api/clinic/current'),
        ]);

        if (cancelled) return;
        if (!resolveRes.ok || !currentRes.ok) return;

        const resolveData = await resolveRes.json();
        const currentData = await currentRes.json();

        if (resolveData.isMainApp || resolveData.clinicId == null) return;
        const currentId = currentData?.id ?? currentData?.clinicId;
        if (currentId == null) return;
        if (resolveData.clinicId === currentId) return;

        setBanner({
          subdomainName: resolveData.name || 'this clinic',
          subdomainClinicId: resolveData.clinicId,
        });
      } catch {
        // Non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dismissed]);

  const handleSwitch = async () => {
    if (!banner || switching) return;
    setSwitching(true);
    try {
      const res = await apiFetch('/api/clinic/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId: banner.subdomainClinicId }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setSwitching(false);
    }
  };

  if (!banner) return null;

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
        <span>
          You&apos;re on <strong>{banner.subdomainName}</strong>&apos;s portal. Switch to this
          clinic to see the correct data.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleSwitch}
          disabled={switching}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
        >
          {switching ? (
            'Switching…'
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              Switch to {banner.subdomainName}
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded px-2 py-1 text-amber-700 hover:bg-amber-100"
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
