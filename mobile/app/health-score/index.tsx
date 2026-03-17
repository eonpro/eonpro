import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface Metric {
  id: string; name: string; value: string | number; unit: string;
  target: number; trend: 'up' | 'down' | 'stable'; trendValue: string; score: number; lastUpdated: string;
}

interface HealthScoreData {
  overallScore: number;
  previousScore: number | null;
  metrics: Metric[];
  insights: string[];
}

const TREND_ICONS = { up: '↑', down: '↓', stable: '→' };

export default function HealthScoreScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const score = usePortalQuery<HealthScoreData>(['health-score-detail'], '/api/patient-portal/health-score');
  const onRefresh = useCallback(async () => { setRefreshing(true); await score.refetch(); setRefreshing(false); }, [score]);

  const data = score.data;
  const scoreColor = (s: number) => s >= 80 ? '#10B981' : s >= 60 ? '#F59E0B' : '#EF4444';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Health Score</Text>

        {data && (
          <>
            {/* Overall Score */}
            <View className="mx-5 bg-white rounded-2xl p-6 shadow-sm mb-4 items-center">
              <View className="w-24 h-24 rounded-full items-center justify-center border-4"
                style={{ borderColor: scoreColor(data.overallScore) }}>
                <Text className="text-3xl font-bold" style={{ color: scoreColor(data.overallScore) }}>
                  {data.overallScore}
                </Text>
              </View>
              <Text className="text-sm text-gray-500 mt-2">out of 100</Text>
            </View>

            {/* Metrics */}
            <View className="px-5">
              <Text className="text-lg font-semibold text-gray-900 mb-3">Breakdown</Text>
              {data.metrics.map((m) => (
                <View key={m.id} className="bg-white rounded-2xl p-4 shadow-sm mb-3">
                  <View className="flex-row items-center justify-between mb-2">
                    <Text className="text-sm font-semibold text-gray-900">{m.name}</Text>
                    <View className="flex-row items-center">
                      <Text className="text-sm font-bold mr-1" style={{ color: scoreColor(m.score) }}>{m.score}</Text>
                      <Text className="text-xs" style={{ color: m.trend === 'up' ? '#10B981' : m.trend === 'down' ? '#EF4444' : '#6B7280' }}>
                        {TREND_ICONS[m.trend]} {m.trendValue}
                      </Text>
                    </View>
                  </View>
                  <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <View className="h-full rounded-full" style={{ width: `${m.score}%`, backgroundColor: scoreColor(m.score) }} />
                  </View>
                  <View className="flex-row justify-between mt-1.5">
                    <Text className="text-xs text-gray-400">{m.value} {m.unit}</Text>
                    <Text className="text-xs text-gray-400">Target: {m.target} {m.unit}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* Insights */}
            {data.insights.length > 0 && (
              <View className="px-5 mt-4">
                <Text className="text-lg font-semibold text-gray-900 mb-3">Insights</Text>
                {data.insights.map((insight, i) => (
                  <View key={i} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-start">
                    <Text className="text-sm mr-2">💡</Text>
                    <Text className="text-sm text-gray-700 flex-1">{insight}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
