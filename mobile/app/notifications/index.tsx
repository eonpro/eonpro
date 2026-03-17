import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { setBadgeCount } from '@/lib/notifications';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Notification {
  id: number;
  createdAt: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
}

interface NotificationsData {
  notifications: Notification[];
  unreadCount: number;
  total: number;
  hasMore: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  PRESCRIPTION: '💊',
  ORDER: '📦',
  SHIPMENT: '🚚',
  APPOINTMENT: '📅',
  MESSAGE: '💬',
  PAYMENT: '💳',
  REFILL: '🔄',
  SYSTEM: '⚙️',
  PATIENT: '👤',
};

export default function NotificationsScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const notifications = usePortalQuery<NotificationsData>(
    ['notifications'],
    '/api/notifications?pageSize=50'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await notifications.refetch();
    setRefreshing(false);
  }, [notifications]);

  async function handleMarkAllRead() {
    try {
      await apiFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({ markAll: true }),
      });
      await notifications.refetch();
      await setBadgeCount(0);
    } catch {
      // Silent failure
    }
  }

  async function handleMarkRead(id: number) {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      await notifications.refetch();
      const newCount = (notifications.data?.unreadCount ?? 1) - 1;
      await setBadgeCount(Math.max(0, newCount));
    } catch {
      // Silent
    }
  }

  const unreadCount = notifications.data?.unreadCount ?? 0;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
        </TouchableOpacity>
        {unreadCount > 0 && (
          <TouchableOpacity onPress={handleMarkAllRead}>
            <Text className="text-sm font-medium" style={{ color: colors.primary }}>Mark All Read</Text>
          </TouchableOpacity>
        )}
      </View>

      <View className="px-5 mb-3">
        <Text className="text-2xl font-bold text-gray-900">Notifications</Text>
        {unreadCount > 0 && (
          <Text className="text-sm text-gray-500 mt-0.5">{unreadCount} unread</Text>
        )}
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {notifications.isLoading ? (
          <View className="px-5"><SkeletonList count={5} /></View>
        ) : (notifications.data?.notifications?.length ?? 0) > 0 ? (
          notifications.data!.notifications.map((n) => (
            <TouchableOpacity
              key={n.id}
              onPress={() => { handleMarkRead(n.id); }}
              className={`px-5 py-4 border-b border-gray-100 ${n.isRead ? '' : 'bg-blue-50/30'}`}
            >
              <View className="flex-row items-start">
                <Text className="text-lg mr-3 mt-0.5">
                  {CATEGORY_ICONS[n.category] ?? '🔔'}
                </Text>
                <View className="flex-1">
                  <View className="flex-row items-center">
                    <Text className={`text-sm flex-1 ${n.isRead ? 'text-gray-700 font-medium' : 'text-gray-900 font-semibold'}`}>
                      {n.title}
                    </Text>
                    {!n.isRead && (
                      <View className="w-2 h-2 rounded-full ml-2" style={{ backgroundColor: colors.primary }} />
                    )}
                  </View>
                  <Text className="text-sm text-gray-500 mt-0.5" numberOfLines={2}>
                    {n.message}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-1.5">{formatTimeAgo(n.createdAt)}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View className="items-center py-20">
            <Text className="text-4xl mb-3">🔔</Text>
            <Text className="text-base text-gray-500">No notifications</Text>
            <Text className="text-sm text-gray-400 mt-1">You're all caught up!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTimeAgo(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}
