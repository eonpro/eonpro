/**
 * Patient Portal Service Worker
 * Provides offline support, push notifications, and background sync
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `patient-portal-${CACHE_VERSION}`;
const OFFLINE_URL = '/patient-portal/offline';

// Assets to cache immediately on install
const PRECACHE_ASSETS = [
  '/patient-portal',
  '/patient-portal/medications',
  '/patient-portal/progress',
  '/patient-portal/offline',
  '/manifest.json',
];

// API routes to cache with network-first strategy
const API_CACHE_ROUTES = [
  '/api/patient-portal/branding',
  '/api/patient-portal/medications',
  '/api/patient-portal/tracking',
];

// Install event - precache essential assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Precaching assets...');
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache failed for some assets:', err);
      });
    })
  );
  
  // Activate immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name.startsWith('patient-portal-') && name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - handle requests with appropriate caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // API requests - network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // Patient portal pages - stale while revalidate
  if (url.pathname.startsWith('/patient-portal')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // Static assets - cache first
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/images/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }
  
  // Default - network first
  event.respondWith(networkFirst(request));
});

// Network first strategy - try network, fall back to cache
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    
    throw error;
  }
}

// Cache first strategy - try cache, fall back to network
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache and network failed:', request.url);
    throw error;
  }
}

// Stale while revalidate - return cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  
  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch(() => {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match(OFFLINE_URL);
    }
    return null;
  });
  
  return cachedResponse || fetchPromise;
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received');
  
  let data = {
    title: 'Patient Portal',
    body: 'You have a new notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    tag: 'default',
    data: {},
  };
  
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/icons/badge-72x72.png',
    tag: data.tag,
    data: data.data,
    vibrate: [100, 50, 100],
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.notification.tag);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/patient-portal';
  
  // Handle action button clicks
  if (event.action) {
    switch (event.action) {
      case 'view':
        // Open specific page
        break;
      case 'dismiss':
        // Just close the notification
        return;
      case 'snooze':
        // Schedule reminder for later
        break;
    }
  }
  
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to focus existing window
      for (const client of clientList) {
        if (client.url.includes('/patient-portal') && 'focus' in client) {
          client.navigate(urlToOpen);
          return client.focus();
        }
      }
      
      // Open new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});

// Background sync for offline data
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-weight-logs') {
    event.waitUntil(syncWeightLogs());
  } else if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  } else if (event.tag === 'sync-progress') {
    event.waitUntil(syncProgressData());
  }
});

// Sync weight logs stored offline
async function syncWeightLogs() {
  try {
    const db = await openIndexedDB();
    const logs = await getOfflineLogs(db, 'weight-logs');
    
    for (const log of logs) {
      try {
        const response = await fetch('/api/patient-portal/weight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(log.data),
        });
        
        if (response.ok) {
          await deleteOfflineLog(db, 'weight-logs', log.id);
        }
      } catch (error) {
        console.log('[SW] Failed to sync log:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Weight sync failed:', error);
  }
}

// Sync offline messages
async function syncMessages() {
  try {
    const db = await openIndexedDB();
    const messages = await getOfflineLogs(db, 'messages');
    
    for (const msg of messages) {
      try {
        const response = await fetch('/api/patient-portal/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(msg.data),
        });
        
        if (response.ok) {
          await deleteOfflineLog(db, 'messages', msg.id);
        }
      } catch (error) {
        console.log('[SW] Failed to sync message:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Message sync failed:', error);
  }
}

// Sync progress data (water, exercise, etc.)
async function syncProgressData() {
  try {
    const db = await openIndexedDB();
    const progress = await getOfflineLogs(db, 'progress');
    
    for (const item of progress) {
      try {
        const response = await fetch('/api/patient-portal/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        });
        
        if (response.ok) {
          await deleteOfflineLog(db, 'progress', item.id);
        }
      } catch (error) {
        console.log('[SW] Failed to sync progress:', error);
      }
    }
  } catch (error) {
    console.error('[SW] Progress sync failed:', error);
  }
}

// IndexedDB helpers for offline storage
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PatientPortalOffline', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('weight-logs')) {
        db.createObjectStore('weight-logs', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('messages')) {
        db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getOfflineLogs(db, storeName) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function deleteOfflineLog(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(id);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Periodic background sync for fresh data
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'refresh-medications') {
    event.waitUntil(refreshMedications());
  } else if (event.tag === 'refresh-shipments') {
    event.waitUntil(refreshShipments());
  }
});

async function refreshMedications() {
  try {
    const response = await fetch('/api/patient-portal/medications');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('/api/patient-portal/medications', response);
    }
  } catch (error) {
    console.log('[SW] Background medication refresh failed');
  }
}

async function refreshShipments() {
  try {
    const response = await fetch('/api/patient-portal/tracking');
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put('/api/patient-portal/tracking', response);
    }
  } catch (error) {
    console.log('[SW] Background shipment refresh failed');
  }
}

console.log('[SW] Service worker loaded');
