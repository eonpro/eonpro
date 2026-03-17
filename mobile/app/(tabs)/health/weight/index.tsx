import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface WeightLog {
  id: number;
  weight: number;
  unit: string;
  notes: string | null;
  recordedAt: string;
  source: string;
}

export default function WeightTrackingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [notesInput, setNotesInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const logs = usePortalQuery<{ data: WeightLog[]; meta: { count: number } }>(
    ['weight-logs'],
    `/api/patient-progress/weight?patientId=${user?.patientId ?? user?.id}&limit=50`
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await logs.refetch();
    setRefreshing(false);
  }, [logs]);

  const handleLogWeight = useCallback(async () => {
    const weight = parseFloat(weightInput);
    if (isNaN(weight) || weight <= 0 || weight > 2000) {
      Alert.alert('Invalid', 'Please enter a valid weight.');
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/patient-progress/weight', {
        method: 'POST',
        body: JSON.stringify({
          patientId: user?.patientId ?? user?.id,
          weight,
          unit: 'lbs',
          notes: notesInput.trim() || undefined,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setWeightInput('');
      setNotesInput('');
      setShowLog(false);
      await logs.refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to log weight');
    } finally {
      setSubmitting(false);
    }
  }, [weightInput, notesInput, user, logs]);

  const data = logs.data?.data ?? [];
  const latest = data[0];
  const previous = data[1];
  const change = latest && previous ? latest.weight - previous.weight : null;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          {!showLog && (
            <TouchableOpacity onPress={() => setShowLog(true)} className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
              <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>+ Log</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Weight</Text>

        {/* Current Stats */}
        {latest && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
            <View className="flex-row items-end justify-between">
              <View>
                <Text className="text-xs text-gray-500">Current</Text>
                <Text className="text-3xl font-bold" style={{ color: colors.primary }}>
                  {latest.weight}
                </Text>
                <Text className="text-sm text-gray-400">{latest.unit}</Text>
              </View>
              {change !== null && (
                <View className="items-end">
                  <Text className="text-xs text-gray-500">Change</Text>
                  <Text className={`text-lg font-bold ${change <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {change > 0 ? '+' : ''}{change.toFixed(1)}
                  </Text>
                  <Text className="text-xs text-gray-400">{latest.unit}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Log Form */}
        {showLog && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">Log Weight</Text>
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Weight (lbs)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-lg text-gray-900 mb-3"
              placeholder="e.g. 185"
              placeholderTextColor="#9CA3AF"
              value={weightInput}
              onChangeText={setWeightInput}
              keyboardType="decimal-pad"
              autoFocus
            />
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
              placeholder="How are you feeling?"
              placeholderTextColor="#9CA3AF"
              value={notesInput}
              onChangeText={setNotesInput}
              maxLength={500}
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowLog(false)} className="flex-1 rounded-xl py-3.5 items-center border border-gray-200">
                <Text className="text-sm font-medium text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleLogWeight} disabled={submitting}
                className="flex-1 rounded-xl py-3.5 items-center" style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <ActivityIndicator color={colors.primaryText} /> :
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History */}
        <View className="px-5">
          <Text className="text-lg font-semibold text-gray-900 mb-3">History ({data.length})</Text>
          {data.length > 0 ? data.map((log) => (
            <View key={log.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center justify-between">
              <View>
                <Text className="text-base font-semibold text-gray-900">{log.weight} {log.unit}</Text>
                {log.notes && <Text className="text-xs text-gray-400 mt-0.5">{log.notes}</Text>}
              </View>
              <Text className="text-xs text-gray-400">{formatDate(log.recordedAt)}</Text>
            </View>
          )) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">⚖️</Text>
              <Text className="text-base font-medium text-gray-700">No weight logs</Text>
              <Text className="text-sm text-gray-400 mt-1">Tap "+ Log" to record your weight.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
}
