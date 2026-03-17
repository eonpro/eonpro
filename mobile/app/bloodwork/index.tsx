import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { SkeletonList } from '@/components/ui/Skeleton';

interface LabReport {
  id: number; labName: string; specimenId: string | null;
  collectedAt: string | null; reportedAt: string | null;
  fasting: boolean | null; resultCount: number;
}

export default function BloodworkScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const reports = usePortalQuery<{ reports: LabReport[] }>(['bloodwork'], '/api/patient-portal/bloodwork');
  const onRefresh = useCallback(async () => { setRefreshing(true); await reports.refetch(); setRefreshing(false); }, [reports]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Lab Results</Text>

        <View className="px-5">
          {reports.isLoading ? <SkeletonList count={3} /> : (reports.data?.reports?.length ?? 0) > 0 ? (
            reports.data!.reports.map((r) => (
              <TouchableOpacity key={r.id} onPress={() => router.push(`/bloodwork/${r.id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm mb-3">
                <View className="flex-row items-start justify-between mb-1">
                  <Text className="text-base font-semibold text-gray-900">{r.labName}</Text>
                  <Text className="text-xs text-gray-400">{r.resultCount} results</Text>
                </View>
                {r.collectedAt && <Text className="text-sm text-gray-500">Collected: {formatDate(r.collectedAt)}</Text>}
                {r.fasting !== null && <Text className="text-xs text-gray-400 mt-1">{r.fasting ? 'Fasting' : 'Non-fasting'}</Text>}
              </TouchableOpacity>
            ))
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">🔬</Text>
              <Text className="text-base font-medium text-gray-700">No lab results</Text>
              <Text className="text-sm text-gray-400 mt-1">Your bloodwork results will appear here.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
