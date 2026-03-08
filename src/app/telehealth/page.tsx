'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Feature } from '@/components/Feature';
import TelehealthDashboard from '@/components/telehealth/TelehealthDashboard';
import { TelehealthPhase } from '@/components/telehealth/types';
import { Video, Loader2 } from 'lucide-react';
import { safeParseJsonString } from '@/lib/utils/safe-json';

export default function TelehealthPage() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const user = localStorage.getItem('user');
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      const parsed = safeParseJsonString(user);
      if (!parsed) {
        router.push('/login');
        return;
      }

      const displayName =
        parsed.firstName && parsed.lastName
          ? `Dr. ${parsed.firstName} ${parsed.lastName}`
          : parsed.name || parsed.email?.split('@')[0] || 'Provider';

      setUserName(displayName.trim());
      setUserEmail(parsed.email || '');
      setLoading(false);
    } catch {
      router.push('/login');
    }
  }, [router]);

  const handlePhaseChange = (phase: TelehealthPhase) => {
    setIsFullScreen(phase === 'call');
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <Feature
      feature="ZOOM_TELEHEALTH"
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
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
        onPhaseChange={handlePhaseChange}
      />
    </Feature>
  );
}
