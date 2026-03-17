import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface Medication {
  id: number;
  name: string | null;
  strength: string | null;
  form: string | null;
  quantity: number | null;
  directions: string | null;
  daysSupply: number | null;
  medicationKey: string | null;
}

interface Prescription {
  id: number;
  status: string;
  prescribedDate: string;
  provider: { name: string };
  medications: Medication[];
  shipping: { status: string; trackingNumber: string | null };
}

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const colors = useBrandColors();

  const { data } = usePortalQuery<{ prescriptions: Prescription[] }>(
    ['prescriptions'],
    '/api/patient-portal/prescriptions'
  );

  const med = data?.prescriptions
    ?.flatMap((rx) => rx.medications.map((m) => ({ ...m, rx })))
    .find((m) => String(m.id) === id);

  if (!med) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50 items-center justify-center">
        <Text className="text-gray-500">Medication not found</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Header */}
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()} className="mb-3">
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900">{med.name ?? 'Medication'}</Text>
          {med.strength && (
            <Text className="text-base text-gray-500 mt-1">{med.strength} {med.form}</Text>
          )}
        </View>

        {/* Directions */}
        {med.directions && (
          <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Directions</Text>
            <Text className="text-base text-gray-900 leading-6">{med.directions}</Text>
          </View>
        )}

        {/* Details */}
        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          <Text className="text-sm font-semibold text-gray-700 mb-3">Details</Text>
          <DetailRow label="Quantity" value={med.quantity != null ? String(med.quantity) : '—'} />
          <DetailRow label="Days Supply" value={med.daysSupply != null ? `${med.daysSupply} days` : '—'} />
          <DetailRow label="Form" value={med.form ?? '—'} />
          <DetailRow label="Prescribed by" value={`Dr. ${med.rx.provider.name}`} />
          <DetailRow label="Date Prescribed" value={formatDate(med.rx.prescribedDate)} />
          <DetailRow label="Status" value={med.rx.status} isLast />
        </View>

        {/* Shipping */}
        {med.rx.shipping.trackingNumber && (
          <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-sm font-semibold text-gray-700 mb-2">Shipping</Text>
            <DetailRow label="Status" value={med.rx.shipping.status} />
            <DetailRow label="Tracking" value={med.rx.shipping.trackingNumber ?? '—'} isLast />
          </View>
        )}

        {/* Actions */}
        <View className="mx-5 mt-6 gap-3">
          <TouchableOpacity
            onPress={() => router.push('/refill')}
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
              Request Refill
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/injection-tracker')}
            className="rounded-xl py-4 items-center border border-gray-200"
          >
            <Text className="text-base font-medium" style={{ color: colors.primary }}>
              Injection Tracker
            </Text>
          </TouchableOpacity>
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
    return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}
