import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { appConfig } from './config';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const BIOMETRIC_ENABLED_KEY = 'biometric_enabled';
const USER_KEY = 'user_data';

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
    return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  },

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
  },

  async clearTokens(): Promise<void> {
    await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  },

  async getUser(): Promise<AuthUser | null> {
    const raw = await SecureStore.getItemAsync(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  async setUser(user: AuthUser): Promise<void> {
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
  },
};

export const biometrics = {
  async isAvailable(): Promise<boolean> {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) return false;
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return enrolled;
  },

  async isEnabled(): Promise<boolean> {
    const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  },

  async setEnabled(enabled: boolean): Promise<void> {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async authenticate(promptMessage?: string): Promise<boolean> {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: promptMessage ?? 'Authenticate to continue',
      fallbackLabel: 'Use password',
      disableDeviceFallback: false,
    });
    return result.success;
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
