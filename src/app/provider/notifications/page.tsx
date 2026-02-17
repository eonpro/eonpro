'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Filter,
  Search,
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
  X,
  ChevronDown,
  Settings,
  Inbox,
  Archive,
} from 'lucide-react';
import { useNotificationContext, NotificationSettings } from '@/components/notifications';
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
    color: 'text-[var(--brand-primary)]',
    bgColor: 'bg-[var(--brand-primary-light)]',
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
];

// ============================================================================
// Component
// ============================================================================

export default function ProviderNotificationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { branding } = useClinicBranding();
  const primaryColor = branding?.primaryColor || '#4fa77e';

  // State
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [filterCategory, setFilterCategory] = useState<NotificationCategory | null>(null);
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<'notifications' | 'settings'>('notifications');

  // Check for settings tab in URL
  useEffect(() => {
    if (searchParams.get('settings') === 'true') {
      setActiveTab('settings');
    }
  }, [searchParams]);

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
  } = useNotificationContext();

  // Filter notifications by search and category (must be before callbacks that use it)
  const filteredNotifications = notifications.filter((n: Notification) => {
    // Category filter
    if (filterCategory && n.category !== filterCategory) return false;
    // Unread filter
    if (showUnreadOnly && n.isRead) return false;
    // Search filter
    return normalizedIncludes(n.title, searchQuery) || normalizedIncludes(n.message, searchQuery);
  });

  // Toggle selection
  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Select all visible
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredNotifications.map((n) => n.id)));
  }, [filteredNotifications]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Handle bulk mark as read
  const handleBulkMarkRead = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await markManyAsRead(Array.from(selectedIds));
    clearSelection();
  }, [selectedIds, markManyAsRead, clearSelection]);

  // Handle bulk archive
  const handleBulkArchive = useCallback(async () => {
    if (selectedIds.size === 0) return;
    await archiveNotifications(Array.from(selectedIds));
    clearSelection();
  }, [selectedIds, archiveNotifications, clearSelection]);

  // Handle notification click
  const handleNotificationClick = useCallback(
    async (notification: Notification) => {
      if (!notification.isRead) {
        await markAsRead(notification.id);
      }
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

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `${primaryColor}15` }}
            >
              <Bell className="h-6 w-6" style={{ color: primaryColor }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notification Center</h1>
              <p className="text-sm text-gray-500">
                {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'} • {total} total
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-gray-100"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            {unreadCount > 0 && activeTab === 'notifications' && (
              <button
                onClick={() => markAllAsRead()}
                className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                <CheckCheck className="mr-1.5 inline h-4 w-4" />
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex w-fit items-center gap-2 rounded-xl bg-gray-100 p-1">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Notifications
            {unreadCount > 0 && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Settings Tab */}
      {activeTab === 'settings' && <NotificationSettings />}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <>
          {/* Filters Bar */}
          <div className="mb-6 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center gap-4 p-4">
              {/* Search */}
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full rounded-xl border border-gray-200 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                />
              </div>

              {/* Category Filter */}
              <div className="relative">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${
                    filterCategory
                      ? 'border-blue-200 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  } transition-colors`}
                >
                  <Filter className="h-4 w-4" />
                  {filterCategory ? categoryConfig[filterCategory].label : 'All Categories'}
                  <ChevronDown className="h-4 w-4" />
                </button>

                {showFilters && (
                  <div className="absolute right-0 top-full z-20 mt-2 min-w-[180px] rounded-xl border border-gray-100 bg-white py-2 shadow-lg">
                    <button
                      onClick={() => {
                        setFilterCategory(null);
                        setShowFilters(false);
                      }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${!filterCategory ? 'font-medium text-blue-600' : 'text-gray-700'}`}
                    >
                      All Categories
                    </button>
                    {categories.map((cat) => {
                      const config = categoryConfig[cat];
                      const Icon = config.icon;
                      return (
                        <button
                          key={cat}
                          onClick={() => {
                            setFilterCategory(cat);
                            setShowFilters(false);
                          }}
                          className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                            filterCategory === cat ? 'font-medium text-blue-600' : 'text-gray-700'
                          }`}
                        >
                          <Icon className={`h-4 w-4 ${config.color}`} />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Unread Only Toggle */}
              <button
                onClick={() => setShowUnreadOnly(!showUnreadOnly)}
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 ${
                  showUnreadOnly
                    ? 'border-blue-200 bg-blue-50 text-blue-700'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                } transition-colors`}
              >
                <Bell className="h-4 w-4" />
                Unread only
              </button>
            </div>

            {/* Selection Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-4 border-t border-blue-100 bg-blue-50 px-4 py-3">
                <span className="text-sm font-medium text-blue-700">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={handleBulkMarkRead}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                >
                  <Check className="h-4 w-4" />
                  Mark as read
                </button>
                <button
                  onClick={handleBulkArchive}
                  className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800"
                >
                  <Trash2 className="h-4 w-4" />
                  Archive
                </button>
                <button
                  onClick={clearSelection}
                  className="ml-auto text-sm text-gray-500 hover:text-gray-700"
                >
                  Clear selection
                </button>
              </div>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
            {loading && filteredNotifications.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                <Bell className="mb-4 h-16 w-16 opacity-30" />
                <p className="text-lg font-medium text-gray-600">No notifications</p>
                <p className="mt-1 text-sm">
                  {filterCategory || showUnreadOnly
                    ? 'Try adjusting your filters'
                    : "You're all caught up!"}
                </p>
              </div>
            ) : (
              <>
                {/* Select All Header */}
                <div className="flex items-center gap-3 border-b border-gray-100 bg-gray-50 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === filteredNotifications.length &&
                      filteredNotifications.length > 0
                    }
                    onChange={() => {
                      if (selectedIds.size === filteredNotifications.length) {
                        clearSelection();
                      } else {
                        selectAll();
                      }
                    }}
                    className="h-4 w-4 rounded border-gray-300 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-600">
                    Select all ({filteredNotifications.length})
                  </span>
                </div>

                {/* Notifications */}
                <div className="divide-y divide-gray-100">
                  {filteredNotifications.map((notification) => {
                    const config = categoryConfig[notification.category];
                    const Icon = config.icon;
                    const isSelected = selectedIds.has(notification.id);

                    return (
                      <div
                        key={notification.id}
                        className={`flex items-start gap-4 border-l-4 p-4 transition-colors hover:bg-gray-50 ${
                          priorityColors[notification.priority]
                        } ${!notification.isRead ? 'bg-blue-50/30' : ''} ${isSelected ? 'bg-blue-50' : ''}`}
                      >
                        {/* Checkbox */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelection(notification.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 focus:ring-blue-500"
                        />

                        {/* Icon */}
                        <div
                          className={`h-10 w-10 flex-shrink-0 rounded-xl ${config.bgColor} flex items-center justify-center`}
                        >
                          <Icon className={`h-5 w-5 ${config.color}`} />
                        </div>

                        {/* Content */}
                        <button
                          onClick={() => handleNotificationClick(notification)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}
                            >
                              {notification.title}
                            </p>
                            <div className="flex flex-shrink-0 items-center gap-2">
                              {!notification.isRead && (
                                <span className="h-2 w-2 rounded-full bg-blue-500" />
                              )}
                              <span className="whitespace-nowrap text-xs text-gray-400">
                                {formatTime(notification.createdAt)}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-gray-600">
                            {notification.message}
                          </p>
                          {notification.actionUrl && (
                            <span className="mt-2 inline-flex items-center gap-1 text-xs text-blue-500">
                              View details
                              <ChevronRight className="h-3 w-3" />
                            </span>
                          )}
                        </button>

                        {/* Actions */}
                        <div className="flex flex-shrink-0 items-center gap-1">
                          {!notification.isRead && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                markAsRead(notification.id);
                              }}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                              title="Mark as read"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveNotifications([notification.id]);
                            }}
                            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            title="Archive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Load More */}
                {hasMore && (
                  <div className="border-t border-gray-100 p-4">
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                    >
                      {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          Load more notifications
                          <ChevronDown className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
