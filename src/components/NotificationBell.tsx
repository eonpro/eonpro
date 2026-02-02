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
import { useNotifications, type Notification, type NotificationCategory } from '@/hooks/useNotifications';
import { useWebSocket, EventType } from '@/hooks/useWebSocket';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';

// ============================================================================
// Category Icons & Colors
// ============================================================================

const categoryConfig: Record<NotificationCategory, { icon: typeof Bell; color: string; bgColor: string }> = {
  PRESCRIPTION: { icon: Pill, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100' },
  SYSTEM: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  APPOINTMENT: { icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100' },
  MESSAGE: { icon: MessageSquare, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  PAYMENT: { icon: CreditCard, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  REFILL: { icon: RefreshCw, color: 'text-pink-600', bgColor: 'bg-pink-100' },
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
  const handleNotificationClick = useCallback(async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
    setIsOpen(false);
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
    }
  }, [markAsRead, router]);

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
        className={`w-full text-left p-3 hover:bg-gray-50 transition-colors border-l-4 ${
          priorityColors[notification.priority]
        } ${!notification.isRead ? 'bg-blue-50/50' : ''}`}
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${config.color}`} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-medium text-gray-900 truncate ${!notification.isRead ? 'font-semibold' : ''}`}>
                {notification.title}
              </p>
              {!notification.isRead && (
                <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-1.5" />
              )}
            </div>
            <p className="text-sm text-gray-600 line-clamp-2 mt-0.5">
              {notification.message}
            </p>
            <div className="flex items-center gap-2 mt-1.5">
              <Clock className="h-3 w-3 text-gray-400" />
              <span className="text-xs text-gray-400">
                {formatTime(notification.createdAt)}
              </span>
              {notification.actionUrl && (
                <>
                  <span className="text-gray-300">•</span>
                  <span className="text-xs text-blue-500 flex items-center gap-0.5">
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
        onClick={() => showDropdown ? setIsOpen(!isOpen) : router.push(notificationsPath)}
        className="relative p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2"
        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        
        {/* Unread Badge */}
        {unreadCount > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1"
            style={{ backgroundColor: primaryColor }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}

        {/* WebSocket connected indicator */}
        {isConnected && (
          <span className="absolute bottom-0.5 right-0.5 w-2 h-2 bg-green-500 rounded-full border border-white" />
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && isOpen && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
              {unreadCount > 0 && (
                <span 
                  className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
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
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => router.push(notificationsPath)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Notification settings"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="h-10 w-10 mb-2 opacity-50" />
                <p className="text-sm">No notifications</p>
                <p className="text-xs mt-1">You're all caught up!</p>
              </div>
            ) : (
              <>
                {notifications.map(renderNotification)}
                
                {/* Load More */}
                {hasMore && (
                  <button
                    onClick={loadMore}
                    disabled={loading}
                    className="w-full py-3 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
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
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
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
