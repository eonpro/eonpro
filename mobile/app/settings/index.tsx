import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useBrandColors } from '@/lib/branding';
import { useAuth } from '@/lib/auth-context';
import { biometrics } from '@/lib/auth';
import { apiFetch } from '@/lib/api-client';
import { Switch } from 'react-native';

interface UserProfile {
  id: number; firstName: string; lastName: string; email: string; phone: string;
  dateOfBirth: string | null;
  address: { street: string; city: string; state: string; zip: string } | null;
}

export default function SettingsScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [bioEnabled, setBioEnabled] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const bio = await biometrics.isEnabled();
      setBioEnabled(bio);
      try {
        const data = await apiFetch<UserProfile>('/api/user/profile');
        setProfile(data);
      } catch { /* non-critical */ }
      setLoading(false);
    }
    load();
  }, []);

  const toggleBiometric = useCallback(async () => {
    if (!bioEnabled) {
      const available = await biometrics.isAvailable();
      if (!available) {
        Alert.alert('Not Available', 'Face ID / Touch ID is not set up on this device.');
        return;
      }
      const success = await biometrics.authenticate('Enable biometric login');
      if (success) {
        await biometrics.setEnabled(true);
        setBioEnabled(true);
      }
    } else {
      await biometrics.setEnabled(false);
      setBioEnabled(false);
    }
  }, [bioEnabled]);

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Settings</Text>

        {/* Profile */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">Profile</Text>
          {profile ? (
            <>
              <DetailRow label="Name" value={`${profile.firstName} ${profile.lastName}`} />
              <DetailRow label="Email" value={profile.email} />
              <DetailRow label="Phone" value={profile.phone || '—'} />
              <DetailRow label="Date of Birth" value={profile.dateOfBirth ? formatDate(profile.dateOfBirth) : '—'} />
              {profile.address && (
                <DetailRow label="Address" value={`${profile.address.street}, ${profile.address.city}, ${profile.address.state} ${profile.address.zip}`} isLast />
              )}
            </>
          ) : (
            <Text className="text-sm text-gray-400">Loading profile...</Text>
          )}
        </View>

        {/* Security */}
        <View className="mx-5 bg-white rounded-2xl p-5 shadow-sm mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-3">Security</Text>
          <View className="flex-row items-center justify-between py-2">
            <View className="flex-1 mr-4">
              <Text className="text-sm font-medium text-gray-900">Face ID / Touch ID</Text>
              <Text className="text-xs text-gray-500">Use biometrics to unlock the app</Text>
            </View>
            <Switch value={bioEnabled} onValueChange={toggleBiometric}
              trackColor={{ false: '#E5E7EB', true: colors.primary }} thumbColor="#ffffff" />
          </View>
        </View>

        {/* Preferences */}
        <View className="mx-5 bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <TouchableOpacity onPress={() => router.push('/settings/notifications')}
            className="flex-row items-center justify-between px-5 py-4 border-b border-gray-50">
            <Text className="text-sm font-medium text-gray-900">Notification Preferences</Text>
            <Text className="text-gray-300">›</Text>
          </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <View className="mx-5">
          <TouchableOpacity onPress={() => {
            Alert.alert('Sign Out', 'Are you sure?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign Out', style: 'destructive', onPress: signOut },
            ]);
          }} className="bg-white rounded-2xl py-4 items-center shadow-sm">
            <Text className="text-base font-medium text-red-500">Sign Out</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-xs text-gray-400 text-center mt-6 px-5">App version 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value, isLast }: { label: string; value: string; isLast?: boolean }) {
  return (
    <View className={`flex-row justify-between py-2 ${isLast ? '' : 'border-b border-gray-50'}`}>
      <Text className="text-sm text-gray-500">{label}</Text>
      <Text className="text-sm font-medium text-gray-900 flex-1 text-right ml-4" numberOfLines={2}>{value}</Text>
    </View>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
