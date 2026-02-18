'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  X,
  Check,
  CheckCheck,
  Trash2,
  Filter,
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
  Loader2,
  Settings,
  Volume2,
  VolumeX,
  Moon,
  Sun,
  Wifi,
  WifiOff,
  ChevronDown,
  BellOff,
  Inbox,
  Archive,
  Star,
  MoreHorizontal,
} from 'lucide-react';
import { useNotificationContext } from './NotificationProvider';
import type { Notification, NotificationCategory } from '@/hooks/useNotifications';
import { useClinicBranding } from '@/lib/contexts/ClinicBrandingContext';
import { normalizedIncludes } from '@/lib/utils/search';

// ============================================================================
// Category Configuration
// ============================================================================

const categoryConfig: Record<
  NotificationCategory,
  { icon: typeof Bell; color: string; bgColor: string; label: string }
> = {
  PRESCRIPTION: {
    icon: Pill,
    color: 'text-[var(--brand-primary)]',
    bgColor: 'bg-[var(--brand-primary-light)]',
    label: 'Prescriptions',
  },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Patients' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Orders' },
  SYSTEM: {
    icon: AlertCircle,
    color: 'text-orange-600',
    bgColor: 'bg-orange-100',
    label: 'System',
  },
  APPOINTMENT: {
    icon: Calendar,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-100',
    label: 'Appointments',
  },
  MESSAGE: {
    icon: MessageSquare,
    color: 'text-[var(--brand-secondary)]',
    bgColor: 'bg-[var(--brand-secondary-light)]',
    label: 'Messages',
  },
  PAYMENT: {
    icon: CreditCard,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-100',
    label: 'Payments',
  },
  REFILL: { icon: RefreshCw, color: 'text-pink-600', bgColor: 'bg-pink-100', label: 'Refills' },
  SHIPMENT: { icon: Package, color: 'text-amber-600', bgColor: 'bg-amber-100', label: 'Shipments' },
};

const priorityColors = {
  LOW: 'border-l-gray-300',
  NORMAL: 'border-l-blue-400',
  HIGH: 'border-l-orange-400',
  URGENT: 'border-l-red-500',
};

const categories: NotificationCategory[] = [
  'PRESCRIPTION',
  'PATIENT',
  'ORDER',
  'SYSTEM',
  'APPOINTMENT',
  'MESSAGE',
  'PAYMENT',
  'REFILL',
  'SHIPMENT',
];

// ============================================================================
// Props
// ============================================================================

interface NotificationCenterProps {
  /** Path to full notifications page */
  notificationsPath?: string;
  /** Render mode: 'dropdown' or 'panel' */
  mode?: 'dropdown' | 'panel';
  /** Dropdown position: 'left' or 'right' */
  dropdownPosition?: 'left' | 'right';
}

// ============================================================================
// Time Formatting
// ============================================================================

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ============================================================================
// Notification Item Component
// ============================================================================

interface NotificationItemProps {
  notification: Notification;
  onRead: () => void;
  onArchive: () => void;
  onClick: () => void;
  compact?: boolean;
}

