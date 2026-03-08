'use client';

import { useState, useEffect } from 'react';

import { Video, Loader2 } from 'lucide-react';

import { Feature } from '@/components/Feature';
import TelehealthDashboard from '@/components/telehealth/TelehealthDashboard';
import { type TelehealthPhase } from '@/components/telehealth/types';
import { safeParseJsonString } from '@/lib/utils/safe-json';

export default function ProviderTelehealthPage() {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userId, setUserId] = useState<number | undefined>();
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
      const provId = parsed.providerId ?? parsed.id;
      if (provId) setUserId(Number(provId));
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
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-12 text-center shadow-sm">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50">
              <Video className="h-10 w-10 text-blue-400" />
            </div>
            <h2 className="mb-2 text-2xl font-bold text-gray-900">Telehealth Coming Soon</h2>
            <p className="text-sm text-gray-500">
              Virtual consultations with embedded Zoom video, AI-powered SOAP notes, and more.
            </p>
          </div>
        </div>
      }
    >
      <TelehealthDashboard
        userName={userName}
        userEmail={userEmail}
        userId={userId}
        onPhaseChange={handlePhaseChange}
      />
    </Feature>
  );
}
