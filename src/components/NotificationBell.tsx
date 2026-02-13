'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Pill,
  User,
  Package,
  AlertCircle,
  Calendar,
  MessageSquare,
  CreditCard,
  RefreshCw,
  Clock,
  ChevronRight,
  Settings,
  Loader2,
} from 'lucide-react';
import {
  useNotifications,
  type Notification,
  type NotificationCategory,
} from '@/hooks/useNotifications';
import { useWebSocket, EventType } from '@/hooks/useWebSocket';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// ============================================================================
// Category Icons & Colors
// ============================================================================

const categoryConfig: Record<
  NotificationCategory,
  { icon: typeof Bell; color: string; bgColor: string }
> = {
  PRESCRIPTION: { icon: Pill, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100' },
  SYSTEM: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  APPOINTMENT: { icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  MESSAGE: { icon: MessageSquare, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  PAYMENT: { icon: CreditCard, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  REFILL: { icon: RefreshCw, color: 'text-pink-600', bgColor: 'bg-pink-100' },
  SHIPMENT: { icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-100' },
};

const priorityColors = {
  LOW: 'border-l-gray-300',
  NORMAL: 'border-l-blue-400',
  HIGH: 'border-l-orange-400',
  URGENT: 'border-l-red-500',
};

// ============================================================================
// Props
// ============================================================================

interface NotificationBellProps {
  /** Path to notifications page */
  notificationsPath?: string;
  /** Show dropdown on click (default: true) */
  showDropdown?: boolean;
}

// ============================================================================
// Component
// ============================================================================

export default function NotificationBell({
  notificationsPath = '/notifications',
  showDropdown = true,
}: NotificationBellProps) {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const {
    notifications,
    unreadCount,
    loading,
    hasMore,
    markAsRead,
    markAllAsRead,
    loadMore,
    refresh,
    addNotification,
  } = useNotifications({
    autoFetch: true,
    pageSize: 10,
    refreshInterval: 60000, // 1 minute
  });

  // WebSocket for real-time notifications
  const { subscribe, isConnected } = useWebSocket({
    autoConnect: true,
    events: [EventType.NOTIFICATION_PUSH],
  });

  // Handle real-time notifications
  useEffect(() => {
    const unsubscribe = subscribe(EventType.NOTIFICATION_PUSH, (data: unknown) => {
      const payload = data as { notification?: Notification; broadcast?: boolean };
      if (payload.notification) {
        addNotification(payload.notification);
      } else if (payload.broadcast) {
        // For broadcast notifications, refresh the list
        refresh();
      }
    });

    return () => unsubscribe();
  }, [subscribe, addNotification, refresh]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle notification click
  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      if (!notification.isRead) {
        await markAsRead(notification.id);
      }
      setIsOpen(false);
      if (notification.actionUrl) {
        router.push(notification.actionUrl);
      }
    },
    [markAsRead, router]
  );

  // Format time
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Render notification item
  const renderNotification = (notification: Notification) => {
    const config = categoryConfig[notification.category];
    const Icon = config.icon;

    return (
      <button
        key={notification.id}
        onClick={() => handleNotificationClick(notification)}
        className={`w-full border-l-4 p-3 text-left transition-colors hover:bg-gray-50 ${
          priorityColors[notification.priority]
        } ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div
            className={`h-9 w-9 flex-shrink-0 rounded-lg ${config.bgColor} flex items-center justify-center`}
          >
            <Icon className={`h-4 w-4 ${config.color}`} />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p
                className={`truncate text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}
              >
                {notification.title}
              </p>
              {!notification.isRead && (
                <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{notification.message}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-400">{formatTime(notification.createdAt)}</span>
              {notification.actionUrl && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="flex items-center gap-0.5 text-xs text-blue-500">
                    View details
                    <ChevronRight className="h-3 w-3" />
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => (showDropdown ? setIsOpen(!isOpen) : router.push(notificationsPath))}
        className="relative rounded-xl p-2 text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
        title="Notifications"
      >
        <Bell className="h-5 w-5" />

        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* WebSocket connected indicator */}
        {isConnected && (
          <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white bg-green-500" />
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-96 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span
                  className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => router.push(notificationsPath)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="Notification settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] divide-y divide-gray-100 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="mb-2 h-10 w-10 opacity-50" />
                <p className="text-sm">No notifications</p>
                <p className="mt-1 text-xs">You're all caught up!</p>
              </div>
            ) : (
              <>
                {notifications.map(renderNotification)}

                {/* Load More */}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 py-3 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Load more
                        <ChevronRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push(notificationsPath);
              }}
              className="w-full text-center text-sm font-medium hover:underline"
              style={{ color: primaryColor }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
