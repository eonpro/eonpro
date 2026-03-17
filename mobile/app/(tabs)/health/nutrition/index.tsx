import { View, Text, ScrollView, RefreshControl, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

interface NutritionLog {
  id: number; mealType: string; description: string | null; calories: number | null;
  protein: number | null; carbs: number | null; fat: number | null; recordedAt: string;
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const MEAL_EMOJI: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎' };

export default function NutritionTrackingScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [mealType, setMealType] = useState<typeof MEALS[number]>('lunch');
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const nutrition = usePortalQuery<{ data: NutritionLog[]; meta: { todayCalories: number; todayProtein: number; todayCarbs: number; todayFat: number } }>(
    ['nutrition-logs'], `/api/patient-progress/nutrition?patientId=${user?.patientId ?? user?.id}`
  );

  const onRefresh = useCallback(async () => { setRefreshing(true); await nutrition.refetch(); setRefreshing(false); }, [nutrition]);

  const handleLog = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/patient-progress/nutrition', {
        method: 'POST', body: JSON.stringify({
          patientId: user?.patientId ?? user?.id, mealType,
          description: description.trim() || undefined,
          calories: calories ? parseInt(calories) : undefined,
          protein: protein ? parseInt(protein) : undefined,
        }),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setDescription(''); setCalories(''); setProtein(''); setShowForm(false); await nutrition.refetch();
    } catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Failed'); }
    finally { setSubmitting(false); }
  }, [mealType, description, calories, protein, user, nutrition]);

  const meta = nutrition.data?.meta;

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
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Nutrition</Text>

        {/* Today's Macros */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Today</Text>
          <View className="flex-row justify-around">
            <View className="items-center"><Text className="text-xl font-bold text-orange-500">{meta?.todayCalories ?? 0}</Text><Text className="text-xs text-gray-500">cal</Text></View>
            <View className="items-center"><Text className="text-xl font-bold text-blue-500">{meta?.todayProtein ?? 0}g</Text><Text className="text-xs text-gray-500">protein</Text></View>
            <View className="items-center"><Text className="text-xl font-bold text-yellow-500">{meta?.todayCarbs ?? 0}g</Text><Text className="text-xs text-gray-500">carbs</Text></View>
            <View className="items-center"><Text className="text-xl font-bold text-red-400">{meta?.todayFat ?? 0}g</Text><Text className="text-xs text-gray-500">fat</Text></View>
          </View>
        </View>

        {showForm && (
          <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-3">Log Meal</Text>
            <View className="flex-row gap-2 mb-3">
              {MEALS.map((m) => (
                <TouchableOpacity key={m} onPress={() => setMealType(m)} className="flex-1 rounded-lg py-2 items-center"
                  style={{ backgroundColor: mealType === m ? colors.primary : '#F3F4F6' }}>
                  <Text className="text-xs">{MEAL_EMOJI[m]}</Text>
                  <Text className="text-xs font-medium capitalize" style={{ color: mealType === m ? colors.primaryText : '#4B5563' }}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="What did you eat?" placeholderTextColor="#9CA3AF" value={description} onChangeText={setDescription} />
            <View className="flex-row gap-3 mb-4">
              <View className="flex-1">
                <Text className="text-xs text-gray-500 mb-1">Calories</Text>
                <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  placeholder="0" placeholderTextColor="#9CA3AF" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
              </View>
              <View className="flex-1">
                <Text className="text-xs text-gray-500 mb-1">Protein (g)</Text>
                <TextInput className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900"
                  placeholder="0" placeholderTextColor="#9CA3AF" value={protein} onChangeText={setProtein} keyboardType="number-pad" />
              </View>
            </View>
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => setShowForm(false)} className="flex-1 rounded-xl py-3 items-center border border-gray-200">
                <Text className="text-sm font-medium text-gray-600">Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={handleLog} disabled={submitting} className="flex-1 rounded-xl py-3 items-center"
                style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}>
                {submitting ? <ActivityIndicator color={colors.primaryText} /> :
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View className="px-5">
          <Text className="text-base font-semibold text-gray-900 mb-3">Recent Meals</Text>
          {(nutrition.data?.data?.length ?? 0) > 0 ? nutrition.data!.data.slice(0, 20).map((log) => (
            <View key={log.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center justify-between">
              <View className="flex-row items-center flex-1">
                <Text className="text-lg mr-2">{MEAL_EMOJI[log.mealType] ?? '🍽️'}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900 capitalize">{log.mealType}</Text>
                  {log.description && <Text className="text-xs text-gray-500" numberOfLines={1}>{log.description}</Text>}
                </View>
              </View>
              <View className="items-end">
                {log.calories && <Text className="text-xs font-medium text-gray-700">{log.calories} cal</Text>}
                <Text className="text-xs text-gray-400">{formatDate(log.recordedAt)}</Text>
              </View>
            </View>
          )) : <Text className="text-sm text-gray-400 text-center py-4">No meals logged yet</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return iso; }
}
