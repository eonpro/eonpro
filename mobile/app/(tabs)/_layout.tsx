import { Tabs } from 'expo-router';
import { Platform, View, Text } from 'react-native';
import { useBrandColors, usePortalFeatures } from '@/lib/branding';

function TabIcon({ name, focused, color }: { name: string; focused: boolean; color: string }) {
  const icons: Record<string, string> = {
    home: '🏠',
    health: '💚',
    meds: '💊',
    chat: '💬',
    more: '☰',
  };
  return (
    <View className="items-center justify-center">
      <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{icons[name] ?? '•'}</Text>
    </View>
  );
}

export default function TabLayout() {
  const colors = useBrandColors();
  const features = usePortalFeatures();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#F3F4F6',
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="home" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="health"
        options={{
          title: 'Health',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="health" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="meds"
        options={{
          title: 'Meds',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="meds" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          href: features.showChat ? undefined : null,
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="chat" focused={focused} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon name="more" focused={focused} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
