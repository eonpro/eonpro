import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useBrandColors, useBrandTheme } from '@/lib/branding';

export default function ResourcesScreen() {
  const colors = useBrandColors();
  const { clinic } = useBrandTheme();
  const router = useRouter();

  // Resources come from branding context (loaded at app start)
  const branding = useBrandTheme();
  const videos = (branding as unknown as { resourceVideos?: Array<{ id: string; title: string; description?: string; url: string; thumbnail?: string; category?: string }> }).resourceVideos ?? [];

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Resources</Text>

        <View className="px-5">
          {videos.length > 0 ? videos.map((v) => (
            <TouchableOpacity key={v.id} onPress={() => Linking.openURL(v.url)}
              className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
              {v.thumbnail && (
                <Image source={{ uri: v.thumbnail }} style={{ width: '100%', height: 180 }} contentFit="cover" />
              )}
              <View className="p-4">
                <Text className="text-base font-semibold text-gray-900">{v.title}</Text>
                {v.description && <Text className="text-sm text-gray-500 mt-1">{v.description}</Text>}
                {v.category && <Text className="text-xs text-gray-400 mt-2 capitalize">{v.category}</Text>}
              </View>
            </TouchableOpacity>
          )) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">📚</Text>
              <Text className="text-base font-medium text-gray-700">No resources available</Text>
              <Text className="text-sm text-gray-400 mt-1">Your clinic hasn't added any resources yet.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
