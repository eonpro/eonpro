'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  useNotifications,
  type Notification,
  type NotificationCategory,
} from '@/hooks/useNotifications';
import { useWebSocket, EventType } from '@/hooks/useWebSocket';
import { getLocalStorageItem, setLocalStorageItem, isBrowser } from '@/lib/utils/ssr-safe';
import { useDebouncedCallback } from 'use-debounce';
import { apiGet, apiFetch } from '@/lib/api/fetch';

// ============================================================================
// Types
// ============================================================================

export interface NotificationPreferences {
  // Sound settings
  soundEnabled: boolean;
  soundVolume: number; // 0-100
  soundForPriorities: ('LOW' | 'NORMAL' | 'HIGH' | 'URGENT')[];

  // Visual settings
  toastEnabled: boolean;
  toastDuration: number; // ms
  toastPosition: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

  // Browser notifications
  browserNotificationsEnabled: boolean;

  // Do Not Disturb
  dndEnabled: boolean;
  dndSchedule: {
    enabled: boolean;
    startTime: string; // HH:MM
    endTime: string; // HH:MM
    days: number[]; // 0-6, Sunday = 0
  };

  // Category preferences
  mutedCategories: NotificationCategory[];

  // Grouping
  groupSimilar: boolean;

  // Desktop badge
  showDesktopBadge: boolean;

  // Email preferences (synced to database)
  emailNotificationsEnabled?: boolean;
  emailDigestEnabled?: boolean;
  emailDigestFrequency?: 'daily' | 'weekly' | 'never';
}

export interface ToastNotification extends Notification {
  toastId: string;
  expiresAt: number;
  isPinned?: boolean;
}

export interface NotificationContextValue {
  // State
  notifications: Notification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  hasMore: boolean;
  toasts: ToastNotification[];
  preferences: NotificationPreferences;
  isConnected: boolean;
  isDndActive: boolean;

  // Actions
  markAsRead: (id: number) => Promise<void>;
  markManyAsRead: (ids: number[]) => Promise<void>;
  markAllAsRead: (category?: NotificationCategory) => Promise<void>;
  archiveNotifications: (ids: number[]) => Promise<void>;
  loadMore: () => void;
  refresh: () => void;

  // Toast actions
  dismissToast: (toastId: string) => void;
  dismissAllToasts: () => void;
  pinToast: (toastId: string) => void;

  // Preferences
  updatePreferences: (prefs: Partial<NotificationPreferences>) => void;
  toggleDnd: () => void;
  muteCategory: (category: NotificationCategory) => void;
  unmuteCategory: (category: NotificationCategory) => void;

  // Utilities
  playNotificationSound: (priority?: string) => void;
  requestBrowserPermission: () => Promise<boolean>;
}

// ============================================================================
// Defaults
// ============================================================================

const defaultPreferences: NotificationPreferences = {
  soundEnabled: true,
  soundVolume: 50,
  soundForPriorities: ['HIGH', 'URGENT'],
  toastEnabled: true,
  toastDuration: 5000,
  toastPosition: 'top-right',
  browserNotificationsEnabled: false,
  dndEnabled: false,
  dndSchedule: {
    enabled: false,
    startTime: '22:00',
    endTime: '08:00',
    days: [0, 1, 2, 3, 4, 5, 6],
  },
  mutedCategories: [],
  groupSimilar: true,
  showDesktopBadge: true,
  emailNotificationsEnabled: true,
  emailDigestEnabled: false,
  emailDigestFrequency: 'weekly',
};

const PREFERENCES_STORAGE_KEY = 'notification-preferences';

/**
 * Convert API preferences to NotificationPreferences format
 */
