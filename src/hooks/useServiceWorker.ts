'use client';

/**
 * Service Worker Registration Hook
 * Handles PWA service worker lifecycle and updates
 */

import { useEffect, useState, useCallback } from 'react';

interface ServiceWorkerState {
  isSupported: boolean;
  isRegistered: boolean;
  isOffline: boolean;
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
  installing: boolean;
}

interface UseServiceWorkerReturn extends ServiceWorkerState {
  update: () => Promise<void>;
  skipWaiting: () => void;
}

export function useServiceWorker(): UseServiceWorkerReturn {
  const [state, setState] = useState<ServiceWorkerState>({
    isSupported: false,
    isRegistered: false,
    isOffline: false,
    registration: null,
    updateAvailable: false,
    installing: false,
  });

  // Check online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setState((s) => ({ ...s, isOffline: false }));
    const handleOffline = () => setState((s) => ({ ...s, isOffline: true }));

    // Set initial state
    setState((s) => ({
      ...s,
      isSupported: 'serviceWorker' in navigator,
      isOffline: !navigator.onLine,
    }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Register service worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    const registerSW = async () => {
      try {
        setState((s) => ({ ...s, installing: true }));

        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/patient-portal',
        });

        console.log('[PWA] Service worker registered:', registration.scope);

        setState((s) => ({
          ...s,
          isRegistered: true,
          registration,
          installing: false,
        }));

        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New update available
              console.log('[PWA] New version available');
              setState((s) => ({ ...s, updateAvailable: true }));
            }
          });
        });

        // Listen for controller change (after skipWaiting)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[PWA] Controller changed, reloading...');
          window.location.reload();
        });

        // Check for existing waiting worker
        if (registration.waiting) {
          setState((s) => ({ ...s, updateAvailable: true }));
        }
      } catch (error) {
        console.error('[PWA] Service worker registration failed:', error);
        setState((s) => ({ ...s, installing: false }));
      }
    };

    // Register after page load to not block rendering
    if (document.readyState === 'complete') {
      registerSW();
    } else {
      window.addEventListener('load', registerSW);
      return () => window.removeEventListener('load', registerSW);
    }
    return undefined;
  }, []);

  // Check for updates manually
  const update = useCallback(async () => {
    if (!state.registration) return;

    try {
      await state.registration.update();
      console.log('[PWA] Checked for updates');
    } catch (error) {
      console.error('[PWA] Update check failed:', error);
    }
  }, [state.registration]);

  // Skip waiting and activate new service worker
  const skipWaiting = useCallback(() => {
    if (!state.registration?.waiting) return;

    state.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [state.registration]);

  return {
    ...state,
    update,
    skipWaiting,
  };
}

/**
 * Hook for offline data storage and sync
 */
export function useOfflineStorage() {
  const [db, setDb] = useState<IDBDatabase | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const request = indexedDB.open('PatientPortalOffline', 1);

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('weight-logs')) {
        database.createObjectStore('weight-logs', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('messages')) {
        database.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      }
      if (!database.objectStoreNames.contains('progress')) {
        database.createObjectStore('progress', { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = () => {
      setDb(request.result);
    };

    request.onerror = () => {
      console.error('[Offline] Failed to open database:', request.error);
    };
  }, []);

  const saveOffline = useCallback(
    async (storeName: string, data: unknown): Promise<number | null> => {
      if (!db) return null;

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.add({ data, timestamp: Date.now() });

        request.onsuccess = () => resolve(request.result as number);
        request.onerror = () => reject(request.error);
      });
    },
    [db]
  );

  const getOfflineData = useCallback(
    async (storeName: string): Promise<unknown[]> => {
      if (!db) return [];

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    [db]
  );

  const requestSync = useCallback(async (tag: string) => {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
      const registration = await navigator.serviceWorker.ready;
      // @ts-ignore - sync is not in TypeScript types yet
      await registration.sync.register(tag);
    }
  }, []);

  return {
    isReady: !!db,
    saveOffline,
    getOfflineData,
    requestSync,
  };
}
