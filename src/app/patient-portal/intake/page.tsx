'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

/**
 * Intake page is disabled until the intake portal is production-ready.
 * Redirects all visitors back to the main patient portal dashboard.
 */
export default function PatientPortalIntakePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(PATIENT_PORTAL_PATH);
  }, [router]);

  return null;
}
