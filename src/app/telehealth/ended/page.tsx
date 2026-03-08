'use client';

import { useEffect , Suspense } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import { Loader2 } from 'lucide-react';

function EndedRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');

  useEffect(() => {
    const target = appointmentId
      ? `/telehealth?postCall=true&appointmentId=${appointmentId}`
      : '/telehealth';
    router.replace(target);
  }, [router, appointmentId]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
    </div>
  );
}

export default function TelehealthEndedPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#efece7]">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <EndedRedirect />
    </Suspense>
  );
}
