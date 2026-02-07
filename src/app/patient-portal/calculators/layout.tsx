'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { usePortalFeatures } from '@/lib/contexts/ClinicBrandingContext';
import { PATIENT_PORTAL_PATH } from '@/lib/config/patient-portal';
import type { PortalFeatureFlagKey } from '@/lib/patient-portal';

/** Map calculator segment to feature flag; sub-routes without entry are not gated */
const CALCULATOR_FEATURE_MAP: Record<string, PortalFeatureFlagKey> = {
  bmi: 'showBMICalculator',
  calories: 'showCalorieCalculator',
  macros: 'showCalorieCalculator',
  semaglutide: 'showDoseCalculator',
  tirzepatide: 'showDoseCalculator',
};

/**
 * Redirects to /portal/calculators if the user landed on a calculator sub-route whose feature is disabled.
 * Tools nav can be on while individual calculators are off per clinic.
 */
export default function CalculatorsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const features = usePortalFeatures();

  useEffect(() => {
    const base = PATIENT_PORTAL_PATH;
    if (!pathname?.startsWith(base + '/calculators/')) return;
    const segment = pathname.slice((base + '/calculators/').length).split('/')[0];
    const featureKey = CALCULATOR_FEATURE_MAP[segment];
    if (!featureKey) return;
    const value = features[featureKey];
    const enabled = value === true || value === undefined;
    if (!enabled) {
      router.replace(base + '/calculators');
    }
  }, [pathname, features, router]);

  return <>{children}</>;
}
