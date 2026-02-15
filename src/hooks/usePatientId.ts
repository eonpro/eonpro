'use client';

import { useState, useEffect } from 'react';
import { portalFetch } from '@/lib/api/patient-portal-client';
import { safeParseJson, safeParseJsonString } from '@/lib/utils/safe-json';
import { getMinimalPortalUserPayload, setPortalUserStorage } from '@/lib/utils/portal-user-storage';

/**
 * Shared hook to resolve the current patient's ID.
 *
 * Resolution order:
 * 1. Read `user` from localStorage (non-PHI: { id, role, patientId })
 * 2. If patientId is missing and role is 'patient', fetch from /api/auth/me
 * 3. Cache the result in localStorage for future use
 *
 * Returns { patientId, loading, error }
 */
export function usePatientId() {
  const [patientId, setPatientId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      try {
        const userJson = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
        if (!userJson) {
          setError('No user session found');
          setLoading(false);
          return;
        }

        const userData = safeParseJsonString<{ patientId?: number; role?: string; id?: number }>(userJson);
        if (!userData) {
          setError('Invalid user session');
          setLoading(false);
          return;
        }

        let pid: number | null = userData.patientId ?? null;

        // If patientId is missing but user is a patient, fetch from /api/auth/me
        if (pid == null && userData.role?.toLowerCase() === 'patient') {
          const meRes = await portalFetch('/api/auth/me', { cache: 'no-store' });
          if (meRes.ok && !cancelled) {
            const meData = await safeParseJson(meRes);
            const fromMe = (meData as { user?: { patientId?: number } } | null)?.user?.patientId;
            if (typeof fromMe === 'number' && fromMe > 0) {
              pid = fromMe;
              // Cache for next time
              setPortalUserStorage(getMinimalPortalUserPayload({ ...userData, patientId: fromMe }));
            }
          }
        }

        if (!cancelled) {
          if (pid != null) {
            setPatientId(pid);
          } else {
            setError('Could not resolve patient ID');
          }
        }
      } catch {
        if (!cancelled) {
          setError('Failed to resolve patient ID');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  return { patientId, loading, error };
}

export default usePatientId;
