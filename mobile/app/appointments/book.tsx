import { View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { calendarDateStringInDeviceTimezone } from '@/lib/calendar-date';

interface AppointmentType {
  id: number;
  name: string;
  description: string | null;
  duration: number;
  price: number | null;
}

interface Provider {
  id: number;
  firstName: string;
  lastName: string;
  titleLine: string | null;
}

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  providerId: number;
}

type Step = 'type' | 'provider' | 'slot' | 'confirm';

export default function BookAppointmentScreen() {
  const colors = useBrandColors();
  const router = useRouter();

  const [step, setStep] = useState<Step>('type');
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return calendarDateStringInDeviceTimezone(d);
  });
  const [submitting, setSubmitting] = useState(false);

  const types = usePortalQuery<{ appointmentTypes: AppointmentType[] }>(
    ['appointment-types'],
    '/api/patient-portal/appointments?action=appointment-types'
  );

  const providers = usePortalQuery<{ providers: Provider[] }>(
    ['appointment-providers'],
    '/api/patient-portal/appointments?action=providers',
    { enabled: step === 'provider' || step === 'slot' }
  );

  const slots = usePortalQuery<{ slots: TimeSlot[] }>(
    ['appointment-slots', String(selectedProvider?.id), selectedDate],
    `/api/patient-portal/appointments?action=available-slots&providerId=${selectedProvider?.id}&date=${selectedDate}&duration=${selectedType?.duration ?? 30}`,
    { enabled: !!selectedProvider && (step === 'slot') }
  );

  const handleBook = useCallback(async () => {
    if (!selectedProvider || !selectedSlot || !selectedType) return;
    setSubmitting(true);
    try {
      await apiFetch('/api/patient-portal/appointments', {
        method: 'POST',
        body: JSON.stringify({
          providerId: selectedProvider.id,
          startTime: selectedSlot.startTime,
          appointmentTypeId: selectedType.id,
          duration: selectedType.duration,
          type: 'VIDEO',
        }),
      });
      Alert.alert('Booked!', 'Your appointment has been scheduled.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to book appointment');
    } finally {
      setSubmitting(false);
    }
  }, [selectedProvider, selectedSlot, selectedType, router]);

  // Generate date options (next 14 days)
  const dateOptions = Array.from({ length: 14 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return calendarDateStringInDeviceTimezone(d);
  });

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <View className="px-5 pt-4 pb-2">
        <TouchableOpacity onPress={() => (step === 'type' ? router.back() : setStep(step === 'confirm' ? 'slot' : step === 'slot' ? 'provider' : 'type'))}>
          <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
        </TouchableOpacity>
        <Text className="text-2xl font-bold text-gray-900 mt-2">Book Appointment</Text>
        <Text className="text-sm text-gray-500">
          Step {step === 'type' ? 1 : step === 'provider' ? 2 : step === 'slot' ? 3 : 4} of 4
        </Text>
      </View>

      <ScrollView className="flex-1 px-5 pt-4">
        {/* Step 1: Choose Type */}
        {step === 'type' && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3">Select appointment type</Text>
            {types.data?.appointmentTypes?.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => { setSelectedType(t); setStep('provider'); }}
                className="bg-white rounded-2xl p-5 shadow-sm mb-3"
              >
                <Text className="text-base font-semibold text-gray-900">{t.name}</Text>
                {t.description && <Text className="text-sm text-gray-500 mt-1">{t.description}</Text>}
                <Text className="text-xs text-gray-400 mt-2">{t.duration} min</Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Step 2: Choose Provider */}
        {step === 'provider' && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3">Select provider</Text>
            {providers.data?.providers?.map((p) => (
              <TouchableOpacity
                key={p.id}
                onPress={() => { setSelectedProvider(p); setStep('slot'); }}
                className="bg-white rounded-2xl p-5 shadow-sm mb-3"
              >
                <Text className="text-base font-semibold text-gray-900">
                  Dr. {p.firstName} {p.lastName}
                </Text>
                {p.titleLine && <Text className="text-sm text-gray-500 mt-0.5">{p.titleLine}</Text>}
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Step 3: Choose Date & Slot */}
        {step === 'slot' && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3">Select date & time</Text>
            {/* Date picker */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              {dateOptions.map((d) => {
                const isSelected = d === selectedDate;
                const dateObj = new Date(d + 'T12:00:00');
                return (
                  <TouchableOpacity
                    key={d}
                    onPress={() => setSelectedDate(d)}
                    className="mr-2 rounded-xl px-4 py-3 items-center"
                    style={{ backgroundColor: isSelected ? colors.primary : '#ffffff', minWidth: 64 }}
                  >
                    <Text className="text-xs font-medium" style={{ color: isSelected ? colors.primaryText : '#6B7280' }}>
                      {dateObj.toLocaleDateString(undefined, { weekday: 'short' })}
                    </Text>
                    <Text className="text-lg font-bold mt-0.5" style={{ color: isSelected ? colors.primaryText : '#1F2937' }}>
                      {dateObj.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time slots */}
            {slots.isLoading ? (
              <ActivityIndicator color={colors.primary} className="py-8" />
            ) : (slots.data?.slots?.filter((s) => s.available).length ?? 0) > 0 ? (
              <View className="flex-row flex-wrap gap-2">
                {slots.data!.slots.filter((s) => s.available).map((s, i) => {
                  const isSelected = selectedSlot?.startTime === s.startTime;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => { setSelectedSlot(s); setStep('confirm'); }}
                      className="rounded-xl px-4 py-3"
                      style={{ backgroundColor: isSelected ? colors.primary : '#ffffff', borderWidth: 1, borderColor: isSelected ? colors.primary : '#E5E7EB' }}
                    >
                      <Text className="text-sm font-medium" style={{ color: isSelected ? colors.primaryText : '#1F2937' }}>
                        {new Date(s.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text className="text-sm text-gray-500 text-center py-8">No available slots for this date.</Text>
            )}
          </>
        )}

        {/* Step 4: Confirm */}
        {step === 'confirm' && selectedType && selectedProvider && selectedSlot && (
          <>
            <Text className="text-base font-semibold text-gray-900 mb-3">Confirm booking</Text>
            <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
              <DetailRow label="Type" value={selectedType.name} />
              <DetailRow label="Provider" value={`Dr. ${selectedProvider.firstName} ${selectedProvider.lastName}`} />
              <DetailRow label="Date" value={new Date(selectedSlot.startTime).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} />
              <DetailRow label="Time" value={new Date(selectedSlot.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} />
              <DetailRow label="Duration" value={`${selectedType.duration} min`} isLast />
            </View>
            <TouchableOpacity
              onPress={handleBook}
              disabled={submitting}
              className="rounded-xl py-4 items-center"
              style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? (
                <ActivityIndicator color={colors.primaryText} />
              ) : (
                <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
                  Confirm Appointment
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
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
