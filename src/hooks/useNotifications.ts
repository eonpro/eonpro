'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { clientLogger } from '@/lib/clientLogger';
import { isBrowser } from '@/lib/utils/ssr-safe';
import { getAuthToken, isServerlessEnvironment } from '@/lib/utils/auth-token';
import { apiGet, apiFetch } from '@/lib/api/fetch';

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
// Constants
// ============================================================================

const DEFAULT_REFRESH_INTERVAL = 60000; // 1 minute
const SERVERLESS_POLLING_INTERVAL = 120000; // 2 minutes on serverless to avoid connection pool exhaustion (P2024)
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// ============================================================================
// Helper: Retry with exponential backoff
// ============================================================================

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS,
  delayMs: number = RETRY_DELAY_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (lastError.name === 'AbortError') throw lastError;
      if (lastError.message.includes('401') || lastError.message.includes('403')) throw lastError;
      if (lastError.message.includes('429')) throw lastError;

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError;
}

// ============================================================================
// Hook
// ============================================================================

export function useNotifications(options: UseNotificationsOptions = {}) {
  const {
    autoFetch = true,
    pageSize = 20,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
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
  const isServerless = useRef<boolean>(false);
  const lastFetchTime = useRef<number>(0);
  const rateLimitedUntilRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);
  const isFetchingCountRef = useRef<boolean>(false);

  // Determine if we're on serverless (no WebSocket) on mount
  useEffect(() => {
    if (isBrowser) {
      isServerless.current = isServerlessEnvironment();
      clientLogger.debug(
        '[Notifications] Environment:',
        isServerless.current ? 'serverless (polling mode)' : 'standard (WebSocket + polling)'
      );
    }
  }, []);

  // Build query string
  const buildQueryString = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('pageSize', pageSize.toString());
      if (category) params.set('category', category);
      if (unreadOnly) params.set('isRead', 'false');
      params.set('isArchived', 'false');
      return params.toString();
    },
    [pageSize, category, unreadOnly]
  );

  const isRateLimited = useCallback(() => {
    return Date.now() < rateLimitedUntilRef.current;
  }, []);

  const handleRateLimitResponse = useCallback((status: number, headers?: Headers) => {
    if (status === 429) {
      const retryAfter = headers?.get('Retry-After');
      const backoffMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
      rateLimitedUntilRef.current = Date.now() + backoffMs;
      clientLogger.warn('[Notifications] Rate limited, backing off for', backoffMs, 'ms');
    }
  }, []);

  // Fetch notifications with retry logic
  const fetchNotifications = useCallback(
    async (page = 1, append = false) => {
      if (!isBrowser) return;
      if (isRateLimited()) return;
      if (isFetchingRef.current && !append) return;

      // Cancel previous request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      const token = getAuthToken();

      if (!token) {
        setState((prev) => ({ ...prev, loading: false, error: 'Not authenticated' }));
        return;
      }

      if (!append) {
        setState((prev) => ({ ...prev, loading: true, error: null }));
      }

      isFetchingRef.current = true;

      try {
        const data = await withRetry(async () => {
          const response = await apiFetch(`/api/notifications?${buildQueryString(page)}`, {
            signal: abortControllerRef.current?.signal,
          });

          if (!response.ok) {
            handleRateLimitResponse(response.status, response.headers);
            throw new Error(`Failed to fetch notifications: ${response.status}`);
          }

          return response.json();
        });

        lastFetchTime.current = Date.now();
        clientLogger.debug('[Notifications] Fetched:', {
          count: data.notifications?.length ?? 0,
          unread: data.unreadCount ?? 0,
          total: data.total ?? 0,
          warning: data._warning,
        });

        setState((prev) => ({
          notifications: append
            ? [...prev.notifications, ...data.notifications]
            : data.notifications,
          unreadCount: data.unreadCount ?? 0,
          total: data.total ?? 0,
          loading: false,
          error: null,
          page: data.page ?? page,
          hasMore: data.hasMore ?? false,
        }));
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        clientLogger.error('Failed to fetch notifications:', error);
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
      } finally {
        isFetchingRef.current = false;
      }
    },
    [buildQueryString, isRateLimited, handleRateLimitResponse]
  );

  // Fetch unread count only (lightweight) - with retry
  const fetchUnreadCount = useCallback(async () => {
    if (!isBrowser) return;
    if (isRateLimited()) return;
    if (isFetchingCountRef.current) return;

    const token = getAuthToken();
    if (!token) return;

    isFetchingCountRef.current = true;

    try {
      const data = await withRetry(async () => {
        const response = await apiGet('/api/notifications/count');

        if (!response.ok) {
          handleRateLimitResponse(response.status, response.headers);
          throw new Error(`Failed to fetch count: ${response.status}`);
        }

        return response.json();
      }, 2);

      setState((prev) => ({ ...prev, unreadCount: data.count ?? 0 }));
    } catch (error) {
      clientLogger.debug('Failed to fetch unread count:', error);
    } finally {
      isFetchingCountRef.current = false;
    }
  }, [isRateLimited, handleRateLimitResponse]);

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
  const markAsRead = useCallback(
    async (notificationId: number) => {
      if (!isBrowser) return;

      const token = getAuthToken();
      if (!token) return;

      // Optimistic update
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          n.id === notificationId ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      }));

      try {
        const response = await apiFetch(`/api/notifications/${notificationId}/read`, {
          method: 'POST',
        });

        if (response.ok) {
          const data = await response.json();
          // Sync with server count
          setState((prev) => ({ ...prev, unreadCount: data.unreadCount ?? prev.unreadCount }));
        }
      } catch (error) {
        clientLogger.error('Failed to mark notification as read:', error);
        // Revert optimistic update on error would require storing previous state
        // For now, just refetch to sync
        fetchUnreadCount();
      }
    },
    [fetchUnreadCount]
  );

  // Mark multiple notifications as read
  const markManyAsRead = useCallback(
    async (notificationIds: number[]) => {
      if (!isBrowser || notificationIds.length === 0) return;

      const token = getAuthToken();
      if (!token) return;

      // Optimistic update
      const idsSet = new Set(notificationIds);
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          idsSet.has(n.id) ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, prev.unreadCount - notificationIds.length),
      }));

      try {
        const response = await apiFetch('/api/notifications', {
          method: 'PUT',
          body: JSON.stringify({ notificationIds }),
        });

        if (response.ok) {
          const data = await response.json();
          setState((prev) => ({ ...prev, unreadCount: data.unreadCount ?? prev.unreadCount }));
        }
      } catch (error) {
        clientLogger.error('Failed to mark notifications as read:', error);
        fetchUnreadCount();
      }
    },
    [fetchUnreadCount]
  );

  // Mark all notifications as read
  const markAllAsRead = useCallback(
    async (filterCategory?: NotificationCategory) => {
      if (!isBrowser) return;

      const token = getAuthToken();
      if (!token) return;

      // Optimistic update
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          !filterCategory || n.category === filterCategory
            ? { ...n, isRead: true, readAt: new Date().toISOString() }
            : n
        ),
        unreadCount: filterCategory
          ? prev.notifications.filter((n) => n.category !== filterCategory && !n.isRead).length
          : 0,
      }));

      try {
        const response = await apiFetch('/api/notifications', {
          method: 'PUT',
          body: JSON.stringify({ markAll: true, category: filterCategory }),
        });

        if (response.ok) {
          const data = await response.json();
          setState((prev) => ({ ...prev, unreadCount: data.unreadCount ?? prev.unreadCount }));
        }
      } catch (error) {
        clientLogger.error('Failed to mark all notifications as read:', error);
        fetchUnreadCount();
      }
    },
    [fetchUnreadCount]
  );

  // Archive notifications
  const archiveNotifications = useCallback(
    async (notificationIds: number[]) => {
      if (!isBrowser || notificationIds.length === 0) return;

      const token = getAuthToken();
      if (!token) return;

      // Get unread count before archiving for optimistic update
      const idsSet = new Set(notificationIds);
      const unreadBeingArchived = state.notifications.filter(
        (n) => idsSet.has(n.id) && !n.isRead
      ).length;

      // Optimistic update
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.filter((n) => !idsSet.has(n.id)),
        total: Math.max(0, prev.total - notificationIds.length),
        unreadCount: Math.max(0, prev.unreadCount - unreadBeingArchived),
      }));

      try {
        const response = await apiFetch('/api/notifications', {
          method: 'DELETE',
          body: JSON.stringify({ notificationIds }),
        });

        if (response.ok) {
          const data = await response.json();
          setState((prev) => ({ ...prev, unreadCount: data.unreadCount ?? prev.unreadCount }));
        }
      } catch (error) {
        clientLogger.error('Failed to archive notifications:', error);
        // Refetch to restore state on error
        fetchNotifications(1, false);
      }
    },
    [state.notifications, fetchNotifications]
  );

  // Add a new notification (for WebSocket integration)
  const addNotification = useCallback((notification: Notification) => {
    setState((prev) => ({
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

  // Refresh interval - faster on serverless since no WebSocket
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const effectiveInterval = isServerless.current
      ? Math.min(refreshInterval, SERVERLESS_POLLING_INTERVAL)
      : refreshInterval;

    clientLogger.debug(
      '[Notifications] Polling interval set to:',
      effectiveInterval,
      'ms',
      isServerless.current ? '(serverless mode)' : ''
    );

    const interval = setInterval(() => {
      if (isRateLimited()) {
        clientLogger.debug('[Notifications] Polling skipped (rate limited)');
        return;
      }

      clientLogger.debug('[Notifications] Polling...');
      fetchUnreadCount();

      if (isServerless.current && Date.now() - lastFetchTime.current > 60000) {
        clientLogger.debug('[Notifications] Full refresh on serverless...');
        fetchNotifications(1, false);
      }
    }, effectiveInterval);

    return () => clearInterval(interval);
  }, [refreshInterval, fetchUnreadCount, fetchNotifications, isRateLimited]);

  // Visibility change detection - refresh when tab becomes visible
  useEffect(() => {
    if (!isBrowser) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isRateLimited()) {
        if (Date.now() - lastFetchTime.current > 5000) {
          fetchUnreadCount();

          if (isServerless.current) {
            fetchNotifications(1, false);
          }
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchUnreadCount, fetchNotifications, isRateLimited]);

  // Focus detection - refresh when window gains focus
  useEffect(() => {
    if (!isBrowser) return;

    const handleFocus = () => {
      if (!isRateLimited() && Date.now() - lastFetchTime.current > 10000) {
        fetchUnreadCount();
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchUnreadCount, isRateLimited]);

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
