import { useEffect, useState } from 'react';
import { View, Text, Animated } from 'react-native';
import { subscribeToNetworkChanges, isOnline as checkOnline } from '@/lib/offline';

export default function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [opacity] = useState(new Animated.Value(0));

  useEffect(() => {
    checkOnline().then(setOnline);
    const unsub = subscribeToNetworkChanges((connected) => {
      setOnline(connected);
      Animated.timing(opacity, {
        toValue: connected ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    });
    return unsub;
  }, [opacity]);

  if (online) return null;

  return (
    <Animated.View
      style={{ opacity }}
      className="bg-yellow-500 px-4 py-2 items-center"
    >
      <Text className="text-xs font-medium text-yellow-900">
        You're offline. Some features may be limited.
      </Text>
    </Animated.View>
  );
}
