import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth-context';
import { useBrandColors, useBrandTheme, usePortalFeatures } from '@/lib/branding';

interface MenuItemProps {
  label: string;
  emoji: string;
  onPress: () => void;
}

function MenuItem({ label, emoji, onPress }: MenuItemProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="flex-row items-center bg-white px-5 py-4 border-b border-gray-50"
    >
      <Text className="text-lg mr-3">{emoji}</Text>
      <Text className="text-base text-gray-900 flex-1">{label}</Text>
      <Text className="text-gray-300">›</Text>
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const { signOut, user } = useAuth();
  const colors = useBrandColors();
  const features = usePortalFeatures();
  const { clinic } = useBrandTheme();
  const router = useRouter();

  function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1">
        {/* Profile Header */}
        <View className="px-5 pt-4 pb-5">
          <Text className="text-2xl font-bold text-gray-900">More</Text>
        </View>

        <View className="bg-white rounded-2xl mx-5 mb-4 p-5 shadow-sm">
          <View className="w-14 h-14 rounded-full items-center justify-center mb-3" style={{ backgroundColor: colors.primaryLight }}>
            <Text className="text-2xl font-bold" style={{ color: colors.primary }}>
              {user?.name?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text className="text-lg font-semibold text-gray-900">{user?.name ?? 'Patient'}</Text>
          <Text className="text-sm text-gray-500">{user?.email}</Text>
        </View>

        {/* Menu Items */}
        <View className="bg-white rounded-2xl mx-5 mb-4 overflow-hidden shadow-sm">
          {features.showAppointments && (
            <MenuItem label="Appointments" emoji="📅" onPress={() => {}} />
          )}
          {features.showCarePlan && (
            <MenuItem label="Care Plan" emoji="📋" onPress={() => {}} />
          )}
          {features.showCareTeam && (
            <MenuItem label="Care Team" emoji="👨‍⚕️" onPress={() => {}} />
          )}
          {features.showDocuments && (
            <MenuItem label="Documents" emoji="📄" onPress={() => {}} />
          )}
          {features.showLabResults && (
            <MenuItem label="Lab Results" emoji="🔬" onPress={() => {}} />
          )}
          {features.showBilling && (
            <MenuItem label="Billing" emoji="💳" onPress={() => {}} />
          )}
          {features.showResources && (
            <MenuItem label="Resources" emoji="📚" onPress={() => {}} />
          )}
          <MenuItem label="Support" emoji="🎧" onPress={() => {}} />
          <MenuItem label="Settings" emoji="⚙️" onPress={() => {}} />
        </View>

        {/* Support Info */}
        {(clinic.supportEmail || clinic.supportPhone) && (
          <View className="mx-5 mb-4 px-4 py-3 bg-gray-100 rounded-xl">
            <Text className="text-xs text-gray-500 font-medium mb-1">Need help?</Text>
            {clinic.supportEmail && (
              <Text className="text-xs text-gray-600">{clinic.supportEmail}</Text>
            )}
            {clinic.supportPhone && (
              <Text className="text-xs text-gray-600">{clinic.supportPhone}</Text>
            )}
          </View>
        )}

        {/* Sign Out */}
        <View className="mx-5 mb-8">
          <TouchableOpacity
            onPress={handleSignOut}
            className="bg-white rounded-2xl py-4 items-center shadow-sm"
          >
            <Text className="text-base font-medium text-red-500">Sign Out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
