import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useState, useCallback } from 'react';
import * as DocumentPicker from 'expo-image-picker';
import { useBrandColors } from '@/lib/branding';
import { usePortalQuery } from '@/hooks/usePortalQuery';
import { appConfig } from '@/lib/config';
import { tokenStorage } from '@/lib/auth';
import { SkeletonList } from '@/components/ui/Skeleton';

interface Document {
  id: number;
  filename: string;
  mimeType: string;
  category: string;
  source: string | null;
  createdAt: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  MEDICAL_RECORDS: '📋', LAB_RESULTS: '🔬', INSURANCE: '🏥',
  CONSENT_FORMS: '✍️', PRESCRIPTIONS: '💊', ID_PHOTO: '🪪',
  MEDICAL_INTAKE_FORM: '📝', IMAGING: '🩻', OTHER: '📄',
};

export default function DocumentsScreen() {
  const colors = useBrandColors();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);

  const docs = usePortalQuery<{ documents: Document[] }>(
    ['documents'],
    '/api/patient-portal/documents'
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await docs.refetch();
    setRefreshing(false);
  }, [docs]);

  async function handleUpload() {
    // Using image picker for document upload as expo-document-picker may not be installed
    Alert.alert('Upload Document', 'Choose a source', [
      {
        text: 'Camera', onPress: async () => {
          const result = await DocumentPicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!result.canceled && result.assets[0]) await uploadFile(result.assets[0]);
        }
      },
      {
        text: 'Photo Library', onPress: async () => {
          const result = await DocumentPicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
          if (!result.canceled && result.assets[0]) await uploadFile(result.assets[0]);
        }
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function uploadFile(asset: DocumentPicker.ImagePickerAsset) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', {
        uri: asset.uri,
        type: asset.mimeType ?? 'image/jpeg',
        name: asset.fileName ?? 'document.jpg',
      } as unknown as Blob);
      formData.append('category', 'OTHER');

      const token = await tokenStorage.getAccessToken();
      const response = await fetch(`${appConfig.apiBaseUrl}/api/patient-portal/documents`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Upload failed');
      Alert.alert('Uploaded', 'Document saved successfully.');
      await docs.refetch();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to upload');
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50" edges={['top']}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>
        <View className="px-5 pt-4 pb-2 flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: colors.primary }} className="text-base font-medium">← Back</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleUpload} disabled={uploading}
            className="rounded-lg px-3 py-1.5" style={{ backgroundColor: colors.primary }}>
            {uploading ? <ActivityIndicator color={colors.primaryText} size="small" /> :
              <Text className="text-xs font-semibold" style={{ color: colors.primaryText }}>Upload</Text>}
          </TouchableOpacity>
        </View>
        <Text className="text-2xl font-bold text-gray-900 px-5 mb-4">Documents</Text>

        <View className="px-5">
          {docs.isLoading ? <SkeletonList count={4} /> : (docs.data?.documents?.length ?? 0) > 0 ? (
            docs.data!.documents.map((doc) => (
              <View key={doc.id} className="bg-white rounded-xl p-4 shadow-sm mb-2 flex-row items-center">
                <Text className="text-lg mr-3">{CATEGORY_ICONS[doc.category] ?? '📄'}</Text>
                <View className="flex-1">
                  <Text className="text-sm font-medium text-gray-900" numberOfLines={1}>{doc.filename}</Text>
                  <Text className="text-xs text-gray-400 capitalize mt-0.5">{doc.category.replace(/_/g, ' ').toLowerCase()}</Text>
                </View>
                <Text className="text-xs text-gray-400">{formatDate(doc.createdAt)}</Text>
              </View>
            ))
          ) : (
            <View className="bg-white rounded-2xl p-8 shadow-sm items-center">
              <Text className="text-4xl mb-3">📄</Text>
              <Text className="text-base font-medium text-gray-700">No documents</Text>
              <Text className="text-sm text-gray-400 mt-1">Upload documents using the button above.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}
