import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';

export default function HealthScreen() {
  const colors = useBrandColors();
  const features = usePortalFeatures();

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1 px-5 pt-4">
        <Text className="text-2xl font-bold text-gray-900 mb-6">Health</Text>

        <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-2">Progress Tracking</Text>
          <Text className="text-sm text-gray-500">
            Track your weight, water intake, exercise, sleep, and nutrition.
          </Text>
        </View>

        {features.showWeightTracking && (
          <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-2">Weight</Text>
            <Text className="text-sm text-gray-500">Log and track your weight over time.</Text>
          </View>
        )}

        {features.showProgressPhotos && (
          <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-2">Photos</Text>
            <Text className="text-sm text-gray-500">Take progress photos to see your transformation.</Text>
          </View>
        )}

        {features.showHealthScore && (
          <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
            <Text className="text-base font-semibold text-gray-900 mb-2">Health Score</Text>
            <Text className="text-sm text-gray-500">Your overall health score based on your activity.</Text>
          </View>
        )}

        <View className="bg-white rounded-2xl p-5 shadow-sm mb-4">
          <Text className="text-base font-semibold text-gray-900 mb-2">Calculators</Text>
          <Text className="text-sm text-gray-500">BMI, calorie, macro, and dose calculators.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
