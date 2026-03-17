import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface LabResult {
  id: number; testName: string; value: string; valueNumeric: number | null;
  unit: string | null; referenceRange: string | null; flag: string | null; category: string | null;
}

interface ReportData {
  id: number; labName: string; collectedAt: string | null; reportedAt: string | null; fasting: boolean | null;
  results: LabResult[];
  summary: { total: number; optimal: number; inRange: number; outOfRange: number };
}

const FLAG_COLORS = { H: { bg: '#FEE2E2', text: '#DC2626' }, L: { bg: '#DBEAFE', text: '#2563EB' } };

export default function BloodworkReportScreen() {
  const { reportId } = useLocalSearchParams<{ reportId: string }>();
  const colors = useBrandColors();
  const router = useRouter();

  const report = usePortalQuery<ReportData>(['bloodwork', reportId], `/api/patient-portal/bloodwork/${reportId}`);
  const data = report.data;

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>

        {data && (
          <>
            <Text className="text-2xl font-bold text-gray-900 px-5">{data.labName}</Text>
            {data.collectedAt && <Text className="text-sm text-gray-500 px-5 mt-1">Collected: {formatDate(data.collectedAt)}</Text>}

            {/* Summary */}
            <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm flex-row justify-around">
              <SummaryItem label="Total" value={data.summary.total} color="#6B7280" />
              <SummaryItem label="In Range" value={data.summary.inRange} color="#10B981" />
              <SummaryItem label="Out of Range" value={data.summary.outOfRange} color="#EF4444" />
            </View>

            {/* Results */}
            <View className="px-5 mt-4">
              <Text className="text-lg font-semibold text-gray-900 mb-3">Results</Text>
              {data.results.map((r) => {
                const flagStyle = r.flag ? FLAG_COLORS[r.flag as keyof typeof FLAG_COLORS] : null;
                return (
                  <View key={r.id} className="bg-white rounded-xl p-4 shadow-sm mb-2">
                    <View className="flex-row items-start justify-between">
                      <View className="flex-1 mr-3">
                        <Text className="text-sm font-medium text-gray-900">{r.testName}</Text>
                        {r.category && <Text className="text-xs text-gray-400 mt-0.5">{r.category}</Text>}
                      </View>
                      <View className="items-end">
                        <View className="flex-row items-center">
                          <Text className="text-sm font-bold text-gray-900">{r.value}</Text>
                          {r.unit && <Text className="text-xs text-gray-500 ml-1">{r.unit}</Text>}
                          {flagStyle && (
                            <View className="ml-1.5 rounded-full px-1.5 py-0.5" style={{ backgroundColor: flagStyle.bg }}>
                              <Text className="text-[10px] font-bold" style={{ color: flagStyle.text }}>{r.flag}</Text>
                            </View>
                          )}
                        </View>
                        {r.referenceRange && <Text className="text-xs text-gray-400 mt-0.5">Ref: {r.referenceRange}</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="items-center">
      <Text className="text-xl font-bold" style={{ color }}>{value}</Text>
      <Text className="text-xs text-gray-500">{label}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
