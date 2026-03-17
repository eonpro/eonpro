import React, { ReactNode } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60_000, // 24 hours for offline persistence
      retry: 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'portal-query-cache',
  throttleTime: 1000,
});

interface Props {
  children: ReactNode;
}

export default function QueryProvider({ children }: Props) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: 24 * 60 * 60_000, // 24 hours
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Only persist successful queries with data
            return query.state.status === 'success' && query.state.data !== undefined;
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
