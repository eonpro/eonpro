import { View, Text, TouchableOpacity } from 'react-native';
import { useBrandColors } from '@/lib/branding';

interface Props {
  emoji: string;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ emoji, title, description, actionLabel, onAction }: Props) {
  const colors = useBrandColors();

  return (
    <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
      <Text style={{ fontSize: 40 }} className="mb-3">{emoji}</Text>
      <Text className="text-base font-medium text-gray-700 text-center">{title}</Text>
      <Text className="text-sm text-gray-400 mt-1 text-center">{description}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity
          onPress={onAction}
          className="mt-4 rounded-xl px-5 py-2.5"
          style={{ backgroundColor: colors.primaryLight }}
        >
          <Text className="text-sm font-medium" style={{ color: colors.primary }}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
