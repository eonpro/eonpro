import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { apiFetch } from './api-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId,
  });

  return tokenData.data;
}

export async function registerDeviceToken(expoPushToken: string): Promise<void> {
  try {
    await apiFetch('/api/patient-portal/push-subscription', {
      method: 'POST',
      body: JSON.stringify({
        subscription: {
          endpoint: expoPushToken,
          keys: { p256dh: 'expo', auth: 'expo' },
          platform: 'ios',
          type: 'expo',
        },
      }),
    });
  } catch {
    // Non-critical: push registration failure shouldn't block the app
  }
}

export async function unregisterDeviceToken(expoPushToken: string): Promise<void> {
  try {
    await apiFetch('/api/patient-portal/push-subscription', {
      method: 'DELETE',
      body: JSON.stringify({ endpoint: expoPushToken }),
    });
  } catch {
    // Non-critical
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}
