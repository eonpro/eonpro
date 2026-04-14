'use client';

import { useEffect } from 'react';
import { PLATFORM_TIMEZONE_COOKIE_NAME } from '@/lib/utils/platform-calendar';
import { normalizeIANATimeZone } from '@/lib/utils/timezone';

/**
 * Persists the browser IANA timezone so server routes can prefer it over UTC calendar math.
 */
export function ClientTimeZoneBootstrap() {
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const n = normalizeIANATimeZone(tz);
      if (!n) return;
      document.cookie = `${PLATFORM_TIMEZONE_COOKIE_NAME}=${encodeURIComponent(n)};path=/;max-age=31536000;SameSite=Lax`;
    } catch {
      /* noop */
    }
  }, []);
  return null;
}
