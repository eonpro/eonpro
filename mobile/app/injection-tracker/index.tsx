import { View, Text, ScrollView, TouchableOpacity, Alert, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useBrandColors } from '@/lib/branding';

const STORAGE_KEY = 'injection-history';

interface InjectionEntry {
  id: string;
  date: string;
  site: string;
  dose: string;
  medication: string;
  notes: string;
}

const INJECTION_SITES = [
  'Left Abdomen',
  'Right Abdomen',
  'Left Thigh',
  'Right Thigh',
  'Left Arm',
  'Right Arm',
];

export default function InjectionTrackerScreen() {
  const colors = useBrandColors();
  const router = useRouter();

  const [history, setHistory] = useState<InjectionEntry[]>([]);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [site, setSite] = useState('');
  const [dose, setDose] = useState('');
  const [medication, setMedication] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {
      // Graceful fallback
    }
  }

  async function saveHistory(entries: InjectionEntry[]) {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      setHistory(entries);
    } catch {
      Alert.alert('Error', 'Failed to save injection data.');
    }
  }

  const handleLog = useCallback(async () => {
    if (!site || !dose) {
      Alert.alert('Required', 'Please select an injection site and enter the dose.');
      return;
    }

    const entry: InjectionEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      site,
      dose,
      medication: medication || 'Not specified',
      notes,
    };

    const updated = [entry, ...history];
    await saveHistory(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Reset form
    setSite('');
    setDose('');
    setMedication('');
    setNotes('');
    setShowForm(false);
  }, [site, dose, medication, notes, history]);

  function handleDelete(id: string) {
    Alert.alert('Delete Entry', 'Remove this injection log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = history.filter((e) => e.id !== id);
          await saveHistory(updated);
        },
      },
    ]);
  }

  // Suggest next site based on rotation
  const lastSite = history[0]?.site;
  const suggestedSite = lastSite
    ? INJECTION_SITES[(INJECTION_SITES.indexOf(lastSite) + 1) % INJECTION_SITES.length]
    : INJECTION_SITES[0];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-2xl font-bold text-gray-900">Injection Tracker</Text>
            {!showForm && (
              <TouchableOpacity
                onPress={() => { setShowForm(true); setSite(suggestedSite); }}
                className="rounded-lg px-3 py-1.5"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>+ Log</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Log Form */}
        {showForm && (
          <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
            <Text className="text-base font-semibold text-gray-900 mb-4">Log Injection</Text>

            {/* Site Selection */}
            <Text className="text-sm font-medium text-gray-700 mb-2">Injection Site</Text>
            <View className="flex-row flex-wrap gap-2 mb-4">
              {INJECTION_SITES.map((s) => (
                <TouchableOpacity
                  key={s}
                  onPress={() => setSite(s)}
                  className="rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: site === s ? colors.primary : '#F3F4F6',
                    borderWidth: s === suggestedSite && site !== s ? 1 : 0,
                    borderColor: colors.primary,
                  }}
                >
                  <Text
                    className="text-xs font-medium"
                    style={{ color: site === s ? colors.primaryText : '#4B5563' }}
                  >
                    {s} {s === suggestedSite && site !== s ? '(next)' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Dose */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Dose</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="e.g., 0.25 mg"
              placeholderTextColor="#9CA3AF"
              value={dose}
              onChangeText={setDose}
            />

            {/* Medication */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Medication</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-3"
              placeholder="e.g., Semaglutide"
              placeholderTextColor="#9CA3AF"
              value={medication}
              onChangeText={setMedication}
            />

            {/* Notes */}
            <Text className="text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</Text>
            <TextInput
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
              placeholder="Any side effects or observations..."
              placeholderTextColor="#9CA3AF"
              value={notes}
              onChangeText={setNotes}
              multiline
              maxLength={300}
            />

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                className="flex-1 rounded-xl py-3.5 items-center border border-gray-200"
              >
                <Text className="text-sm font-medium text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleLog}
                className="flex-1 rounded-xl py-3.5 items-center"
                style={{ backgroundColor: colors.primary }}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* History */}
        <View className="px-5 mt-6">
          <Text className="text-lg font-semibold text-gray-900 mb-3">
            History ({history.length})
          </Text>

          {history.length > 0 ? (
            history.map((entry) => (
              <TouchableOpacity
                key={entry.id}
                onLongPress={() => handleDelete(entry.id)}
                className="bg-white rounded-2xl p-5 shadow-sm mb-3"
              >
                <View className="flex-row items-start justify-between">
                  <View className="flex-1">
                    <Text className="text-base font-semibold text-gray-900">{entry.medication}</Text>
                    <Text className="text-sm text-gray-600 mt-0.5">{entry.dose} — {entry.site}</Text>
                    {entry.notes ? (
                      <Text className="text-sm text-gray-400 mt-1">{entry.notes}</Text>
                    ) : null}
                  </View>
                  <Text className="text-xs text-gray-400">{formatDate(entry.date)}</Text>
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">💉</Text>
              <Text className="text-base font-medium text-gray-700">No injections logged</Text>
              <Text className="text-sm text-gray-400 mt-1 text-center">
                Tap "+ Log" to record your first injection.
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
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return iso;
  }
}
