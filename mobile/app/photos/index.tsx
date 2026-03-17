import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { apiFetch } from '@/lib/api-client';
import { appConfig } from '@/lib/config';

interface Photo {
  id: number;
  type: string;
  category: string | null;
  s3Url: string;
  thumbnailUrl: string | null;
  title: string | null;
  weight: number | null;
  takenAt: string;
}

export default function PhotosScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const photos = usePortalQuery<{ photos: Photo[] }>(
    ['photos'],
    '/api/patient-portal/photos?limit=50'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await photos.refetch();
    setRefreshing(false);
  }, [photos]);

  async function handleTakePhoto() {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission Required', 'Camera access is needed to take progress photos.');
        return;
      }
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0]);
    }
  }

  async function handlePickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });

    if (!result.canceled && result.assets[0]) {
      await uploadPhoto(result.assets[0]);
    }
  }

  async function uploadPhoto(asset: ImagePicker.ImagePickerAsset) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? 'photo.jpg',
      } as unknown as Blob);
      formData.append('type', 'PROGRESS');
      formData.append('uploadedFrom', 'mobile');
      if (asset.width) formData.append('width', String(asset.width));
      if (asset.height) formData.append('height', String(asset.height));

      const response = await fetch(
        `${appConfig.apiBaseUrl}/api/patient-portal/photos/upload-direct`,
        {
          method: 'POST',
          body: formData,
          headers: {
            Authorization: `Bearer ${(await import('@/lib/auth')).tokenStorage.getAccessToken()}`,
          },
        }
      );

      if (!response.ok) throw new Error('Upload failed');
      Alert.alert('Uploaded', 'Your photo has been saved.');
      await photos.refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to upload photo');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
        </View>

        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Progress Photos</Text>

        {/* Upload Actions */}
        <View className="flex-row px-5 gap-3 mb-6">
          <TouchableOpacity onPress={handleTakePhoto} disabled={uploading}
            className="flex-1 rounded-2xl py-4 items-center" style={{ backgroundColor: colors.primary, opacity: uploading ? 0.7 : 1 }}>
            {uploading ? <ActivityIndicator color={colors.primaryText} /> :
              <><Text style={{ fontSize: 20 }}>📸</Text>
              <Text className="text-sm font-semibold mt-1" style={{ color: colors.primaryText }}>Take Photo</Text></>}
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePickPhoto} disabled={uploading}
            className="flex-1 rounded-2xl py-4 items-center border border-gray-200 bg-white">
            <Text style={{ fontSize: 20 }}>🖼️</Text>
            <Text className="text-sm font-semibold mt-1 text-gray-700">From Gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Photo Grid */}
        <View className="px-5">
          {(photos.data?.photos?.length ?? 0) > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {photos.data!.photos.map((photo) => (
                <View key={photo.id} className="rounded-xl overflow-hidden" style={{ width: '31.5%', aspectRatio: 3/4 }}>
                  <Image
                    source={{ uri: `${appConfig.apiBaseUrl}${photo.thumbnailUrl ?? photo.s3Url}` }}
                    style={{ width: '100%', height: '100%' }}
                    contentFit="cover"
                  />
                  {photo.weight && (
                    <View className="absolute bottom-1 left-1 bg-black/60 rounded-md px-1.5 py-0.5">
                      <Text className="text-[10px] text-white font-medium">{photo.weight} lbs</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">📸</Text>
              <Text className="text-base font-medium text-gray-700">No photos yet</Text>
              <Text className="text-sm text-gray-400 mt-1 text-center">Take a progress photo to track your transformation.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
