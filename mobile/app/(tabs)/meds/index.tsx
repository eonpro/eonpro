import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Medication {
  id: number;
  medicationKey: string | null;
  name: string | null;
  strength: string | null;
  form: string | null;
  quantity: number | null;
  directions: string | null;
  daysSupply: number | null;
}

interface Prescription {
  id: number;
  status: string;
  prescribedDate: string;
  provider: { name: string };
  medications: Medication[];
  shipping: { status: string; trackingNumber: string | null };
}

interface Shipment {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  step: number;
  carrier: string;
  trackingNumber: string;
  items: Array<{ name: string; strength: string | null; quantity: number }>;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  canConfirmReceipt: boolean;
}

export default function MedsScreen() {
  const colors = useBrandColors();
  const features = usePortalFeatures();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const prescriptions = usePortalQuery<{ prescriptions: Prescription[] }>(
    ['prescriptions'],
    '/api/patient-portal/prescriptions'
  );

  const tracking = usePortalQuery<{ activeShipments: Shipment[]; deliveredShipments: Shipment[] }>(
    ['tracking'],
    '/api/patient-portal/tracking',
    { enabled: features.showShipmentTracking }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([prescriptions.refetch(), tracking.refetch()]);
    setRefreshing(false);
  }, [prescriptions, tracking]);

  const allMeds = prescriptions.data?.prescriptions?.flatMap((rx) =>
    rx.medications.map((med) => ({ ...med, prescriptionId: rx.id, providerName: rx.provider.name, rxStatus: rx.status }))
  ) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-gray-900">Medications</Text>
          <TouchableOpacity
            onPress={() => router.push('/refill')}
            className="rounded-lg px-3 py-1.5"
            style={{ backgroundColor: colors.primaryLight }}
          >
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>Request Refill</Text>
          </TouchableOpacity>
        </View>

        {/* Active Shipments */}
        {features.showShipmentTracking && (tracking.data?.activeShipments?.length ?? 0) > 0 && (
          <View className="px-5 mt-2 mb-4">
            {tracking.data!.activeShipments.map((shipment) => (
              <TouchableOpacity
                key={shipment.id}
                onPress={() => router.push(`/shipment?id=${shipment.id}`)}
                className="bg-white rounded-2xl p-4 shadow-sm mb-3"
              >
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-sm font-semibold text-gray-900">{shipment.orderNumber}</Text>
                  <StatusBadge status={shipment.status} label={shipment.statusLabel} />
                </View>
                {shipment.items.map((item, i) => (
                  <Text key={i} className="text-sm text-gray-600">
                    {item.name} {item.strength && `(${item.strength})`}
                  </Text>
                ))}
                {/* Progress Steps */}
                <View className="flex-row mt-3 gap-1">
                  {[1, 2, 3, 4, 5].map((step) => (
                    <View
                      key={step}
                      className="flex-1 h-1.5 rounded-full"
                      style={{ backgroundColor: step <= shipment.step ? colors.primary : '#E5E7EB' }}
                    />
                  ))}
                </View>
                {shipment.estimatedDelivery && (
                  <Text className="text-xs text-gray-400 mt-2">
                    Est. delivery: {formatDate(shipment.estimatedDelivery)}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Medications List */}
        <View className="px-5">
          {prescriptions.isLoading ? (
            <SkeletonList count={3} />
          ) : allMeds.length > 0 ? (
            allMeds.map((med) => (
              <TouchableOpacity
                key={med.id}
                onPress={() => router.push(`/(tabs)/meds/${med.id}`)}
                className="bg-white rounded-2xl p-5 shadow-sm mb-3"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-semibold text-gray-900">
                      {med.name ?? 'Medication'}
                    </Text>
                    {med.strength && (
                      <Text className="text-sm text-gray-500 mt-0.5">
                        {med.strength} {med.form}
                      </Text>
                    )}
                    {med.directions && (
                      <Text className="text-sm text-gray-400 mt-1.5">{med.directions}</Text>
                    )}
                  </View>
                  <Text className="text-gray-300 text-lg">›</Text>
                </View>
                <View className="flex-row items-center mt-3 gap-3">
                  {med.quantity != null && (
                    <Text className="text-xs text-gray-400">Qty: {med.quantity}</Text>
                  )}
                  {med.daysSupply != null && (
                    <Text className="text-xs text-gray-400">{med.daysSupply}-day supply</Text>
                  )}
                  <Text className="text-xs text-gray-400">Dr. {med.providerName}</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">💊</Text>
              <Text className="text-base font-medium text-gray-700">No medications yet</Text>
              <Text className="text-sm text-gray-400 mt-1 text-center">
                Your prescriptions will appear here once your provider adds them.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}
