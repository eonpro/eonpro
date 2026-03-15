'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';

/**
 * Hydrates the Zustand auth store from localStorage on first client mount.
 * Place this once in the root layout so every page has access to auth state
 * without reading localStorage independently.
 */
export default function AuthHydrator() {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return null;
}
