import { View, Text, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import StatusBadge from '@/components/ui/StatusBadge';

interface Shipment {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  step: number;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string | null;
  items: Array<{ name: string; strength: string | null; quantity: number }>;
  orderedAt: string | null;
  shippedAt: string | null;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  lastUpdate: string | null;
  lastLocation: string | null;
  isRefill: boolean;
  refillNumber: number | null;
  patientConfirmedAt: string | null;
  canConfirmReceipt: boolean;
}

const STEP_LABELS = ['Ordered', 'Processing', 'Shipped', 'In Transit', 'Delivered'];

export default function ShipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useBrandColors();

  const tracking = usePortalQuery<{ activeShipments: Shipment[]; deliveredShipments: Shipment[] }>(
    ['tracking'],
    '/api/patient-portal/tracking'
  );

  const shipment = [
    ...(tracking.data?.activeShipments ?? []),
    ...(tracking.data?.deliveredShipments ?? []),
  ].find((s) => s.id === id);

  async function handleConfirmReceipt() {
    Alert.alert('Confirm Receipt', 'Have you received this shipment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes, Received',
        onPress: async () => {
          try {
            await apiFetch('/api/patient-portal/shipments/confirm-receipt', {
              method: 'POST',
              body: JSON.stringify({ shipmentId: id }),
            });
            await tracking.refetch();
          } catch {
            Alert.alert('Error', 'Failed to confirm receipt.');
          }
        },
      },
    ]);
  }

  if (!shipment) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-500">Shipment not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-2xl font-bold text-gray-900">{shipment.orderNumber}</Text>
            <StatusBadge status={shipment.status} label={shipment.statusLabel} />
          </View>
        </View>

        {/* Progress Timeline */}
        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <Text className="text-sm font-semibold text-gray-700 mb-4">Delivery Progress</Text>
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const isActive = stepNum <= shipment.step;
            const isCurrent = stepNum === shipment.step;
            return (
              <View key={label} className="flex-row items-start mb-1">
                <View className="items-center mr-3" style={{ width: 24 }}>
                  <View
                    className="w-5 h-5 rounded-full items-center justify-center"
                    style={{ backgroundColor: isActive ? colors.primary : '#E5E7EB' }}
                  >
                    {isActive && <Text style={{ color: colors.primaryText, fontSize: 10 }}>✓</Text>}
                  </View>
                  {i < STEP_LABELS.length - 1 && (
                    <View
                      className="w-0.5 h-6"
                      style={{ backgroundColor: isActive ? colors.primary : '#E5E7EB' }}
                    />
                  )}
                </View>
                <View className="flex-1 pb-3">
                  <Text
                    className={`text-sm ${isCurrent ? 'font-semibold' : 'font-medium'}`}
                    style={{ color: isActive ? '#1F2937' : '#9CA3AF' }}
                  >
                    {label}
                  </Text>
                  {isCurrent && shipment.lastLocation && (
                    <Text className="text-xs text-gray-400 mt-0.5">{shipment.lastLocation}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Items */}
        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Items</Text>
          {shipment.items.map((item, i) => (
            <View key={i} className="flex-row justify-between py-2 border-b border-gray-50">
              <Text className="text-sm text-gray-900">
                {item.name} {item.strength && `(${item.strength})`}
              </Text>
              <Text className="text-sm text-gray-500">Qty: {item.quantity}</Text>
            </View>
          ))}
        </View>

        {/* Details */}
        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Shipping Details</Text>
          <DetailRow label="Carrier" value={shipment.carrier || '—'} />
          <DetailRow label="Tracking #" value={shipment.trackingNumber || '—'} />
          {shipment.orderedAt && <DetailRow label="Ordered" value={formatDate(shipment.orderedAt)} />}
          {shipment.shippedAt && <DetailRow label="Shipped" value={formatDate(shipment.shippedAt)} />}
          {shipment.estimatedDelivery && <DetailRow label="Est. Delivery" value={formatDate(shipment.estimatedDelivery)} />}
          {shipment.deliveredAt && <DetailRow label="Delivered" value={formatDate(shipment.deliveredAt)} />}
          {shipment.isRefill && <DetailRow label="Refill" value={`#${shipment.refillNumber ?? ''}`} isLast />}
        </View>

        {/* Actions */}
        <View className="mx-5 mt-6 gap-3">
          {shipment.trackingUrl && (
            <TouchableOpacity
              onPress={() => Linking.openURL(shipment.trackingUrl!)}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
                Track with {shipment.carrier}
              </Text>
            </TouchableOpacity>
          )}
          {shipment.canConfirmReceipt && (
            <TouchableOpacity
              onPress={handleConfirmReceipt}
              className="rounded-xl py-4 items-center border border-gray-200"
            >
              <Text className="text-base font-medium" style={{ color: colors.primary }}>
                Confirm Receipt
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View className={`flex-row justify-between py-2.5 ${isLast ? '' : 'border-b border-gray-50'}`}>
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900">{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
