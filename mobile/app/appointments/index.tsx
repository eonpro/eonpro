import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import StatusBadge from '@/components/ui/StatusBadge';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Appointment {
  id: number;
  title: string | null;
  startTime: string;
  endTime: string;
  duration: number;
  type: 'IN_PERSON' | 'VIDEO' | 'PHONE';
  status: string;
  reason: string | null;
  location: string | null;
  videoLink: string | null;
  zoomJoinUrl: string | null;
  provider?: { id: number; firstName: string; lastName: string };
  appointmentType?: { name: string } | null;
}

export default function AppointmentsScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const upcoming = usePortalQuery<{ appointments: Appointment[] }>(
    ['appointments-upcoming'],
    '/api/patient-portal/appointments?upcoming=true'
  );

  const past = usePortalQuery<{ appointments: Appointment[] }>(
    ['appointments-past'],
    '/api/patient-portal/appointments?past=true',
    { enabled: tab === 'past' }
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await (tab === 'upcoming' ? upcoming.refetch() : past.refetch());
    setRefreshing(false);
  }, [tab, upcoming, past]);

  const appointments = tab === 'upcoming' ? upcoming : past;
  const isLoading = appointments.isLoading;
  const list = appointments.data?.appointments ?? [];

  function handleJoinTelehealth(apt: Appointment) {
    const url = apt.zoomJoinUrl ?? apt.videoLink;
    if (url) Linking.openURL(url);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push('/appointments/book')}
          className="rounded-lg px-3 py-1.5"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>Book</Text>
        </TouchableOpacity>
      </View>

      <Text className="text-2xl font-bold text-gray-900 px-5 mb-3">Appointments</Text>

      {/* Tabs */}
      <View className="flex-row mx-5 mb-4 bg-gray-100 rounded-xl p-1">
        {(['upcoming', 'past'] as const).map((t) => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            className="flex-1 py-2 rounded-lg items-center"
            style={{ backgroundColor: tab === t ? '#ffffff' : 'transparent' }}
          >
            <Text
              className="text-sm font-medium capitalize"
              style={{ color: tab === t ? colors.primary : '#9CA3AF' }}
            >
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        className="flex-1 px-5"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        {isLoading ? (
          <SkeletonList count={3} />
        ) : list.length > 0 ? (
          list.map((apt) => (
            <View key={apt.id} className="bg-white rounded-2xl p-5 shadow-sm mb-3">
              <View className="flex-row items-start justify-between mb-2">
                <View className="flex-1 mr-3">
                  <Text className="text-base font-semibold text-gray-900">
                    {apt.title ?? apt.appointmentType?.name ?? 'Appointment'}
                  </Text>
                  {apt.provider && (
                    <Text className="text-sm text-gray-500 mt-0.5">
                      Dr. {apt.provider.firstName} {apt.provider.lastName}
                    </Text>
                  )}
                </View>
                <StatusBadge status={apt.status} />
              </View>

              <View className="flex-row items-center gap-3 mt-1">
                <Text className="text-sm text-gray-600">
                  {formatDateTime(apt.startTime)}
                </Text>
                <Text className="text-xs text-gray-400">{apt.duration} min</Text>
                <Text className="text-xs text-gray-400 capitalize">{apt.type.toLowerCase().replace('_', ' ')}</Text>
              </View>

              {apt.location && (
                <Text className="text-sm text-gray-400 mt-1">{apt.location}</Text>
              )}

              {apt.type === 'VIDEO' && apt.status !== 'CANCELLED' && apt.status !== 'COMPLETED' && (
                <TouchableOpacity
                  onPress={() => handleJoinTelehealth(apt)}
                  className="mt-3 rounded-xl py-2.5 items-center"
                  style={{ backgroundColor: colors.primaryLight }}
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                    Join Video Visit
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        ) : (
          <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
            <Text className="text-4xl mb-3">📅</Text>
            <Text className="text-base font-medium text-gray-700">
              No {tab} appointments
            </Text>
            <Text className="text-sm text-gray-400 mt-1 text-center">
              {tab === 'upcoming'
                ? 'Book an appointment with your care team.'
                : 'Your past visits will appear here.'}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
