import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

const QUICK_AMOUNTS = [8, 12, 16, 24, 32];

export default function WaterTrackingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const water = usePortalQuery<{ data: Array<{ id: number; amount: number; unit: string; recordedAt: string }>; meta: { todayTotal: number } }>(
    ['water-logs'],
    `/api/patient-progress/water?patientId=${user?.patientId ?? user?.id}`
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await water.refetch();
    setRefreshing(false);
  }, [water]);

  const handleQuickLog = useCallback(async (amount: number) => {
    try {
      await apiFetch('/api/patient-progress/water', {
        method: 'POST',
        body: JSON.stringify({ patientId: user?.patientId ?? user?.id, amount, unit: 'oz' }),
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await water.refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to log water');
    }
  }, [user, water]);

  const todayTotal = water.data?.meta?.todayTotal ?? 0;
  const goal = 64;
  const progress = Math.min(todayTotal / goal, 1);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Water Intake</Text>

        {/* Progress */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4 items-center">
          <Text className="text-4xl mb-2">💧</Text>
          <Text className="text-3xl font-bold" style={{ color: colors.primary }}>{todayTotal} oz</Text>
          <Text className="text-sm text-gray-500 mt-1">of {goal} oz goal</Text>
          <View className="w-full h-3 bg-gray-100 rounded-full mt-4 overflow-hidden">
            <View className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: colors.primary }} />
          </View>
        </View>

        {/* Quick Log */}
        <View className="px-5 mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">Quick Log</Text>
          <View className="flex-row flex-wrap gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <TouchableOpacity key={amt} onPress={() => handleQuickLog(amt)}
                className="rounded-xl px-4 py-3 items-center" style={{ backgroundColor: colors.primaryLight, flex: 1, minWidth: 60 }}>
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>{amt} oz</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Today's Logs */}
        <View className="px-5">
          <Text className="text-base font-semibold text-gray-900 mb-3">Today</Text>
          {(water.data?.data?.length ?? 0) > 0 ? water.data!.data.slice(0, 10).map((log) => (
            <View key={log.id} className="bg-white rounded-xl p-3 shadow-sm mb-2 flex-row items-center justify-between">
              <Text className="text-sm font-medium text-gray-900">{log.amount} {log.unit}</Text>
              <Text className="text-xs text-gray-400">{formatTime(log.recordedAt)}</Text>
            </View>
          )) : (
            <Text className="text-sm text-gray-400 text-center py-4">No water logged today</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return ''; }
}