function apiPrefsToLocal(apiPrefs: Record<string, unknown>): Partial<NotificationPreferences> {
  return {
    soundEnabled: apiPrefs.soundEnabled as boolean | undefined,
    soundVolume: apiPrefs.soundVolume as number | undefined,
    soundForPriorities: apiPrefs.soundForPriorities as
      | ('LOW' | 'NORMAL' | 'HIGH' | 'URGENT')[]
      | undefined,
    toastEnabled: apiPrefs.toastEnabled as boolean | undefined,
    toastDuration: apiPrefs.toastDuration as number | undefined,
    toastPosition: apiPrefs.toastPosition as
      | 'top-right'
      | 'top-left'
      | 'bottom-right'
      | 'bottom-left'
      | undefined,
    browserNotificationsEnabled: apiPrefs.browserNotificationsEnabled as boolean | undefined,
    dndEnabled: apiPrefs.dndEnabled as boolean | undefined,
    dndSchedule: {
      enabled: (apiPrefs.dndScheduleEnabled as boolean) ?? false,
      startTime: (apiPrefs.dndStartTime as string) ?? '22:00',
      endTime: (apiPrefs.dndEndTime as string) ?? '08:00',
      days: (apiPrefs.dndDays as number[]) ?? [0, 1, 2, 3, 4, 5, 6],
    },
    mutedCategories: apiPrefs.mutedCategories as NotificationCategory[] | undefined,
    groupSimilar: apiPrefs.groupSimilar as boolean | undefined,
    showDesktopBadge: apiPrefs.showDesktopBadge as boolean | undefined,
    emailNotificationsEnabled: apiPrefs.emailNotificationsEnabled as boolean | undefined,
    emailDigestEnabled: apiPrefs.emailDigestEnabled as boolean | undefined,
    emailDigestFrequency: apiPrefs.emailDigestFrequency as 'daily' | 'weekly' | 'never' | undefined,
  };
}

/**
 * Convert NotificationPreferences to API format
 */
function localPrefsToApi(prefs: Partial<NotificationPreferences>): Record<string, unknown> {
  const apiPrefs: Record<string, unknown> = {};

  if (prefs.soundEnabled !== undefined) apiPrefs.soundEnabled = prefs.soundEnabled;
  if (prefs.soundVolume !== undefined) apiPrefs.soundVolume = prefs.soundVolume;
  if (prefs.soundForPriorities !== undefined)
    apiPrefs.soundForPriorities = prefs.soundForPriorities;
  if (prefs.toastEnabled !== undefined) apiPrefs.toastEnabled = prefs.toastEnabled;
  if (prefs.toastDuration !== undefined) apiPrefs.toastDuration = prefs.toastDuration;
  if (prefs.toastPosition !== undefined) apiPrefs.toastPosition = prefs.toastPosition;
  if (prefs.browserNotificationsEnabled !== undefined)
    apiPrefs.browserNotificationsEnabled = prefs.browserNotificationsEnabled;
  if (prefs.dndEnabled !== undefined) apiPrefs.dndEnabled = prefs.dndEnabled;
  if (prefs.dndSchedule !== undefined) {
    apiPrefs.dndScheduleEnabled = prefs.dndSchedule.enabled;
    apiPrefs.dndStartTime = prefs.dndSchedule.startTime;
    apiPrefs.dndEndTime = prefs.dndSchedule.endTime;
    apiPrefs.dndDays = prefs.dndSchedule.days;
  }
  if (prefs.mutedCategories !== undefined) apiPrefs.mutedCategories = prefs.mutedCategories;
  if (prefs.groupSimilar !== undefined) apiPrefs.groupSimilar = prefs.groupSimilar;
  if (prefs.showDesktopBadge !== undefined) apiPrefs.showDesktopBadge = prefs.showDesktopBadge;
  if (prefs.emailNotificationsEnabled !== undefined)
    apiPrefs.emailNotificationsEnabled = prefs.emailNotificationsEnabled;
  if (prefs.emailDigestEnabled !== undefined)
    apiPrefs.emailDigestEnabled = prefs.emailDigestEnabled;
  if (prefs.emailDigestFrequency !== undefined)
    apiPrefs.emailDigestFrequency = prefs.emailDigestFrequency;

  return apiPrefs;
}

// ============================================================================
// Context
// ============================================================================

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationContext must be used within NotificationProvider');
  }
  return context;
}

