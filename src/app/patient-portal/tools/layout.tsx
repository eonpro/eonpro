'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';

/**
 * Redirects to portal home if the user landed on a tools sub-route whose feature is disabled.
 * injection-tracker is gated by showDoseCalculator.
 */
export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const features = usePortalFeatures();

  useEffect(() => {
    const base = PATIENT_PORTAL_PATH;
    if (!pathname?.startsWith(base + '/tools/')) return;
    const value = features.showDoseCalculator;
    const enabled = value === true || value === undefined;
    if (!enabled) {
      router.replace(base);
    }
  }, [pathname, features.showDoseCalculator, router]);

  return <>{children}</>;
}