function NotificationItem({
  notification,
  onRead,
  onArchive,
  onClick,
  compact,
}: NotificationItemProps) {
  const config = categoryConfig[notification.category];
  const Icon = config.icon;
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      className={`group relative cursor-pointer border-l-4 transition-colors ${
        priorityColors[notification.priority]
      } ${!notification.isRead ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}
    >
      <button onClick={onClick} className={`w-full text-left ${compact ? 'p-3' : 'p-4'}`}>
        <div className="flex gap-3">
          {/* Icon */}
          <div
            className={`flex-shrink-0 ${compact ? 'h-8 w-8' : 'h-10 w-10'} rounded-xl ${config.bgColor} flex items-center justify-center`}
          >
            <Icon className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} ${config.color}`} />
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <p
                  className={`truncate text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}
                >
                  {notification.title}
                </p>
                {notification.priority === 'URGENT' && (
                  <span className="flex-shrink-0 rounded bg-red-500 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                    Urgent
                  </span>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1.5">
                {!notification.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                <span className="text-xs text-gray-400">{formatTime(notification.createdAt)}</span>
              </div>
            </div>
            <p
              className={`text-sm text-gray-600 ${compact ? 'line-clamp-1' : 'line-clamp-2'} mt-0.5`}
            >
              {notification.message}
            </p>
            {notification.actionUrl && !compact && (
              <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs text-blue-500">
                View details
                <ChevronRight className="h-3 w-3" />
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Hover Actions */}
      <AnimatePresence>
        {showActions && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-lg border border-gray-100 bg-white p-1 shadow-lg"
          >
            {!notification.isRead && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRead();
                }}
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-green-50 hover:text-green-600"
                title="Mark as read"
              >
                <Check className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive();
              }}
              className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
              title="Archive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function NotificationCenter({
  notificationsPath = '/notifications',
  mode = 'dropdown',
  dropdownPosition = 'right',
}: NotificationCenterProps) {
  const router = useRouter();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  const {
    notifications,
    unreadCount,
    total,
    loading,
    hasMore,
    isConnected,
    isDndActive,
    preferences,
    markAsRead,
    markAllAsRead,
    archiveNotifications,
    loadMore,
    refresh,
    toggleDnd,
    updatePreferences,
    muteCategory,
    unmuteCategory,
  } = useNotificationContext();

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'unread'>('all');
  const [filterCategory, setFilterCategory] = useState<NotificationCategory | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    let result = notifications;

    if (activeTab === 'unread') {
      result = result.filter((n) => !n.isRead);
    }

    if (filterCategory) {
      result = result.filter((n) => n.category === filterCategory);
    }

    if (searchQuery) {
      result = result.filter(
        (n) => normalizedIncludes(n.title, searchQuery) || normalizedIncludes(n.message, searchQuery)
      );
    }

    return result;
  }, [notifications, activeTab, filterCategory, searchQuery]);

  // Group notifications by date
  const groupedNotifications = useMemo(() => {
    if (!preferences.groupSimilar) return { today: filteredNotifications, earlier: [] };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayNotifs: Notification[] = [];
    const yesterdayNotifs: Notification[] = [];
    const earlierNotifs: Notification[] = [];

    filteredNotifications.forEach((n) => {
      const date = new Date(n.createdAt);
      if (date >= today) {
        todayNotifs.push(n);
      } else if (date >= yesterday) {
        yesterdayNotifs.push(n);
      } else {
        earlierNotifs.push(n);
      }
    });

    return { today: todayNotifs, yesterday: yesterdayNotifs, earlier: earlierNotifs };
  }, [filteredNotifications, preferences.groupSimilar]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowSettings(false);
        setShowFilters(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + Shift + N to toggle notifications
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }

      // R to refresh when open
      if (e.key === 'r' && isOpen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        refresh();
      }

      // M to mark all as read when open
      if (e.key === 'm' && isOpen && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        markAllAsRead();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, refresh, markAllAsRead]);

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

  // Render notification group
  const renderNotificationGroup = (title: string, notifs: Notification[]) => {
    if (notifs.length === 0) return null;

    return (
      <div key={title}>
        <div className="border-y border-gray-100 bg-gray-50 px-4 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
            {title}
          </span>
        </div>
        <div className="divide-y divide-gray-100">
          {notifs.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onRead={() => markAsRead(notification.id)}
              onArchive={() => archiveNotifications([notification.id])}
              onClick={() => handleNotificationClick(notification)}
              compact={mode === 'dropdown'}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative rounded-xl p-2 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${
          isOpen ? 'bg-gray-100' : 'hover:bg-gray-100'
        } ${isDndActive ? 'text-gray-400' : 'text-gray-600 hover:text-gray-800'}`}
        style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
        title={`Notifications${isDndActive ? ' (DND active)' : ''} (⌘⇧N)`}
      >
        {isDndActive ? <BellOff className="h-5 w-5" /> : <Bell className="h-5 w-5" />}

        {/* Unread Badge */}
        {unreadCount > 0 && !isDndActive && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ backgroundColor: primaryColor }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </motion.span>
        )}

        {/* Connection Status */}
        <span
          className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white ${
            isConnected ? 'bg-green-500' : 'bg-gray-400'
          }`}
          title={isConnected ? 'Connected' : 'Disconnected'}
        />
      </button>

      {/* Dropdown Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className={`absolute z-[100] mt-2 w-[420px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl ${
              dropdownPosition === 'left' ? 'left-0' : 'right-0'
            }`}
            style={{
              maxHeight: 'calc(100vh - 120px)',
            }}
          >
            {/* Header */}
            <div className="border-b border-gray-100 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Connection indicator */}
                  <div
                    className={`flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${
                      isConnected ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                    {isConnected ? 'Live' : 'Offline'}
                  </div>

                  {/* DND Toggle */}
                  <button
                    onClick={toggleDnd}
                    className={`rounded-lg p-1.5 transition-colors ${
                      isDndActive
                        ? 'bg-orange-50 text-orange-600'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    title={isDndActive ? 'Turn off Do Not Disturb' : 'Turn on Do Not Disturb'}
                  >
                    {isDndActive ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                  </button>

                  {/* Settings */}
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`rounded-lg p-1.5 transition-colors ${
                      showSettings
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                    title="Settings"
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

              {/* Search & Filters */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search... (⌘K)"
                    className="w-full rounded-xl border border-gray-200 py-2 pl-3 pr-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                  />
                </div>

                {/* Category Filter */}
                <div className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition-colors ${
                      filterCategory
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3" />
                  </button>

                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-xl border border-gray-100 bg-white py-1 shadow-lg"
                    >
                      <button
                        onClick={() => {
                          setFilterCategory(null);
                          setShowFilters(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${!filterCategory ? 'font-medium text-blue-600' : 'text-gray-700'}`}
                      >
                        All categories
                      </button>
                      <div className="my-1 h-px bg-gray-100" />
                      {categories.map((cat) => {
                        const config = categoryConfig[cat];
                        const Icon = config.icon;
                        const isMuted = preferences.mutedCategories.includes(cat);
                        return (
                          <div key={cat} className="flex items-center px-1">
                            <button
                              onClick={() => {
                                setFilterCategory(cat);
                                setShowFilters(false);
                              }}
                              className={`flex flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-gray-50 ${
                                filterCategory === cat
                                  ? 'font-medium text-blue-600'
                                  : 'text-gray-700'
                              } ${isMuted ? 'opacity-50' : ''}`}
                            >
                              <Icon className={`h-4 w-4 ${config.color}`} />
                              {config.label}
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                isMuted ? unmuteCategory(cat) : muteCategory(cat);
                              }}
                              className={`rounded p-1 hover:bg-gray-100 ${isMuted ? 'text-orange-500' : 'text-gray-400'}`}
                              title={isMuted ? 'Unmute' : 'Mute'}
                            >
                              {isMuted ? (
                                <VolumeX className="h-3 w-3" />
                              ) : (
                                <Volume2 className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="mt-3 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === 'all'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Inbox className="h-4 w-4" />
                  All
                </button>
                <button
                  onClick={() => setActiveTab('unread')}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === 'unread'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Bell className="h-4 w-4" />
                  Unread
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-blue-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Settings Panel */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-b border-gray-100 bg-gray-50"
                >
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Sound notifications</span>
                      <button
                        onClick={() =>
                          updatePreferences({ soundEnabled: !preferences.soundEnabled })
                        }
                        className={`relative h-6 w-10 rounded-full transition-colors ${
                          preferences.soundEnabled ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            preferences.soundEnabled ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Toast notifications</span>
                      <button
                        onClick={() =>
                          updatePreferences({ toastEnabled: !preferences.toastEnabled })
                        }
                        className={`relative h-6 w-10 rounded-full transition-colors ${
                          preferences.toastEnabled ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            preferences.toastEnabled ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">Group by date</span>
                      <button
                        onClick={() =>
                          updatePreferences({ groupSimilar: !preferences.groupSimilar })
                        }
                        className={`relative h-6 w-10 rounded-full transition-colors ${
                          preferences.groupSimilar ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform ${
                            preferences.groupSimilar ? 'translate-x-4' : ''
                          }`}
                        />
                      </button>
                    </div>
                    <div className="border-t border-gray-200 pt-2">
                      <button
                        onClick={() => router.push(`${notificationsPath}?settings=true`)}
                        className="w-full text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        More settings →
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Quick Actions */}
            {unreadCount > 0 && (
              <div className="flex items-center justify-between border-b border-gray-100 bg-blue-50/50 px-4 py-2">
                <span className="text-xs text-blue-700">
                  {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={() => markAllAsRead()}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  <CheckCheck className="h-3 w-3" />
                  Mark all read (M)
                </button>
              </div>
            )}

            {/* Notifications List */}
            <div className="max-h-[400px] overflow-y-auto">
              {loading && filteredNotifications.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Bell className="mb-3 h-12 w-12 opacity-30" />
                  <p className="text-sm font-medium text-gray-600">No notifications</p>
                  <p className="mt-1 text-xs">
                    {searchQuery || filterCategory || activeTab === 'unread'
                      ? 'Try different filters'
                      : "You're all caught up!"}
                  </p>
                </div>
              ) : preferences.groupSimilar ? (
                <>
                  {renderNotificationGroup('Today', groupedNotifications.today)}
                  {renderNotificationGroup('Yesterday', groupedNotifications.yesterday || [])}
                  {renderNotificationGroup('Earlier', groupedNotifications.earlier)}
                </>
              ) : (
                <div className="divide-y divide-gray-100">
                  {filteredNotifications.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onRead={() => markAsRead(notification.id)}
                      onArchive={() => archiveNotifications([notification.id])}
                      onClick={() => handleNotificationClick(notification)}
                      compact
                    />
                  ))}
                </div>
              )}

              {/* Load More */}
              {hasMore && (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex w-full items-center justify-center gap-2 border-t border-gray-100 py-3 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Load more</>}
                </button>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-4 py-3">
              <span className="text-xs text-gray-500">
                Press{' '}
                <kbd className="rounded bg-gray-200 px-1.5 py-0.5 font-mono text-[10px]">R</kbd> to
                refresh
              </span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push(notificationsPath);
                }}
                className="text-sm font-medium hover:underline"
                style={{ color: primaryColor }}
              >
                View all →
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
