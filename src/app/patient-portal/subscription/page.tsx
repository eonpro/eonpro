'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

/**
 * Legacy subscription page — redirects to the unified billing page.
 * Kept so bookmarks and old links still work.
 */
export default function SubscriptionRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`${PATIENT_PORTAL_PATH}/billing`);
  }, [router]);

  return (
    <div className="flex min-h-[40dvh] items-center justify-center">
      <p className="text-sm text-gray-400">Redirecting to billing&hellip;</p>
    </div>
  );
}
