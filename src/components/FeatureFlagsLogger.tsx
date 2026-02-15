'use client';

import { useEffect } from 'react';
import { FEATURES } from '@/lib/features';
import { logger } from '@/lib/logger';

export function FeatureFlagsLogger() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logger.debug(
        '[FEATURE_FLAGS] Active:',
        { features: Object.entries(FEATURES).filter(([, enabled]) => enabled).map(([feature]) => feature) }
      );
    }
  }, []);

  return null;
}
