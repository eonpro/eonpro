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

// ============================================================================
// Category Configuration
// ============================================================================

const categoryConfig: Record<NotificationCategory, { icon: typeof Bell; color: string; bgColor: string; label: string }> = {
  PRESCRIPTION: { icon: Pill, color: 'text-purple-600', bgColor: 'bg-purple-100', label: 'Prescriptions' },
  PATIENT: { icon: User, color: 'text-blue-600', bgColor: 'bg-blue-100', label: 'Patients' },
  ORDER: { icon: Package, color: 'text-green-600', bgColor: 'bg-green-100', label: 'Orders' },
  SYSTEM: { icon: AlertCircle, color: 'text-orange-600', bgColor: 'bg-orange-100', label: 'System' },
  APPOINTMENT: { icon: Calendar, color: 'text-cyan-600', bgColor: 'bg-cyan-100', label: 'Appointments' },
  MESSAGE: { icon: MessageSquare, color: 'text-indigo-600', bgColor: 'bg-indigo-100', label: 'Messages' },
  PAYMENT: { icon: CreditCard, color: 'text-emerald-600', bgColor: 'bg-emerald-100', label: 'Payments' },
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
  'PRESCRIPTION', 'PATIENT', 'ORDER', 'SYSTEM', 
  'APPOINTMENT', 'MESSAGE', 'PAYMENT', 'REFILL'
];

// ============================================================================
// Component
// ============================================================================

export default function AdminNotificationsPage() {
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

  // Filter notifications by search and category
  const filteredNotifications = notifications.filter((n: Notification) => {
    // Category filter
    if (filterCategory && n.category !== filterCategory) return false;
    // Unread filter
    if (showUnreadOnly && n.isRead) return false;
    // Search filter
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      n.title.toLowerCase().includes(query) ||
      n.message.toLowerCase().includes(query)
    );
  });

  // Toggle selection
  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => {
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
    setSelectedIds(new Set(filteredNotifications.map(n => n.id)));
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
  const handleNotificationClick = useCallback(async (notification: Notification) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
    }
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

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
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
              className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            {unreadCount > 0 && activeTab === 'notifications' && (
              <button
                onClick={() => markAllAsRead()}
                className="px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                <CheckCheck className="h-4 w-4 inline mr-1.5" />
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'notifications'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Inbox className="h-4 w-4" />
            Notifications
            {unreadCount > 0 && (
              <span 
                className="px-1.5 py-0.5 text-[10px] font-bold text-white rounded-full"
                style={{ backgroundColor: primaryColor }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
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
      {activeTab === 'settings' && (
        <NotificationSettings />
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <>
      {/* Filters Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 overflow-hidden">
        <div className="p-4 flex items-center gap-4 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent text-sm"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
            />
          </div>

          {/* Category Filter */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                filterCategory ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              } transition-colors`}
            >
              <Filter className="h-4 w-4" />
              {filterCategory ? categoryConfig[filterCategory].label : 'All Categories'}
              <ChevronDown className="h-4 w-4" />
            </button>

            {showFilters && (
              <div className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-lg border border-gray-100 z-20 py-2 min-w-[180px]">
                <button
                  onClick={() => { setFilterCategory(null); setShowFilters(false); }}
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
                      onClick={() => { setFilterCategory(cat); setShowFilters(false); }}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 ${
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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
              showUnreadOnly ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            } transition-colors`}
          >
            <Bell className="h-4 w-4" />
            Unread only
          </button>
        </div>

        {/* Selection Actions */}
        {selectedIds.size > 0 && (
          <div className="px-4 py-3 bg-blue-50 border-t border-blue-100 flex items-center gap-4">
            <span className="text-sm text-blue-700 font-medium">
              {selectedIds.size} selected
            </span>
            <button
              onClick={handleBulkMarkRead}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <Check className="h-4 w-4" />
              Mark as read
            </button>
            <button
              onClick={handleBulkArchive}
              className="text-sm text-red-600 hover:text-red-800 flex items-center gap-1"
            >
              <Trash2 className="h-4 w-4" />
              Archive
            </button>
            <button
              onClick={clearSelection}
              className="text-sm text-gray-500 hover:text-gray-700 ml-auto"
            >
              Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && filteredNotifications.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Bell className="h-16 w-16 mb-4 opacity-30" />
            <p className="text-lg font-medium text-gray-600">No notifications</p>
            <p className="text-sm mt-1">
              {filterCategory || showUnreadOnly ? 'Try adjusting your filters' : "You're all caught up!"}
            </p>
          </div>
        ) : (
          <>
            {/* Select All Header */}
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 bg-gray-50">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredNotifications.length && filteredNotifications.length > 0}
                onChange={() => {
                  if (selectedIds.size === filteredNotifications.length) {
                    clearSelection();
                  } else {
                    selectAll();
                  }
                }}
                className="w-4 h-4 rounded border-gray-300 focus:ring-blue-500"
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
                    className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors border-l-4 ${
                      priorityColors[notification.priority]
                    } ${!notification.isRead ? 'bg-blue-50/30' : ''} ${isSelected ? 'bg-blue-50' : ''}`}
                  >
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelection(notification.id)}
                      className="mt-1 w-4 h-4 rounded border-gray-300 focus:ring-blue-500"
                    />

                    {/* Icon */}
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${config.color}`} />
                    </div>

                    {/* Content */}
                    <button
                      onClick={() => handleNotificationClick(notification)}
                      className="flex-1 text-left min-w-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium text-gray-900 ${!notification.isRead ? 'font-semibold' : ''}`}>
                          {notification.title}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!notification.isRead && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                          <span className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(notification.createdAt)}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      {notification.actionUrl && (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-500 mt-2">
                          View details
                          <ChevronRight className="h-3 w-3" />
                        </span>
                      )}
                    </button>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!notification.isRead && (
                        <button
                          onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); archiveNotifications([notification.id]); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-xl transition-colors flex items-center justify-center gap-2"
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
