import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface HealthScoreData {
  overallScore: number;
  metrics: Array<{ id: string; name: string; value: string | number; score: number }>;
}

export default function HealthScreen() {
  const colors = useBrandColors();
  const features = usePortalFeatures();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const healthScore = usePortalQuery<HealthScoreData>(
    ['health-score'],
    '/api/patient-portal/health-score',
    { enabled: features.showHealthScore }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await healthScore.refetch();
    setRefreshing(false);
  }, [healthScore]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View className="px-5 pt-4 pb-2">
          <Text className="text-2xl font-bold text-gray-900">Health</Text>
        </View>

        {/* Health Score Card */}
        {features.showHealthScore && healthScore.data && (
          <TouchableOpacity
            onPress={() => router.push('/health-score')}
            className="mx-5 mt-2 mb-4 bg-white rounded-2xl p-5 shadow-sm"
          >
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-base font-semibold text-gray-900">Health Score</Text>
              <View className="w-12 h-12 rounded-full items-center justify-center" style={{ backgroundColor: colors.primaryLight }}>
                <Text className="text-lg font-bold" style={{ color: colors.primary }}>
                  {healthScore.data.overallScore}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-2">
              {healthScore.data.metrics.slice(0, 4).map((m) => (
                <View key={m.id} className="flex-1 bg-gray-50 rounded-lg p-2 items-center">
                  <Text className="text-xs text-gray-500">{m.name}</Text>
                  <Text className="text-sm font-semibold text-gray-900">{m.value}</Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        )}

        {/* Tracking Categories */}
        <View className="px-5">
          <Text className="text-lg font-semibold text-gray-900 mb-3">Track Progress</Text>
          <View className="flex-row flex-wrap gap-3">
            {features.showWeightTracking && (
              <TrackingCard label="Weight" emoji="⚖️" color={colors.primaryLight} textColor={colors.primary}
                onPress={() => router.push('/(tabs)/health/weight')} />
            )}
            {features.showWaterTracking && (
              <TrackingCard label="Water" emoji="💧" color="#DBEAFE" textColor="#2563EB"
                onPress={() => router.push('/(tabs)/health/water')} />
            )}
            {features.showExerciseTracking && (
              <TrackingCard label="Exercise" emoji="🏃" color="#FEF3C7" textColor="#D97706"
                onPress={() => router.push('/(tabs)/health/exercise')} />
            )}
            {features.showSleepTracking && (
              <TrackingCard label="Sleep" emoji="😴" color="#EDE9FE" textColor="#7C3AED"
                onPress={() => router.push('/(tabs)/health/sleep')} />
            )}
            <TrackingCard label="Nutrition" emoji="🥗" color="#D1FAE5" textColor="#047857"
              onPress={() => router.push('/(tabs)/health/nutrition')} />
          </View>
        </View>

        {/* Tools */}
        <View className="px-5 mt-6">
          <Text className="text-lg font-semibold text-gray-900 mb-3">Tools</Text>
          <View className="flex-row flex-wrap gap-3">
            {features.showProgressPhotos && (
              <TrackingCard label="Photos" emoji="📸" color="#FCE7F3" textColor="#DB2777"
                onPress={() => router.push('/photos')} />
            )}
            <TrackingCard label="Calculators" emoji="🧮" color="#F3F4F6" textColor="#4B5563"
              onPress={() => router.push('/calculators')} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function TrackingCard({ label, emoji, color, textColor, onPress }: {
  label: string; emoji: string; color: string; textColor: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-2xl p-4 items-center justify-center"
      style={{ backgroundColor: color, width: '47%', minHeight: 90 }}
    >
      <Text style={{ fontSize: 28, marginBottom: 4 }}>{emoji}</Text>
      <Text className="text-sm font-semibold" style={{ color: textColor }}>{label}</Text>
    </TouchableOpacity>
  );
}
