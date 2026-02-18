'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Phone,
  Video,
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
          setCareTeam(data.providers.map((p: any) => ({
            id: p.id,
            name: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Provider',
            role: p.titleLine || 'Care Provider',
            specialty: '',
            avatar: `${(p.firstName || '?')[0]}${(p.lastName || '?')[0]}`.toUpperCase(),
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

  // Navigation handlers
  const handleChat = () => router.push(`${PATIENT_PORTAL_PATH}/chat`);
  const handleCall = () => {
    const phone = branding?.supportPhone;
    if (phone) {
      window.location.href = `tel:${phone.replace(/\D/g, '')}`;
    }
  };
  const handleVideo = () => router.push(`${PATIENT_PORTAL_PATH}/appointments?type=video`);
  const handleMessage = (providerId: number) =>
    router.push(`${PATIENT_PORTAL_PATH}/chat?provider=${providerId}`);
  const handleBookAppointment = (providerId: number) =>
    router.push(`${PATIENT_PORTAL_PATH}/appointments?provider=${providerId}`);
  const handleContactConcierge = () => router.push(`${PATIENT_PORTAL_PATH}/chat?concierge=true`);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50">
        <div
          className="h-12 w-12 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: `${primaryColor} transparent ${primaryColor} ${primaryColor}` }}
        />
        <p className="text-sm text-gray-500">{t('careTeamLoading')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href={PATIENT_PORTAL_PATH} className="rounded-lg p-2 hover:bg-gray-100">
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

        {/* Book a Visit Card */}
        <div className="rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
          <h2 className="mb-2 text-xl font-semibold">{t('careTeamBookVisit')}</h2>
          <p className="mb-4 text-sm text-blue-100">{t('careTeamScheduleNext')}</p>

          <div className="flex gap-3">
            <button
              onClick={handleChat}
              className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30"
            >
              <MessageCircle className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">{t('careTeamChat')}</span>
            </button>
            <button
              onClick={handleCall}
              className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30"
            >
              <Phone className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">{t('careTeamCall')}</span>
            </button>
            <button
              onClick={handleVideo}
              className="flex flex-1 flex-col items-center rounded-xl bg-white/20 py-3 backdrop-blur transition-colors hover:bg-white/30"
            >
              <Video className="mb-1 h-6 w-6" />
              <span className="text-sm font-medium">{t('careTeamVideo')}</span>
            </button>
          </div>
        </div>

        {/* Team Members */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('careTeamProviders')}</h2>

          {careTeam.length === 0 ? (
            <div className="rounded-xl bg-white p-8 text-center shadow-sm">
              <p className="text-gray-500">
                {t('careTeamNoProviders')}
              </p>
            </div>
          ) : (
            careTeam.map((member) => (
              <div
                key={member.id}
                className="rounded-xl bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex items-start gap-4">
                  {/* Avatar */}
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 font-semibold text-white">
                    {member.avatar}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">{member.name}</h3>
                        <p className="text-sm text-gray-600">{member.role}</p>
                        {member.specialty && (
                          <p className="text-xs text-gray-500">{member.specialty}</p>
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
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

                    {/* Quick Actions */}
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => handleMessage(member.id)}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-gray-200"
                      >
                        {t('careTeamMessage')}
                      </button>
                      {member.available && (
                        <button
                          onClick={() => handleBookAppointment(member.id)}
                          className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
                          style={{ backgroundColor: primaryColor }}
                        >
                          {t('careTeamBookAppointment')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Concierge Card */}
        <div className="rounded-xl border border-[var(--brand-primary-medium)] bg-[var(--brand-primary-light)] p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{t('careTeamConcierge')}</h3>
              <p className="mt-1 text-sm text-gray-600">{t('careTeamConciergeDesc')}</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-primary)]">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
          </div>

          <button
            onClick={handleContactConcierge}
            className="w-full rounded-lg bg-[var(--brand-primary)] py-2 text-sm font-medium text-white transition-colors hover:brightness-90"
          >
            {t('careTeamContactConcierge')}
          </button>
        </div>
      </div>
    </div>
  );
}
