'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  MessageCircle,
  ChevronRight,
} from 'lucide-react';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import { portalFetch, getPortalResponseError, SESSION_EXPIRED_MESSAGE } from '@/lib/api/patient-portal-client';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { usePatientPortalLanguage } from '@/lib/contexts/PatientPortalLanguageContext';

export default function CareTeamPage() {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const { t } = usePatientPortalLanguage();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [careTeam, setCareTeam] = useState<Array<{
    id: number;
    name: string;
    role: string;
    specialty: string;
    avatar: string;
    available: boolean;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setError(null);
        const res = await portalFetch('/api/patient-portal/care-team');
        const sessionErr = getPortalResponseError(res);
        if (sessionErr) {
          if (!cancelled) setError(sessionErr);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setError('Failed to load your care team. Please try again.');
          return;
        }
        const data = await res.json();
        if (!cancelled && data?.providers) {
          setCareTeam((data.providers ?? []).map((p: { id: number; firstName?: string; lastName?: string; titleLine?: string; isActive?: boolean }) => ({
            id: p.id,
            name: `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || 'Provider',
            role: p.titleLine ?? 'Care Provider',
            specialty: '',
            avatar: `${(p.firstName ?? '?')[0]}${(p.lastName ?? '?')[0]}`.toUpperCase(),
            available: p.isActive !== false,
          })));
        }
      } catch {
        if (!cancelled) setError('Unable to load care team. Please check your connection.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const handleChat = () => router.push(`${PATIENT_PORTAL_PATH}/chat`);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
        <p className="text-sm text-gray-500">{t('careTeamLoading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={PATIENT_PORTAL_PATH} className="rounded-lg p-2 hover:bg-black/5">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-lg font-semibold">{t('careTeamTitle')}</h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        {error && (
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              error === SESSION_EXPIRED_MESSAGE
                ? 'border-amber-200 bg-amber-50'
                : 'border-red-200 bg-red-50'
            }`}
            role="alert"
          >
            <p className={`flex-1 text-sm font-medium ${
              error === SESSION_EXPIRED_MESSAGE ? 'text-amber-900' : 'text-red-700'
            }`}>
              {error}
            </p>
            {error === SESSION_EXPIRED_MESSAGE ? (
              <Link
                href={`/login?redirect=${encodeURIComponent(`${PATIENT_PORTAL_PATH}/care-team`)}&reason=session_expired`}
                className="shrink-0 rounded-lg bg-amber-200 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-300"
              >
                Log in
              </Link>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-200"
              >
                Retry
              </button>
            )}
          </div>
        )}

        {/* Contact Care Team Card */}
        <div className="rounded-2xl border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: primaryColor }}
            >
              <MessageCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-900">{t('careTeamContactTitle')}</h2>
              <p className="text-sm text-gray-600">{t('careTeamContactDesc')}</p>
            </div>
          </div>

          <button
            onClick={handleChat}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-white transition-all hover:brightness-90 active:scale-[0.98]"
            style={{ backgroundColor: primaryColor }}
          >
            <MessageCircle className="h-5 w-5" />
            {t('careTeamChat')}
          </button>
        </div>

        {/* Team Members */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('careTeamProviders')}</h2>

          {careTeam.length === 0 ? (
            <div className="rounded-xl p-8 text-center">
              <p className="text-gray-500">
                {t('careTeamNoProviders')}
              </p>
            </div>
          ) : (
            careTeam.map((member) => (
              <div
                key={member.id}
                className="rounded-xl border border-black/5 bg-white/40 p-4 transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  {/* Avatar */}
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 text-sm font-semibold text-white sm:h-14 sm:w-14 sm:text-base">
                    {member.avatar}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate font-semibold text-gray-900">{member.name}</h3>
                        <p className="text-sm text-gray-600">{member.role}</p>
                        {member.specialty && (
                          <p className="text-xs text-gray-500">{member.specialty}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-gray-400" />
                    </div>

                    {/* Availability */}
                    <div className="mt-3 flex items-center gap-4 text-xs">
                      <span
                        className={`rounded-full px-2 py-1 font-medium ${
                          member.available
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {member.available ? t('careTeamAvailable') : t('careTeamBusy')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
