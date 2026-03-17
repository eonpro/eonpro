import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Provider {
  id: number; firstName: string; lastName: string; titleLine: string | null; isActive: boolean;
}

export default function CareTeamScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const team = usePortalQuery<{ providers: Provider[] }>(['care-team'], '/api/patient-portal/care-team');
  const onRefresh = useCallback(async () => { setRefreshing(true); await team.refetch(); setRefreshing(false); }, [team]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Care Team</Text>

        <View className="px-5">
          {team.isLoading ? <SkeletonList count={3} /> : (team.data?.providers?.length ?? 0) > 0 ? (
            team.data!.providers.map((p) => (
              <View key={p.id} className="bg-white rounded-2xl p-5 shadow-sm mb-3 flex-row items-center">
                <View className="w-12 h-12 rounded-full items-center justify-center mr-4" style={{ backgroundColor: colors.primaryLight }}>
                  <Text className="text-lg font-bold" style={{ color: colors.primary }}>
                    {p.firstName[0]}{p.lastName[0]}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="text-base font-semibold text-gray-900">Dr. {p.firstName} {p.lastName}</Text>
                  {p.titleLine && <Text className="text-sm text-gray-500">{p.titleLine}</Text>}
                </View>
                {!p.isActive && <Text className="text-xs text-gray-400">Inactive</Text>}
              </View>
            ))
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">👨‍⚕️</Text>
              <Text className="text-base font-medium text-gray-700">No care team assigned</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