// ============================================================================
// Provider
// ============================================================================

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  // Load preferences from local storage first (for immediate UI)
  const [preferences, setPreferences] = useState<NotificationPreferences>(() => {
    if (typeof window === 'undefined') return defaultPreferences;
    const stored = getLocalStorageItem(PREFERENCES_STORAGE_KEY);
    if (stored) {
      try {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      } catch {
        return defaultPreferences;
      }
    }
    return defaultPreferences;
  });

  // Track if we've synced with the server
  const hasSyncedRef = useRef(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Toast state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const toastIdRef = useRef(0);

  // Fetch preferences from API on mount (if authenticated)
  useEffect(() => {
    if (!isBrowser || hasSyncedRef.current) return;

    const fetchPreferences = async () => {
      // Check if user is authenticated - use centralized utility
      const { getAuthToken } = await import('@/lib/utils/auth-token');
      const token = getAuthToken();

      if (!token) return;

      try {
        const response = await apiGet('/api/notifications/preferences');

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.preferences) {
            const apiPrefs = apiPrefsToLocal(data.preferences);
            setPreferences((prev) => {
              const merged = { ...prev, ...apiPrefs };
              // Also update localStorage
              setLocalStorageItem(PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
              return merged;
            });
            hasSyncedRef.current = true;
          }
        }
      } catch (error) {
        console.error('Failed to fetch notification preferences:', error);
      }
    };

    fetchPreferences();
  }, []);

  // Debounced API sync function
  const syncToApi = useDebouncedCallback(async (prefsToSync: Partial<NotificationPreferences>) => {
    const { getAuthToken } = await import('@/lib/utils/auth-token');
    const token = getAuthToken();

    if (!token) return;

    setIsSyncing(true);
    try {
      const apiPrefs = localPrefsToApi(prefsToSync);
      await apiFetch('/api/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify(apiPrefs),
      });
    } catch (error) {
      console.error('Failed to sync notification preferences:', error);
    } finally {
      setIsSyncing(false);
    }
  }, 1000); // 1 second debounce

  // Audio ref
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Notifications hook
  const {
    notifications,
    unreadCount,
    total,
    loading,
    hasMore,
    markAsRead,
    markManyAsRead,
    markAllAsRead,
    archiveNotifications,
    loadMore,
    refresh,
    addNotification,
  } = useNotifications({
    autoFetch: true,
    pageSize: 25,
    refreshInterval: 60000,
  });

  // WebSocket hook
  const { isConnected, subscribe } = useWebSocket({
    autoConnect: true,
    events: [EventType.NOTIFICATION_PUSH],
  });

  // Check if DND is currently active
  const isDndActive = useCallback(() => {
    if (!preferences.dndEnabled) return false;

    if (preferences.dndSchedule.enabled) {
      const now = new Date();
      const currentDay = now.getDay();

      if (!preferences.dndSchedule.days.includes(currentDay)) return false;

      const currentTime = now.getHours() * 60 + now.getMinutes();
      const [startH, startM] = preferences.dndSchedule.startTime.split(':').map(Number);
      const [endH, endM] = preferences.dndSchedule.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      if (startMinutes <= endMinutes) {
        return currentTime >= startMinutes && currentTime <= endMinutes;
      } else {
        // Overnight schedule (e.g., 22:00 - 08:00)
        return currentTime >= startMinutes || currentTime <= endMinutes;
      }
    }

    return true; // Manual DND is on
  }, [preferences.dndEnabled, preferences.dndSchedule]);

  // Play notification sound
  const playNotificationSound = useCallback(
    (priority: string = 'NORMAL') => {
      if (!preferences.soundEnabled) return;
      if (isDndActive()) return;
      if (!preferences.soundForPriorities.includes(priority as any)) return;

      try {
        if (!audioRef.current) {
          audioRef.current = new Audio('/sounds/notification.mp3');
        }
        audioRef.current.volume = preferences.soundVolume / 100;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {
          // Autoplay may be blocked
        });
      } catch (error) {
        console.warn('Failed to play notification sound:', error);
      }
    },
    [preferences.soundEnabled, preferences.soundVolume, preferences.soundForPriorities, isDndActive]
  );

  // Show browser notification
  const showBrowserNotification = useCallback(
    (notification: Notification) => {
      if (!preferences.browserNotificationsEnabled) return;
      if (isDndActive()) return;
      if (typeof window === 'undefined' || !('Notification' in window)) return;
      if (Notification.permission !== 'granted') return;

      try {
        const browserNotif = new Notification(notification.title, {
          body: notification.message,
          icon: '/icons/notification-icon.png',
          badge: '/icons/badge-icon.png',
          tag: `notification-${notification.id}`,
          requireInteraction: notification.priority === 'URGENT',
        });

        browserNotif.onclick = () => {
          window.focus();
          if (notification.actionUrl) {
            window.location.href = notification.actionUrl;
          }
          browserNotif.close();
        };
      } catch (error) {
        console.warn('Failed to show browser notification:', error);
      }
    },
    [preferences.browserNotificationsEnabled, isDndActive]
  );

  // Add toast notification
  const addToast = useCallback(
    (notification: Notification) => {
      if (!preferences.toastEnabled) return;
      if (isDndActive()) return;
      if (preferences.mutedCategories.includes(notification.category)) return;

      const toastId = `toast-${++toastIdRef.current}`;
      const toast: ToastNotification = {
        ...notification,
        toastId,
        expiresAt: Date.now() + preferences.toastDuration,
      };

      setToasts((prev) => [...prev, toast]);

      // Auto-dismiss (unless URGENT)
      if (notification.priority !== 'URGENT') {
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
        }, preferences.toastDuration);
      }
    },
    [preferences.toastEnabled, preferences.toastDuration, preferences.mutedCategories, isDndActive]
  );

  // Dismiss toast
  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.toastId !== toastId));
  }, []);

  // Dismiss all toasts
  const dismissAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Pin toast (prevent auto-dismiss)
  const pinToast = useCallback((toastId: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.toastId === toastId ? { ...t, isPinned: true, expiresAt: Infinity } : t))
    );
  }, []);

  // Handle incoming WebSocket notifications
  useEffect(() => {
    const unsubscribe = subscribe(EventType.NOTIFICATION_PUSH, (data: unknown) => {
      const payload = data as { notification?: Notification; broadcast?: boolean };

      if (payload.notification) {
        // Add to list
        addNotification(payload.notification);

        // Show toast
        addToast(payload.notification);

        // Play sound
        playNotificationSound(payload.notification.priority);

        // Browser notification
        showBrowserNotification(payload.notification);

        // Update document title badge
        if (preferences.showDesktopBadge) {
          updateDocumentTitle(unreadCount + 1);
        }
      } else if (payload.broadcast) {
        refresh();
      }
    });

    return () => unsubscribe();
  }, [
    subscribe,
    addNotification,
    addToast,
    playNotificationSound,
    showBrowserNotification,
    refresh,
    unreadCount,
    preferences.showDesktopBadge,
  ]);

  // Update document title with unread count
  const updateDocumentTitle = useCallback((count: number) => {
    if (typeof document === 'undefined') return;

    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  }, []);

  // Update document title when unread count changes
  useEffect(() => {
    if (preferences.showDesktopBadge) {
      updateDocumentTitle(unreadCount);
    }
  }, [unreadCount, preferences.showDesktopBadge, updateDocumentTitle]);

  // Update preferences (local + API sync)
  const updatePreferences = useCallback(
    (newPrefs: Partial<NotificationPreferences>) => {
      setPreferences((prev) => {
        const updated = { ...prev, ...newPrefs };
        // Update localStorage immediately
        setLocalStorageItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
        // Sync to API (debounced)
        syncToApi(newPrefs);
        return updated;
      });
    },
    [syncToApi]
  );

  // Toggle DND
  const toggleDnd = useCallback(() => {
    updatePreferences({ dndEnabled: !preferences.dndEnabled });
  }, [preferences.dndEnabled, updatePreferences]);

  // Mute/unmute categories
  const muteCategory = useCallback(
    (category: NotificationCategory) => {
      if (!preferences.mutedCategories.includes(category)) {
        updatePreferences({ mutedCategories: [...preferences.mutedCategories, category] });
      }
    },
    [preferences.mutedCategories, updatePreferences]
  );

  const unmuteCategory = useCallback(
    (category: NotificationCategory) => {
      updatePreferences({
        mutedCategories: preferences.mutedCategories.filter((c) => c !== category),
      });
    },
    [preferences.mutedCategories, updatePreferences]
  );

  // Request browser notification permission
  const requestBrowserPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }

    if (Notification.permission === 'granted') {
      updatePreferences({ browserNotificationsEnabled: true });
      return true;
    }

    if (Notification.permission === 'denied') {
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      updatePreferences({ browserNotificationsEnabled: true });
      return true;
    }

    return false;
  }, [updatePreferences]);

  // Context value
  const value: NotificationContextValue = {
    notifications,
    unreadCount,
    total,
    loading,
    hasMore,
    toasts,
    preferences,
    isConnected,
    isDndActive: isDndActive(),

    markAsRead,
    markManyAsRead,
    markAllAsRead,
    archiveNotifications,
    loadMore,
    refresh,

    dismissToast,
    dismissAllToasts,
    pinToast,

    updatePreferences,
    toggleDnd,
    muteCategory,
    unmuteCategory,

    playNotificationSound,
    requestBrowserPermission,
  };

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export default NotificationProvider;
