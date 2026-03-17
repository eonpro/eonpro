import { View, Text, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useBrandTheme } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';

interface VitalsData {
  latestWeight?: { value: number; unit: string; date: string };
  bmi?: number;
  weeklyChange?: number;
  totalLoss?: number;
}

interface ShipmentData {
  id: number;
  status: string;
  trackingNumber?: string;
  medicationName?: string;
  estimatedDelivery?: string;
}

export default function HomeScreen() {
  const { user } = useAuth();
  const { colors, logo, clinic } = useBrandTheme();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const vitals = usePortalQuery<VitalsData>(
    ['vitals'],
    '/api/patient-portal/vitals'
  );

  const shipments = usePortalQuery<{ shipments: ShipmentData[] }>(
    ['shipments'],
    '/api/patient-portal/tracking'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([vitals.refetch(), shipments.refetch()]);
    setRefreshing(false);
  }, [vitals, shipments]);

  const firstName = user?.name?.split(' ')[0] ?? 'there';

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View className="px-5 pt-4 pb-6">
          <View className="flex-row items-center justify-between mb-1">
            <View>
              <Text className="text-sm text-gray-500">Good {getGreeting()},</Text>
              <Text className="text-2xl font-bold text-gray-900">{firstName}</Text>
            </View>
            {logo.icon ? (
              <Image
                source={{ uri: logo.icon }}
                style={{ width: 40, height: 40, borderRadius: 8 }}
                contentFit="contain"
              />
            ) : null}
          </View>
          {clinic.dashboardMessage && (
            <View className="mt-3 rounded-xl px-4 py-3" style={{ backgroundColor: colors.primaryLight }}>
              <Text className="text-sm" style={{ color: colors.primary }}>
                {clinic.dashboardMessage}
              </Text>
            </View>
          )}
        </View>

        {/* Vitals Card */}
        <View className="px-5 mb-4">
          <View className="bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-base font-semibold text-gray-900 mb-3">Your Vitals</Text>
            {vitals.data?.latestWeight ? (
              <View className="flex-row justify-between">
                <VitalItem
                  label="Weight"
                  value={`${vitals.data.latestWeight.value}`}
                  unit={vitals.data.latestWeight.unit}
                  color={colors.primary}
                />
                {vitals.data.bmi != null && (
                  <VitalItem label="BMI" value={vitals.data.bmi.toFixed(1)} color={colors.secondary} />
                )}
                {vitals.data.weeklyChange != null && (
                  <VitalItem
                    label="This Week"
                    value={`${vitals.data.weeklyChange > 0 ? '+' : ''}${vitals.data.weeklyChange.toFixed(1)}`}
                    unit="lbs"
                    color={vitals.data.weeklyChange <= 0 ? '#10B981' : '#EF4444'}
                  />
                )}
              </View>
            ) : (
              <Text className="text-sm text-gray-400">No vitals recorded yet</Text>
            )}
          </View>
        </View>

        {/* Active Shipment */}
        {shipments.data?.shipments?.[0] && (
          <View className="px-5 mb-4">
            <View className="bg-white rounded-2xl p-5 shadow-sm">
              <Text className="text-base font-semibold text-gray-900 mb-2">Active Shipment</Text>
              <View className="flex-row items-center justify-between">
                <View>
                  <Text className="text-sm text-gray-700">
                    {shipments.data.shipments[0].medicationName ?? 'Medication'}
                  </Text>
                  <Text className="text-xs text-gray-400 mt-0.5">
                    {shipments.data.shipments[0].status}
                  </Text>
                </View>
                <TouchableOpacity
                  className="rounded-lg px-3 py-1.5"
                  style={{ backgroundColor: colors.primaryLight }}
                  onPress={() => router.push('/(tabs)/meds')}
                >
                  <Text className="text-xs font-medium" style={{ color: colors.primary }}>
                    Track
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Quick Actions */}
        <View className="px-5 mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">Quick Actions</Text>
          <View className="flex-row flex-wrap gap-3">
            <QuickAction
              label="Log Weight"
              emoji="⚖️"
              color={colors.primaryLight}
              textColor={colors.primary}
              onPress={() => router.push('/(tabs)/health')}
            />
            <QuickAction
              label="Medications"
              emoji="💊"
              color={colors.primaryLight}
              textColor={colors.primary}
              onPress={() => router.push('/(tabs)/meds')}
            />
            <QuickAction
              label="Chat"
              emoji="💬"
              color={colors.primaryLight}
              textColor={colors.primary}
              onPress={() => router.push('/(tabs)/chat')}
            />
            <QuickAction
              label="Support"
              emoji="🎧"
              color={colors.primaryLight}
              textColor={colors.primary}
              onPress={() => router.push('/(tabs)/more')}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function VitalItem({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <View className="items-center">
      <Text className="text-xs text-gray-500 mb-1">{label}</Text>
      <Text className="text-xl font-bold" style={{ color }}>
        {value}
      </Text>
      {unit && <Text className="text-xs text-gray-400">{unit}</Text>}
    </View>
  );
}

function QuickAction({
  label,
  emoji,
  color,
  textColor,
  onPress,
}: {
  label: string;
  emoji: string;
  color: string;
  textColor: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="rounded-xl p-4 items-center"
      style={{ backgroundColor: color, width: '47%' }}
    >
      <Text style={{ fontSize: 24, marginBottom: 4 }}>{emoji}</Text>
      <Text className="text-sm font-medium" style={{ color: textColor }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
