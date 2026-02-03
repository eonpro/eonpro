'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { isBrowser, getLocalStorageItem } from '@/lib/utils/ssr-safe';

// ============================================================================
// Types
// ============================================================================

export interface Notification {
  id: number;
  createdAt: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  title: string;
  message: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: string;
}

export type NotificationCategory = 
  | 'PRESCRIPTION' 
  | 'PATIENT' 
  | 'ORDER' 
  | 'SYSTEM' 
  | 'APPOINTMENT' 
  | 'MESSAGE' 
  | 'PAYMENT' 
  | 'REFILL'
  | 'SHIPMENT';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  loading: boolean;
  error: string | null;
  page: number;
  hasMore: boolean;
}

export interface UseNotificationsOptions {
  /** Auto-fetch on mount (default: true) */
  autoFetch?: boolean;
  /** Items per page (default: 20) */
  pageSize?: number;
  /** Auto-refresh interval in ms (default: 60000 = 1 minute, 0 to disable) */
  refreshInterval?: number;
  /** Filter by category */
  category?: NotificationCategory;
  /** Show only unread */
  unreadOnly?: boolean;
}

// ============================================================================
// Hook
// ============================================================================

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    autoFetch = true,
    pageSize = 20,
    refreshInterval = 60000,
    category,
    unreadOnly = false,
  } = options;

  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    total: 0,
    loading: true,
    error: null,
    page: 1,
    hasMore: false,
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Build query string
  const buildQueryString = useCallback((page: number) => {
    const params = new URLSearchParams();
    params.set('page', page.toString());
    params.set('pageSize', pageSize.toString());
    if (category) params.set('category', category);
    if (unreadOnly) params.set('isRead', 'false');
    params.set('isArchived', 'false');
    return params.toString();
  }, [pageSize, category, unreadOnly]);

  // Fetch notifications
  const fetchNotifications = useCallback(async (page = 1, append = false) => {
    if (!isBrowser) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) {
      setState(prev => ({ ...prev, loading: false, error: 'Not authenticated' }));
      return;
    }

    if (!append) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const response = await fetch(
        `/api/notifications?${buildQueryString(page)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch notifications');
      }

      const data = await response.json();

      setState(prev => ({
        notifications: append 
          ? [...prev.notifications, ...data.notifications]
          : data.notifications,
        unreadCount: data.unreadCount,
        total: data.total,
        loading: false,
        error: null,
        page: data.page,
        hasMore: data.hasMore,
      }));
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Request was cancelled
      }
      console.error('Failed to fetch notifications:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, [buildQueryString]);

  // Fetch unread count only (lightweight)
  const fetchUnreadCount = useCallback(async () => {
    if (!isBrowser) return;

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) return;

    try {
      const response = await fetch('/api/notifications/count', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setState(prev => ({ ...prev, unreadCount: data.count }));
      }
    } catch (error) {
      console.error('Failed to fetch unread count:', error);
    }
  }, []);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (state.hasMore && !state.loading) {
      fetchNotifications(state.page + 1, true);
    }
  }, [state.hasMore, state.loading, state.page, fetchNotifications]);

  // Refresh notifications
  const refresh = useCallback(() => {
    fetchNotifications(1, false);
  }, [fetchNotifications]);

  // Mark single notification as read
  const markAsRead = useCallback(async (notificationId: number) => {
    if (!isBrowser) return;

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) return;

    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update local state
        setState(prev => ({
          ...prev,
          notifications: prev.notifications.map(n =>
            n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
          ),
          unreadCount: data.unreadCount,
        }));
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }, []);

  // Mark multiple notifications as read
  const markManyAsRead = useCallback(async (notificationIds: number[]) => {
    if (!isBrowser || notificationIds.length === 0) return;

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) return;

    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update local state
        const idsSet = new Set(notificationIds);
        setState(prev => ({
          ...prev,
          notifications: prev.notifications.map(n =>
            idsSet.has(n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
          ),
          unreadCount: data.unreadCount,
        }));
      }
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  }, []);

  // Mark all notifications as read
  const markAllAsRead = useCallback(async (filterCategory?: NotificationCategory) => {
    if (!isBrowser) return;

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) return;

    try {
      const response = await fetch('/api/notifications', {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markAll: true, category: filterCategory }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Update local state
        setState(prev => ({
          ...prev,
          notifications: prev.notifications.map(n =>
            (!filterCategory || n.category === filterCategory) 
              ? { ...n, isRead: true, readAt: new Date().toISOString() } 
              : n
          ),
          unreadCount: data.unreadCount,
        }));
      }
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  }, []);

  // Archive notifications
  const archiveNotifications = useCallback(async (notificationIds: number[]) => {
    if (!isBrowser || notificationIds.length === 0) return;

    const token = getLocalStorageItem('auth-token') || 
                  getLocalStorageItem('provider-token') ||
                  getLocalStorageItem('admin-token');

    if (!token) return;

    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationIds }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Remove from local state
        const idsSet = new Set(notificationIds);
        setState(prev => ({
          ...prev,
          notifications: prev.notifications.filter(n => !idsSet.has(n.id)),
          total: prev.total - data.archivedCount,
          unreadCount: data.unreadCount,
        }));
      }
    } catch (error) {
      console.error('Failed to archive notifications:', error);
    }
  }, []);

  // Add a new notification (for WebSocket integration)
  const addNotification = useCallback((notification: Notification) => {
    setState(prev => ({
      ...prev,
      notifications: [notification, ...prev.notifications],
      total: prev.total + 1,
      unreadCount: notification.isRead ? prev.unreadCount : prev.unreadCount + 1,
    }));
  }, []);

  // Initial fetch
  useEffect(() => {
    if (autoFetch) {
      fetchNotifications(1);
    }
  }, [autoFetch, fetchNotifications]);

  // Refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const interval = setInterval(fetchUnreadCount, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, fetchUnreadCount]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    ...state,
    fetchNotifications,
    fetchUnreadCount,
    loadMore,
    refresh,
    markAsRead,
    markManyAsRead,
    markAllAsRead,
    archiveNotifications,
    addNotification,
  };
}

export default useNotifications;
