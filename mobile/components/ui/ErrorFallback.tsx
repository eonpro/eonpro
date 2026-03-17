import { View, Text, TouchableOpacity } from 'react-native';
import { useBrandColors } from '@/lib/branding';

interface Props {
  error: Error;
  retry?: () => void;
}

export default function ErrorFallback({ error, retry }: Props) {
  const colors = useBrandColors();

  return (
    <View className="flex-1 items-center justify-center px-8 bg-gray-50">
      <Text className="text-4xl mb-4">⚠️</Text>
      <Text className="text-lg font-bold text-gray-900 text-center mb-2">
        Something went wrong
      </Text>
      <Text className="text-sm text-gray-500 text-center mb-6">
        {error.message || 'An unexpected error occurred. Please try again.'}
      </Text>
      {retry && (
        <TouchableOpacity
          onPress={retry}
          className="rounded-xl px-6 py-3"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-medium" style={{ color: colors.primaryText }}>
            Try Again
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
