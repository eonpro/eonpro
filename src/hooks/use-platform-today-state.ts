'use client';

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { calendarTodayClient, calendarTodayServer } from '@/lib/utils/platform-calendar';

/**
 * Hydration-safe default for `<input type="date" />`: matches SSR (Eastern fallback),
 * then updates to the browser's calendar "today" after mount.
 */
export function usePlatformTodayState(): [string, Dispatch<SetStateAction<string>>] {
  const [d, setD] = useState(() => calendarTodayServer());
  useEffect(() => {
    setD(calendarTodayClient());
  }, []);
  return [d, setD];
}
