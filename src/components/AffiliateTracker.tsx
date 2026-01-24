'use client';

/**
 * Affiliate Tracking Component
 * 
 * Automatically tracks affiliate visits when ?ref=CODE is present in URL.
 * Add this to your root layout to enable affiliate tracking site-wide.
 */

import { useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';

export default function AffiliateTracker() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    // Check if there's a ref code in the URL
    const refCode = searchParams.get('ref') || searchParams.get('refcode');
    
    if (!refCode) return;

    // Dynamic import to avoid SSR issues
    const trackVisit = async () => {
      try {
        const { autoTrack } = await import('@/lib/affiliate/tracking-client');
        await autoTrack();
      } catch (error) {
        // Silently fail - don't break the app for tracking errors
        console.debug('[AffiliateTracker] Tracking error:', error);
      }
    };

    trackVisit();
  }, [searchParams, pathname]);

  // This component renders nothing
  return null;
}
