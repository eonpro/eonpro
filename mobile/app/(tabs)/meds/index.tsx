import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface Medication {
  id: number;
  medName: string;
  strength?: string;
  form?: string;
  sig?: string;
}

export default function MedsScreen() {
  const colors = useBrandColors();
  const features = usePortalFeatures();
  const [refreshing, setRefreshing] = useState(false);

  const meds = usePortalQuery<{ prescriptions: Medication[] }>(
    ['prescriptions'],
    '/api/patient-portal/prescriptions'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await meds.refetch();
    setRefreshing(false);
  }, [meds]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1 px-5 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <Text className="text-2xl font-bold text-gray-900 mb-6">Medications</Text>

        {meds.data?.prescriptions?.length ? (
          meds.data.prescriptions.map((med) => (
            <View key={med.id} className="bg-white rounded-2xl p-5 shadow-sm mb-3">
              <Text className="text-base font-semibold text-gray-900">{med.medName}</Text>
              {med.strength && (
                <Text className="text-sm text-gray-500 mt-0.5">{med.strength} {med.form}</Text>
              )}
              {med.sig && (
                <Text className="text-sm text-gray-400 mt-1">{med.sig}</Text>
              )}
            </View>
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

        {features.showShipmentTracking && (
          <View className="mt-6">
            <Text className="text-lg font-semibold text-gray-900 mb-3">Shipments</Text>
            <View className="bg-white rounded-2xl p-5 shadow-sm">
              <Text className="text-sm text-gray-500">Your shipment tracking will appear here.</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
