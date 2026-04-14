import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import { portalFetch, getPortalResponseError } from '@/lib/api/patient-portal-client';
import { safeParseJson } from '@/lib/utils/safe-json';

/**
 * Fetcher that uses portalFetch (auth headers, credentials, timeout)
 * and returns parsed JSON. Throws on session errors so SWR surfaces them.
 */
async function portalSWRFetcher<T>(url: string): Promise<T> {
  const res = await portalFetch(url);
  const sessionErr = getPortalResponseError(res);
  if (sessionErr) throw new Error(sessionErr);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const data = await safeParseJson(res);
  return data as T;
}

const DEFAULT_CONFIG: SWRConfiguration = {
  revalidateOnFocus: false,
  dedupingInterval: 10_000,
  errorRetryCount: 2,
};

/**
 * SWR wrapper for patient-portal API calls.
 * Provides client-side caching, deduplication, and stale-while-revalidate.
 *
 * Pass `null` as key to conditionally skip fetching (e.g. waiting for patientId).
 */
export function usePortalSWR<T = unknown>(
  key: string | null,
  config?: SWRConfiguration<T>
): SWRResponse<T> {
  return useSWR<T>(key, portalSWRFetcher<T>, {
    ...DEFAULT_CONFIG,
    ...config,
  });
}
