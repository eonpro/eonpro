import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Ticket {
  id: number;
  ticketNumber: string;
  title: string;
  status: string;
  priority: string;
  category: string;
  createdAt: string;
  updatedAt: string;
  _count: { comments: number };
}

export default function SupportScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const tickets = usePortalQuery<{ tickets: Ticket[] }>(
    ['tickets'],
    '/api/patient-portal/tickets'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await tickets.refetch();
    setRefreshing(false);
  }, [tickets]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/support/new')}
          className="rounded-lg px-3 py-1.5"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>New Ticket</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Support</Text>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {tickets.isLoading ? (
          <SkeletonList count={3} />
        ) : (tickets.data?.tickets?.length ?? 0) > 0 ? (
          tickets.data!.tickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              onPress={() => router.push(`/support/${ticket.id}`)}
              className="bg-white rounded-2xl p-5 shadow-sm mb-3"
            >
              <View className="flex-row items-start justify-between mb-1.5">
                <View className="flex-1 mr-3">
                  <Text className="text-xs text-gray-400 mb-0.5">{ticket.ticketNumber}</Text>
                  <Text className="text-base font-semibold text-gray-900">{ticket.title}</Text>
                </View>
                <StatusBadge status={ticket.status} />
              </View>
              <View className="flex-row items-center gap-3 mt-2">
                <Text className="text-xs text-gray-400 capitalize">
                  {ticket.category.replace(/_/g, ' ').toLowerCase()}
                </Text>
                {ticket._count.comments > 0 && (
                  <Text className="text-xs text-gray-400">
                    {ticket._count.comments} {ticket._count.comments === 1 ? 'reply' : 'replies'}
                  </Text>
                )}
                <Text className="text-xs text-gray-400">{formatDate(ticket.updatedAt)}</Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-3">🎧</Text>
            <Text className="text-base font-medium text-gray-700">No support tickets</Text>
            <Text className="text-sm text-gray-400 mt-1 text-center">
              Need help? Create a new support ticket.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
