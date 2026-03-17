import { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import '../global.css';

import AuthProvider from '@/components/AuthProvider';
import BrandingProvider from '@/components/BrandingProvider';
import QueryProvider from '@/components/QueryProvider';
import { useAuth } from '@/lib/auth-context';
import { registerForPushNotifications, registerDeviceToken, addNotificationResponseListener } from '@/lib/notifications';
import { replayMutationQueue, subscribeToNetworkChanges } from '@/lib/offline';
import { apiFetch } from '@/lib/api-client';
import OfflineBanner from '@/components/ui/OfflineBanner';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace('/(tabs)/home');
    }
  }, [isAuthenticated, isLoading, segments]);

  // Register for push notifications when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    async function setupPush() {
      const token = await registerForPushNotifications();
      if (token) {
        await registerDeviceToken(token);
      }
    }
    setupPush();

    const sub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.url && typeof data.url === 'string') {
        router.push(data.url as never);
      }
    });

    return () => sub.remove();
  }, [isAuthenticated]);

  // Replay queued mutations when back online
  useEffect(() => {
    if (!isAuthenticated) return;
    const unsub = subscribeToNetworkChanges(async (connected) => {
      if (connected) {
        await replayMutationQueue(apiFetch);
      }
    });
    return unsub;
  }, [isAuthenticated]);

  return (
    <>
      <OfflineBanner />
      {children}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryProvider>
      <BrandingProvider>
        <AuthProvider>
          <AuthGate>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="appointments" options={{ presentation: 'card' }} />
              <Stack.Screen name="shipment" options={{ presentation: 'card' }} />
              <Stack.Screen name="refill" options={{ presentation: 'card' }} />
              <Stack.Screen name="injection-tracker" options={{ presentation: 'card' }} />
              <Stack.Screen name="notifications" options={{ presentation: 'card' }} />
              <Stack.Screen name="support" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings" options={{ presentation: 'card' }} />
              <Stack.Screen name="photos" options={{ presentation: 'card' }} />
              <Stack.Screen name="calculators" options={{ presentation: 'card' }} />
              <Stack.Screen name="health-score" options={{ presentation: 'card' }} />
              <Stack.Screen name="documents" options={{ presentation: 'card' }} />
              <Stack.Screen name="bloodwork" options={{ presentation: 'card' }} />
              <Stack.Screen name="billing" options={{ presentation: 'card' }} />
              <Stack.Screen name="care-plan" options={{ presentation: 'card' }} />
              <Stack.Screen name="care-team" options={{ presentation: 'card' }} />
              <Stack.Screen name="resources" options={{ presentation: 'card' }} />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </BrandingProvider>
    </QueryProvider>
  );
}
