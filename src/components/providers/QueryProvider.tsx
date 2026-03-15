'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Wraps the app tree with a React Query QueryClientProvider.
 * Defaults are tuned for a healthcare dashboard:
 *  - staleTime: 30s  (data is "fresh" for 30s — no refetch on mount)
 *  - gcTime: 5min     (unused cache entries are garbage-collected after 5min)
 *  - refetchOnWindowFocus: true (silently refresh when user returns to tab)
 *  - retry: 1         (one automatic retry on transient failure)
 */
export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
