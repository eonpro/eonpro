import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface ExerciseLog {
  id: number; activityType: string; duration: number; intensity: string;
  calories: number | null; steps: number | null; recordedAt: string;
}

const ACTIVITIES = ['Walking', 'Running', 'Cycling', 'Swimming', 'Yoga', 'Strength', 'Other'];
const INTENSITIES = ['light', 'moderate', 'vigorous'] as const;

export default function ExerciseTrackingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [activity, setActivity] = useState('Walking');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<typeof INTENSITIES[number]>('moderate');
  const [submitting, setSubmitting] = useState(false);

  const exercise = usePortalQuery<{ data: ExerciseLog[]; meta: { weeklyMinutes: number; weeklyCalories: number } }>(
    ['exercise-logs'], `/api/patient-progress/exercise?patientId=${user?.patientId ?? user?.id}`
  );

  const onRefresh = useCallback(async () => { setRefreshing(true); await exercise.refetch(); setRefreshing(false); }, [exercise]);

  const handleLog = useCallback(async () => {
    const dur = parseInt(duration);
    if (isNaN(dur) || dur < 1) { Alert.alert('Invalid', 'Please enter a valid duration.'); return; }
    setSubmitting(true);
    try {
      await apiFetch('/api/patient-progress/exercise', {
        method: 'POST', body: JSON.stringify({ patientId: user?.patientId ?? user?.id, activityType: activity, duration: dur, intensity }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDuration(''); setShowForm(false); await exercise.refetch();
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  }, [activity, duration, intensity, user, exercise]);

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
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Exercise</Text>

        {/* Weekly Stats */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4 flex-row justify-around">
          <View className="items-center">
            <Text className="text-2xl font-bold" style={{ color: colors.primary }}>{exercise.data?.meta?.weeklyMinutes ?? 0}</Text>
            <Text className="text-xs text-gray-500">min this week</Text>
          </View>
          <View className="items-center">
            <Text className="text-2xl font-bold text-orange-500">{exercise.data?.meta?.weeklyCalories ?? 0}</Text>
            <Text className="text-xs text-gray-500">cal burned</Text>
          </View>
        </View>

        {/* Log Form */}
        {showForm && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">Log Exercise</Text>
            <Text className="text-sm font-medium text-gray-700 mb-2">Activity</Text>
            <View className="flex-row flex-wrap gap-2 mb-3">
              {ACTIVITIES.map((a) => (
                <TouchableOpacity key={a} onPress={() => setActivity(a)} className="rounded-lg px-3 py-2"
                  style={{ backgroundColor: activity === a ? colors.primary : '#F3F4F6' }}>
                  <Text className="text-xs font-medium" style={{ color: activity === a ? colors.primaryText : '#4B5563' }}>{a}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Duration (minutes)</Text>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="e.g. 30" placeholderTextColor="#9CA3AF" value={duration} onChangeText={setDuration} keyboardType="number-pad" />
            <Text className="text-sm font-medium text-gray-700 mb-2">Intensity</Text>
            <View className="flex-row gap-2 mb-4">
              {INTENSITIES.map((i) => (
                <TouchableOpacity key={i} onPress={() => setIntensity(i)} className="flex-1 rounded-lg py-2 items-center"
                  style={{ backgroundColor: intensity === i ? colors.primary : '#F3F4F6' }}>
                  <Text className="text-xs font-medium capitalize" style={{ color: intensity === i ? colors.primaryText : '#4B5563' }}>{i}</Text>
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

        {/* History */}
        <View className="px-5">
          <Text className="text-base font-semibold text-gray-900 mb-3">Recent</Text>
          {(exercise.data?.data?.length ?? 0) > 0 ? exercise.data!.data.slice(0, 20).map((log) => (
            <View key={log.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center justify-between">
              <View>
                <Text className="text-sm font-semibold text-gray-900">{log.activityType}</Text>
                <Text className="text-xs text-gray-500">{log.duration} min · {log.intensity}</Text>
              </View>
              <Text className="text-xs text-gray-400">{formatDate(log.recordedAt)}</Text>
            </View>
          )) : <Text className="text-sm text-gray-400 text-center py-4">No exercises logged yet</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return iso; }
}
