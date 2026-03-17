import AsyncStorage from '@react-native-async-storage/async-storage';
import { appConfig } from './config';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const USER_KEY = 'user_data';

// expo-secure-store and expo-local-authentication require native builds.
// Use AsyncStorage as fallback in Expo Go for development.
let SecureStore: typeof import('expo-secure-store') | null = null;
let LocalAuthentication: typeof import('expo-local-authentication') | null = null;

try {
  SecureStore = require('expo-secure-store');
} catch {
  // Fallback to AsyncStorage in Expo Go
}

try {
  LocalAuthentication = require('expo-local-authentication');
} catch {
  // Biometrics unavailable in Expo Go
}

const storage = {
  async getItem(key: string): Promise<string | null> {
    try {
      if (SecureStore) return await SecureStore.getItemAsync(key);
    } catch { /* fallback */ }
    return AsyncStorage.getItem(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (SecureStore) { await SecureStore.setItemAsync(key, value); return; }
    } catch { /* fallback */ }
    await AsyncStorage.setItem(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    try {
      if (SecureStore) { await SecureStore.deleteItemAsync(key); return; }
    } catch { /* fallback */ }
    await AsyncStorage.removeItem(key);
  },
};

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: string;
  clinicId: number;
  patientId?: number;
}

export const tokenStorage = {
  async getAccessToken(): Promise<string | null> {
    return storage.getItem(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return storage.getItem(REFRESH_TOKEN_KEY);
  },

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    await storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  async clearTokens(): Promise<void> {
    await storage.deleteItem(ACCESS_TOKEN_KEY);
    await storage.deleteItem(REFRESH_TOKEN_KEY);
    await storage.deleteItem(USER_KEY);
  },

  async getUser(): Promise<AuthUser | null> {
    const raw = await storage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setUser(user: AuthUser): Promise<void> {
    await storage.setItem(USER_KEY, JSON.stringify(user));
  },
};

export const biometrics = {
  async isAvailable(): Promise<boolean> {
    if (!LocalAuthentication) return false;
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      if (!compatible) return false;
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return enrolled;
    } catch {
      return false;
    }
  },

  async isEnabled(): Promise<boolean> {
    const val = await storage.getItem(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await storage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async authenticate(promptMessage?: string): Promise<boolean> {
    if (!LocalAuthentication) return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: promptMessage ?? 'Authenticate to continue',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false,
      });
      return result.success;
    } catch {
      return false;
    }
  },
};

export interface LoginParams {
  email: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

export async function login({ email, password }: LoginParams): Promise<LoginResult> {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: 'patient',
        clinicId: appConfig.clinicId,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error || data.message || 'Login failed',
      };
    }

    const token = data.token || data.accessToken;
    const refreshToken = data.refreshToken || '';
    if (!token) {
      return { success: false, error: 'No token received' };
    }

    await tokenStorage.setTokens(token, refreshToken);

    const user: AuthUser = {
      id: data.user?.id ?? data.userId,
      email: data.user?.email ?? email,
      name: data.user?.name ?? data.user?.firstName ?? '',
      role: 'patient',
      clinicId: data.user?.clinicId ?? appConfig.clinicId,
      patientId: data.user?.patientId,
    };
    await tokenStorage.setUser(user);

    return { success: true, user };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

export async function logout(): Promise<void> {
  await tokenStorage.clearTokens();
}
