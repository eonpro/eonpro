import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface UpcomingRefill {
  id: number;
  status: string;
  statusLabel: string;
  medication: string;
  strength: string | null;
  plan: string;
  nextRefillDate: string | null;
  isEarlyRequest: boolean;
  paymentStatus: string;
  approvalStatus: string;
}

interface PastRefill {
  id: number;
  status: string;
  medication: string;
  strength: string | null;
  prescribedAt: string | null;
  orderStatus: string | undefined;
  trackingNumber: string | null;
}

interface RefillData {
  canRequestEarly: boolean;
  hasPendingRefills: boolean;
  upcomingRefills: UpcomingRefill[];
  pastRefills: PastRefill[];
}

export default function RefillRequestScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refills = usePortalQuery<RefillData>(
    ['refill-request'],
    '/api/patient-portal/refill-request'
  );

  const handleRequestRefill = useCallback(async () => {
    setSubmitting(true);
    try {
      await apiFetch('/api/patient-portal/refill-request', {
        method: 'POST',
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      });
      Alert.alert('Request Submitted', 'Your refill request has been submitted for review.', [
        { text: 'OK', onPress: () => { refills.refetch(); setNotes(''); } },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to submit refill request');
    } finally {
      setSubmitting(false);
    }
  }, [notes, refills]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 mt-2">Refill Request</Text>
        </View>

        {refills.isLoading ? (
          <View className="px-5"><SkeletonList count={2} /></View>
        ) : (
          <>
            {/* Early Refill Request */}
            {refills.data?.canRequestEarly && !refills.data.hasPendingRefills && (
              <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
                <Text className="text-base font-semibold text-gray-900 mb-2">Request Early Refill</Text>
                <Text className="text-sm text-gray-500 mb-3">
                  Need your medication sooner? Submit a request and your care team will review it.
                </Text>
                <TextInput
                  className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
                  placeholder="Optional notes for your care team..."
                  placeholderTextColor="#9CA3AF"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  maxLength={500}
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  onPress={handleRequestRefill}
                  disabled={submitting}
                  className="rounded-xl py-3.5 items-center"
                  style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.primaryText} />
                  ) : (
                    <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
                      Submit Refill Request
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {refills.data?.hasPendingRefills && (
              <View className="mx-5 mt-4 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
                <Text className="text-sm text-yellow-700">You have a pending refill request under review.</Text>
              </View>
            )}

            {/* Upcoming Refills */}
            {(refills.data?.upcomingRefills?.length ?? 0) > 0 && (
              <View className="px-5 mt-6">
                <Text className="text-lg font-semibold text-gray-900 mb-3">Upcoming Refills</Text>
                {refills.data!.upcomingRefills.map((r) => (
                  <View key={r.id} className="bg-white rounded-2xl p-5 shadow-sm mb-3">
                    <View className="flex-row items-start justify-between mb-1">
                      <Text className="text-base font-semibold text-gray-900">{r.medication}</Text>
                      <StatusBadge status={r.approvalStatus} />
                    </View>
                    {r.strength && <Text className="text-sm text-gray-500">{r.strength}</Text>}
                    {r.nextRefillDate && (
                      <Text className="text-xs text-gray-400 mt-2">
                        Next refill: {formatDate(r.nextRefillDate)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Past Refills */}
            {(refills.data?.pastRefills?.length ?? 0) > 0 && (
              <View className="px-5 mt-6">
                <Text className="text-lg font-semibold text-gray-900 mb-3">Past Refills</Text>
                {refills.data!.pastRefills.map((r) => (
                  <View key={r.id} className="bg-white rounded-2xl p-5 shadow-sm mb-3">
                    <Text className="text-base font-medium text-gray-900">{r.medication}</Text>
                    {r.strength && <Text className="text-sm text-gray-500">{r.strength}</Text>}
                    <View className="flex-row items-center gap-3 mt-2">
                      <StatusBadge status={r.status} />
                      {r.prescribedAt && (
                        <Text className="text-xs text-gray-400">{formatDate(r.prescribedAt)}</Text>
                      )}
                    </View>
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
