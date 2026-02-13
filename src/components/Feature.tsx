'use client';

import { ReactNode, useEffect, useState } from 'react';
import { isFeatureEnabled, FeatureFlags } from '@/lib/features';

export function useFeature(feature: keyof FeatureFlags): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isFeatureEnabled(feature));
  }, [feature]);

  return enabled;
}

interface FeatureProps {
  feature: keyof FeatureFlags;
  children: ReactNode;
  fallback?: ReactNode;
}

export function Feature({ feature, children, fallback = null }: FeatureProps) {
  const enabled = useFeature(feature);
  return <>{enabled ? children : fallback}</>;
}
