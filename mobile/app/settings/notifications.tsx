import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';

interface Preferences {
  emailReminders: boolean;
  smsReminders: boolean;
  shipmentUpdates: boolean;
  promotionalEmails: boolean;
  appointmentReminders: boolean;
}

const DEFAULT_PREFS: Preferences = {
  emailReminders: true,
  smsReminders: true,
  shipmentUpdates: true,
  promotionalEmails: false,
  appointmentReminders: true,
};

const PREF_LABELS: Record<keyof Preferences, { label: string; description: string }> = {
  emailReminders: { label: 'Email Reminders', description: 'Medication and appointment reminders via email' },
  smsReminders: { label: 'SMS Reminders', description: 'Text message reminders for medications and appointments' },
  shipmentUpdates: { label: 'Shipment Updates', description: 'Notifications when your shipment status changes' },
  appointmentReminders: { label: 'Appointment Reminders', description: 'Reminders before upcoming appointments' },
  promotionalEmails: { label: 'Promotional Emails', description: 'Special offers and health tips' },
};

export default function NotificationPreferencesScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFS);
  const [saving, setSaving] = useState(false);

  const { data } = usePortalQuery<{ preferences: Partial<Preferences> }>(
    ['notification-preferences'],
    '/api/patient-portal/notification-preferences'
  );

  useEffect(() => {
    if (data?.preferences) {
      setPrefs({ ...DEFAULT_PREFS, ...data.preferences });
    }
  }, [data]);

  const handleToggle = useCallback(async (key: keyof Preferences) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    try {
      await apiFetch('/api/patient-portal/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify({ preferences: updated }),
      });
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 mt-2">Notification Preferences</Text>
        </View>

        <View className="mx-5 mt-4 bg-white rounded-2xl shadow-sm overflow-hidden">
          {(Object.keys(PREF_LABELS) as Array<keyof Preferences>).map((key, i, arr) => (
            <View
              key={key}
              className={`flex-row items-center justify-between px-5 py-4 ${i < arr.length - 1 ? 'border-b border-gray-50' : ''}`}
            >
              <View className="flex-1 mr-4">
                <Text className="text-sm font-medium text-gray-900">{PREF_LABELS[key].label}</Text>
                <Text className="text-xs text-gray-500 mt-0.5">{PREF_LABELS[key].description}</Text>
              </View>
              <Switch
                value={prefs[key]}
                onValueChange={() => handleToggle(key)}
                trackColor={{ false: '#E5E7EB', true: colors.primary }}
                thumbColor="#ffffff"
                disabled={saving}
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
