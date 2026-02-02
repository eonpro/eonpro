'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useNotifications, type Notification, type NotificationCategory } from '@/hooks/useNotifications';
import { useWebSocket, EventType } from '@/hooks/useWebSocket';
import { getLocalStorageItem, setLocalStorageItem } from '@/lib/utils/ssr-safe';

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
    endTime: string;   // HH:MM
    days: number[];    // 0-6, Sunday = 0
  };
  
  // Category preferences
  mutedCategories: NotificationCategory[];
  
  // Grouping
  groupSimilar: boolean;
  
  // Desktop badge
  showDesktopBadge: boolean;
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
};

const PREFERENCES_STORAGE_KEY = 'notification-preferences';

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
  // Load preferences from storage
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

  // Toast state
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const toastIdRef = useRef(0);

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
  const playNotificationSound = useCallback((priority: string = 'NORMAL') => {
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
  }, [preferences.soundEnabled, preferences.soundVolume, preferences.soundForPriorities, isDndActive]);

  // Show browser notification
  const showBrowserNotification = useCallback((notification: Notification) => {
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
  }, [preferences.browserNotificationsEnabled, isDndActive]);

  // Add toast notification
  const addToast = useCallback((notification: Notification) => {
    if (!preferences.toastEnabled) return;
    if (isDndActive()) return;
    if (preferences.mutedCategories.includes(notification.category)) return;
    
    const toastId = `toast-${++toastIdRef.current}`;
    const toast: ToastNotification = {
      ...notification,
      toastId,
      expiresAt: Date.now() + preferences.toastDuration,
    };
    
    setToasts(prev => [...prev, toast]);
    
    // Auto-dismiss (unless URGENT)
    if (notification.priority !== 'URGENT') {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.toastId !== toastId));
      }, preferences.toastDuration);
    }
  }, [preferences.toastEnabled, preferences.toastDuration, preferences.mutedCategories, isDndActive]);

  // Dismiss toast
  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(t => t.toastId !== toastId));
  }, []);

  // Dismiss all toasts
  const dismissAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  // Pin toast (prevent auto-dismiss)
  const pinToast = useCallback((toastId: string) => {
    setToasts(prev => prev.map(t => 
      t.toastId === toastId ? { ...t, isPinned: true, expiresAt: Infinity } : t
    ));
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
  }, [subscribe, addNotification, addToast, playNotificationSound, showBrowserNotification, refresh, unreadCount, preferences.showDesktopBadge]);

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

  // Update preferences
  const updatePreferences = useCallback((newPrefs: Partial<NotificationPreferences>) => {
    setPreferences(prev => {
      const updated = { ...prev, ...newPrefs };
      setLocalStorageItem(PREFERENCES_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Toggle DND
  const toggleDnd = useCallback(() => {
    updatePreferences({ dndEnabled: !preferences.dndEnabled });
  }, [preferences.dndEnabled, updatePreferences]);

  // Mute/unmute categories
  const muteCategory = useCallback((category: NotificationCategory) => {
    if (!preferences.mutedCategories.includes(category)) {
      updatePreferences({ mutedCategories: [...preferences.mutedCategories, category] });
    }
  }, [preferences.mutedCategories, updatePreferences]);

  const unmuteCategory = useCallback((category: NotificationCategory) => {
    updatePreferences({ 
      mutedCategories: preferences.mutedCategories.filter(c => c !== category) 
    });
  }, [preferences.mutedCategories, updatePreferences]);

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

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export default NotificationProvider;
