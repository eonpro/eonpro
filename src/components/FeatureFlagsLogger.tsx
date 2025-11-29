'use client';

import { useEffect } from 'react';
import { FEATURES } from '@/lib/features';
import { logger } from '@/lib/logger';

export function FeatureFlagsLogger() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      logger.debug('🚀 Active Feature Flags:', 
        Object.entries(FEATURES)
          .filter(([, enabled]) => enabled)
          .map(([feature]) => feature)
      );
    }
  }, []);

  return null;
}
