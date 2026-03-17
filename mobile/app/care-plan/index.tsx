import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface Goal { id: number; name?: string; description: string | null; targetValue: string | null; currentValue: string | null; unit: string | null; status: string; progress: number; }
interface Activity { id: number; name: string; description: string | null; frequency: string; }
interface CarePlan { id: number; name: string; description: string; status: string; phase: string; goals: Goal[]; activities: Activity[]; nextMilestone: string | null; providerNotes: string | null; }

export default function CarePlanScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const carePlan = usePortalQuery<{ carePlan: CarePlan | null }>(['care-plan'], '/api/patient-portal/care-plan');
  const onRefresh = useCallback(async () => { setRefreshing(true); await carePlan.refetch(); setRefreshing(false); }, [carePlan]);
  const plan = carePlan.data?.carePlan;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Care Plan</Text>

        {plan ? (
          <>
            <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
              <Text className="text-lg font-semibold text-gray-900">{plan.name}</Text>
              <Text className="text-sm text-gray-500 mt-1">{plan.description}</Text>
              <View className="mt-3 rounded-lg px-3 py-1.5 self-start" style={{ backgroundColor: colors.primaryLight }}>
                <Text className="text-xs font-medium" style={{ color: colors.primary }}>{plan.phase}</Text>
              </View>
              {plan.nextMilestone && <Text className="text-xs text-gray-400 mt-2">Next milestone: {plan.nextMilestone}</Text>}
            </View>

            {plan.goals.length > 0 && (
              <View className="px-5 mb-4">
                <Text className="text-base font-semibold text-gray-900 mb-3">Goals</Text>
                {plan.goals.map((g) => (
                  <View key={g.id} className="bg-white rounded-xl p-4 shadow-sm mb-2">
                    <View className="flex-row justify-between mb-1.5">
                      <Text className="text-sm font-medium text-gray-900">{g.name ?? 'Goal'}</Text>
                      <Text className="text-xs text-gray-500">{g.progress}%</Text>
                    </View>
                    <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <View className="h-full rounded-full" style={{ width: `${g.progress}%`, backgroundColor: colors.primary }} />
                    </View>
                    {g.targetValue && (
                      <Text className="text-xs text-gray-400 mt-1.5">
                        {g.currentValue ?? '—'} / {g.targetValue} {g.unit ?? ''}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {plan.activities.length > 0 && (
              <View className="px-5">
                <Text className="text-base font-semibold text-gray-900 mb-3">Activities</Text>
                {plan.activities.map((a) => (
                  <View key={a.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center">
                    <Text className="text-lg mr-3">✅</Text>
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-gray-900">{a.name}</Text>
                      <Text className="text-xs text-gray-400">{a.frequency}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {plan.providerNotes && (
              <View className="mx-5 mt-4 bg-blue-50 rounded-xl p-4">
                <Text className="text-xs font-medium text-blue-700 mb-1">Provider Notes</Text>
                <Text className="text-sm text-blue-900">{plan.providerNotes}</Text>
              </View>
            )}
          </>
        ) : (
          <View className="mx-5 bg-white rounded-2xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-3">📋</Text>
            <Text className="text-base font-medium text-gray-700">No care plan yet</Text>
            <Text className="text-sm text-gray-400 mt-1">Your provider will create a care plan for you.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
