import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { getUser, getToken, logout, type PatientUser } from '../services/auth';
import {
  initTerra,
  connectAppleHealth,
  disconnectAppleHealth,
  isAppleHealthConnected,
} from '../services/terra';

const TERRA_DEV_ID = 'YOUR_TERRA_DEV_ID';

interface Props {
  onLogout: () => void;
}

export default function HomeScreen({ onLogout }: Props) {
  const [user, setUser] = useState<PatientUser | null>(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const [u, conn] = await Promise.all([
        getUser(),
        isAppleHealthConnected(),
      ]);
      setUser(u);
      setConnected(conn);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    initTerra(TERRA_DEV_ID).then(loadState);
  }, [loadState]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const token = await getToken();
      if (!token) {
        Alert.alert('Error', 'Please log in again');
        return;
      }

      const terraUser = await connectAppleHealth(token);
      if (terraUser) {
        setConnected(true);
        Alert.alert(
          'Connected!',
          'Apple Health is now syncing your health data automatically.'
        );
      }
    } catch (err) {
      Alert.alert(
        'Connection Failed',
        err instanceof Error ? err.message : 'Please try again'
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Apple Health',
      'This will stop syncing your health data. You can reconnect anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectAppleHealth();
              setConnected(false);
            } catch (err) {
              Alert.alert('Error', 'Failed to disconnect. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleLogout = async () => {
    await logout();
    onLogout();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadState();
          }}
        />
      }
    >
      <Text style={styles.greeting}>
        Hi, {user?.firstName || 'there'} 👋
      </Text>

      {/* Connection Status Card */}
      <View
        style={[
          styles.statusCard,
          connected ? styles.statusConnected : styles.statusDisconnected,
        ]}
      >
        <Text style={styles.statusEmoji}>
          {connected ? '🍎' : '⌚'}
        </Text>
        <Text style={styles.statusTitle}>
          {connected ? 'Apple Health Connected' : 'Connect Apple Health'}
        </Text>
        <Text style={styles.statusDesc}>
          {connected
            ? 'Your health data is syncing automatically in the background.'
            : 'Sync weight, exercise, sleep, heart rate, steps, and more with your care team.'}
        </Text>

        <TouchableOpacity
          style={[
            styles.actionButton,
            connected ? styles.disconnectButton : styles.connectButton,
          ]}
          onPress={connected ? handleDisconnect : handleConnect}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actionButtonText}>
              {connected ? 'Disconnect' : 'Connect Now'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Data Types */}
      {connected && (
        <View style={styles.dataSection}>
          <Text style={styles.sectionTitle}>Syncing Data</Text>
          {[
            { emoji: '⚖️', label: 'Weight & Body Composition' },
            { emoji: '🏃', label: 'Exercise & Workouts' },
            { emoji: '😴', label: 'Sleep Duration & Quality' },
            { emoji: '❤️', label: 'Heart Rate' },
            { emoji: '👣', label: 'Daily Steps' },
            { emoji: '💧', label: 'Water Intake' },
            { emoji: '🍽️', label: 'Nutrition' },
          ].map((item) => (
            <View key={item.label} style={styles.dataRow}>
              <Text style={styles.dataEmoji}>{item.emoji}</Text>
              <Text style={styles.dataLabel}>{item.label}</Text>
              <Text style={styles.dataCheck}>✓</Text>
            </View>
          ))}
        </View>
      )}

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  statusCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  statusConnected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusDisconnected: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statusEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  statusDesc: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  connectButton: {
    backgroundColor: '#4F46E5',
  },
  disconnectButton: {
    backgroundColor: '#EF4444',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dataSection: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 16,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  dataEmoji: {
    fontSize: 20,
    width: 32,
  },
  dataLabel: {
    flex: 1,
    fontSize: 15,
    color: '#374151',
  },
  dataCheck: {
    fontSize: 16,
    color: '#10B981',
    fontWeight: '600',
  },
  logoutButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 40,
  },
  logoutText: {
    fontSize: 15,
    color: '#EF4444',
    fontWeight: '500',
  },
});
