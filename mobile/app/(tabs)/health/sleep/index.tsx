import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface SleepLog {
  id: number; duration: number; quality: number | null; recordedAt: string; sleepStart: string; sleepEnd: string;
}

export default function SleepTrackingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [hours, setHours] = useState('');
  const [quality, setQuality] = useState(7);
  const [submitting, setSubmitting] = useState(false);

  const sleep = usePortalQuery<{ data: SleepLog[]; meta: { avgSleepHours: number; avgQuality: number | null } }>(
    ['sleep-logs'], `/api/patient-progress/sleep?patientId=${user?.patientId ?? user?.id}`
  );

  const onRefresh = useCallback(async () => { setRefreshing(true); await sleep.refetch(); setRefreshing(false); }, [sleep]);

  const handleLog = useCallback(async () => {
    const h = parseFloat(hours);
    if (isNaN(h) || h < 0.5 || h > 24) { Alert.alert('Invalid', 'Enter hours between 0.5 and 24.'); return; }
    setSubmitting(true);
    const now = new Date();
    const sleepEnd = now.toISOString();
    const sleepStart = new Date(now.getTime() - h * 3600000).toISOString();
    try {
      await apiFetch('/api/patient-progress/sleep', {
        method: 'POST', body: JSON.stringify({ patientId: user?.patientId ?? user?.id, sleepStart, sleepEnd, quality }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setHours(''); setShowForm(false); await sleep.refetch();
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  }, [hours, quality, user, sleep]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          {!showForm && <TouchableOpacity onPress={() => setShowForm(true)} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
            <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>+ Log</Text>
          </TouchableOpacity>}
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Sleep</Text>

        {/* Stats */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4 flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold" style={{ color: '#7C3AED' }}>{sleep.data?.meta?.avgSleepHours?.toFixed(1) ?? '—'}</Text>
            <Text className="text-xs text-gray-500">avg hours</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-yellow-500">{sleep.data?.meta?.avgQuality?.toFixed(1) ?? '—'}</Text>
            <Text className="text-xs text-gray-500">avg quality</Text>
          </View>
        </View>

        {showForm && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">Log Sleep</Text>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Hours slept</Text>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 mb-3"
              placeholder="e.g. 7.5" placeholderTextColor="#9CA3AF" value={hours} onChangeText={setHours} keyboardType="decimal-pad" autoFocus />
            <Text className="text-sm font-medium text-gray-700 mb-2">Quality (1-10)</Text>
            <View className="flex-row gap-1 mb-4">
              {[1,2,3,4,5,6,7,8,9,10].map((q) => (
                <TouchableOpacity key={q} onPress={() => setQuality(q)} className="flex-1 rounded-lg py-2 items-center"
                  style={{ backgroundColor: quality === q ? '#7C3AED' : '#F3F4F6' }}>
                  <Text className="text-xs font-medium" style={{ color: quality === q ? '#fff' : '#4B5563' }}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowForm(false)} className="flex-1 rounded-xl py-3 items-center border border-gray-200">
                <Text className="text-sm font-medium text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLog} disabled={submitting} className="flex-1 rounded-xl py-3 items-center"
                style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <ActivityIndicator color={colors.primaryText} /> :
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className="px-5">
          <Text className="text-base font-semibold text-gray-900 mb-3">Recent</Text>
          {(sleep.data?.data?.length ?? 0) > 0 ? sleep.data!.data.slice(0, 20).map((log) => (
            <View key={log.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold text-gray-900">{(log.duration / 60).toFixed(1)} hours</Text>
                {log.quality && <Text className="text-xs text-gray-500">Quality: {log.quality}/10</Text>}
              </View>
              <Text className="text-xs text-gray-400">{formatDate(log.recordedAt)}</Text>
            </View>
          )) : <Text className="text-sm text-gray-400 text-center py-4">No sleep logged yet</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return iso; }
}
