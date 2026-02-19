import React, { useState, useEffect } from 'react';
import { SafeAreaView, StyleSheet, StatusBar } from 'react-native';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import { isLoggedIn } from './src/services/auth';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    isLoggedIn().then(setAuthenticated);
  }, []);

  if (authenticated === null) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F9FAFB" />
      {authenticated ? (
        <HomeScreen onLogout={() => setAuthenticated(false)} />
      ) : (
        <LoginScreen onLoginSuccess={() => setAuthenticated(true)} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
});
