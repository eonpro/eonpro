import { View, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useBrandColors } from '@/lib/branding';

export default function NotFoundScreen() {
  const router = useRouter();
  const colors = useBrandColors();

  return (
    <>
      <Stack.Screen options={{ title: 'Not Found' }} />
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-6xl mb-4">🔍</Text>
        <Text className="text-xl font-bold text-gray-900 mb-2">Page Not Found</Text>
        <Text className="text-sm text-gray-500 text-center mb-6">
          The page you're looking for doesn't exist or has been moved.
        </Text>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/home')}
          className="rounded-xl px-6 py-3"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-medium" style={{ color: colors.primaryText }}>
            Go Home
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
