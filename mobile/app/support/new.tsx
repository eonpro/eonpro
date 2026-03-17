import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { apiFetch } from '@/lib/api-client';

const CATEGORIES = [
  { id: 'GENERAL', label: 'General Inquiry' },
  { id: 'BILLING', label: 'Billing' },
  { id: 'PRESCRIPTION', label: 'Prescription' },
  { id: 'APPOINTMENT', label: 'Appointment' },
  { id: 'PORTAL_ACCESS', label: 'Portal Access' },
  { id: 'OTHER', label: 'Other' },
];

export default function NewTicketScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('GENERAL');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title for your ticket.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe your issue.');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/api/patient-portal/tickets', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          category,
        }),
      });
      Alert.alert('Submitted', 'Your support ticket has been created.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setSubmitting(false);
    }
  }, [title, description, category, router]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <Text className="text-2xl font-bold text-gray-900 mt-2">New Support Ticket</Text>
        </View>

        <View className="mx-5 mt-4 bg-white rounded-2xl p-5 shadow-sm">
          {/* Category */}
          <Text className="text-sm font-medium text-gray-700 mb-2">Category</Text>
          <View className="flex-row flex-wrap gap-2 mb-5">
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setCategory(c.id)}
                className="rounded-lg px-3 py-2"
                style={{
                  backgroundColor: category === c.id ? colors.primary : '#F3F4F6',
                }}
              >
                <Text
                  className="text-xs font-medium"
                  style={{ color: category === c.id ? colors.primaryText : '#4B5563' }}
                >
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text className="text-sm font-medium text-gray-700 mb-1.5">Title</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-4"
            placeholder="Brief summary of your issue"
            placeholderTextColor="#9CA3AF"
            value={title}
            onChangeText={setTitle}
            maxLength={200}
          />

          {/* Description */}
          <Text className="text-sm font-medium text-gray-700 mb-1.5">Description</Text>
          <TextInput
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 mb-5"
            placeholder="Please describe your issue in detail..."
            placeholderTextColor="#9CA3AF"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={6}
            maxLength={2000}
            textAlignVertical="top"
            style={{ minHeight: 120 }}
          />

          {/* Submit */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            className="rounded-xl py-4 items-center"
            style={{ backgroundColor: colors.primary, opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? (
              <ActivityIndicator color={colors.primaryText} />
            ) : (
              <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
                Submit Ticket
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
