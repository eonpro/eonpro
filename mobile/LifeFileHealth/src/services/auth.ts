/**
 * Authentication service — manages patient login and token storage.
 * Patients log in with the same credentials as the web portal.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'patient_token';
const USER_KEY = 'patient_user';

const API_BASE = __DEV__
  ? 'http://localhost:3000'
  : 'https://app.eonpro.io';

export interface PatientUser {
  id: number;
  email: string;
  patientId: number;
  firstName: string;
  lastName: string;
  clinicId: number;
}

export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: PatientUser }> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Login failed');
  }

  const data = await res.json();
  const { token, user } = data;

  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));

  return { token, user };
}

export async function logout(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getUser(): Promise<PatientUser | null> {
  const raw = await AsyncStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PatientUser;
  } catch {
    return null;
  }
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getToken();
  return !!token;
}
