/**
 * Terra SDK wrapper for Apple HealthKit integration.
 *
 * The terra-react SDK handles:
 *  - HealthKit permission prompts
 *  - Background delivery registration
 *  - Data upload to Terra's cloud (which then fires our webhook)
 *
 * This file initialises the SDK and exposes hooks for connection status.
 */

import Terra, {
  Connections,
  CustomPermissions,
  type TerraUser,
} from 'terra-react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TERRA_DEV_ID_KEY = 'terra_dev_id';
const TERRA_USER_KEY = 'terra_user';
const API_BASE = __DEV__
  ? 'http://localhost:3000'
  : 'https://app.eonpro.io';

interface AuthTokenResponse {
  token: string;
}

async function fetchAuthToken(
  patientToken: string
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/patient-portal/devices/mobile-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${patientToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get Terra auth token: ${res.status}`);
  }

  const data: AuthTokenResponse = await res.json();
  return data.token;
}

export async function initTerra(devId: string): Promise<void> {
  await AsyncStorage.setItem(TERRA_DEV_ID_KEY, devId);

  await Terra.initTerra(
    devId,
    'lifefile-health://terra-callback'
  );
}

export async function connectAppleHealth(
  patientToken: string
): Promise<TerraUser | null> {
  const token = await fetchAuthToken(patientToken);

  const customPermissions: CustomPermissions[] = [
    CustomPermissions.STEPS,
    CustomPermissions.HEART_RATE,
    CustomPermissions.HEART_RATE_VARIABILITY,
    CustomPermissions.CALORIES,
    CustomPermissions.DISTANCE,
    CustomPermissions.SLEEP_ANALYSIS,
    CustomPermissions.EXERCISE_TIME,
    CustomPermissions.WEIGHT,
    CustomPermissions.BODY_FAT_PERCENTAGE,
    CustomPermissions.BMI,
    CustomPermissions.WATER,
    CustomPermissions.DIETARY_ENERGY,
  ];

  const user = await Terra.initConnection(
    Connections.APPLE_HEALTH,
    token,
    true, // schedulerOn — enables background delivery
    customPermissions
  );

  if (user) {
    await AsyncStorage.setItem(TERRA_USER_KEY, JSON.stringify(user));
  }

  return user;
}

export async function disconnectAppleHealth(): Promise<void> {
  await Terra.deauthTerraUser(Connections.APPLE_HEALTH);
  await AsyncStorage.removeItem(TERRA_USER_KEY);
}

export async function getSavedUser(): Promise<TerraUser | null> {
  const raw = await AsyncStorage.getItem(TERRA_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TerraUser;
  } catch {
    return null;
  }
}

export async function isAppleHealthConnected(): Promise<boolean> {
  const user = await getSavedUser();
  return !!user;
}
