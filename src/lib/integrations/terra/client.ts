import crypto from 'crypto';
import { logger } from '@/lib/logger';

const TERRA_BASE_URL = 'https://api.tryterra.co/v2';

function getConfig() {
  const apiKey = process.env.TERRA_API_KEY;
  const devId = process.env.TERRA_DEV_ID;
  const webhookSecret = process.env.TERRA_WEBHOOK_SECRET;

  if (!apiKey || !devId) {
    throw new Error('Terra API credentials not configured (TERRA_API_KEY, TERRA_DEV_ID)');
  }

  return { apiKey, devId, webhookSecret };
}

function getHeaders(): Record<string, string> {
  const { apiKey, devId } = getConfig();
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'dev-id': devId,
  };
}

export function verifyTerraSignature(
  payload: string,
  signature: string
): boolean {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) {
    logger.error('TERRA_WEBHOOK_SECRET not configured — rejecting webhook');
    return false;
  }
  const expected = crypto
    .createHmac('sha256', webhookSecret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch {
    return false;
  }
}

export interface WidgetSessionResponse {
  url: string;
  session_id: string;
  status: string;
}

/**
 * Generate a Terra widget session so the patient can authenticate
 * with their wearable provider (Fitbit, Garmin, Oura, etc.).
 * The widget handles the full OAuth flow.
 */
export async function generateWidgetSession(
  referenceId: string,
  providers?: string[],
  language?: string
): Promise<WidgetSessionResponse> {
  const body: Record<string, unknown> = {
    reference_id: referenceId,
    auth_success_redirect_url: `${process.env.NEXT_PUBLIC_PATIENT_PORTAL_PATH || ''}/patient-portal/devices?connected=true`,
    auth_failure_redirect_url: `${process.env.NEXT_PUBLIC_PATIENT_PORTAL_PATH || ''}/patient-portal/devices?connected=false`,
  };

  if (providers?.length) {
    body.providers = providers.join(',');
  }
  if (language) {
    body.language = language;
  }

  const res = await fetch(`${TERRA_BASE_URL}/auth/generateWidgetSession`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error('Terra generateWidgetSession failed', {
      status: res.status,
      body: errText,
    });
    throw new Error(`Terra widget session failed: ${res.status}`);
  }

  return res.json() as Promise<WidgetSessionResponse>;
}

export interface TerraUser {
  user_id: string;
  provider: string;
  last_webhook_update: string | null;
  scopes: string | null;
  reference_id: string | null;
}

/**
 * Get information about a Terra user.
 */
export async function getUser(terraUserId: string): Promise<TerraUser> {
  const res = await fetch(`${TERRA_BASE_URL}/userInfo?user_id=${terraUserId}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error('Terra getUser failed', {
      status: res.status,
      terraUserId,
      body: errText,
    });
    throw new Error(`Terra getUser failed: ${res.status}`);
  }

  const data = await res.json();
  return data.user as TerraUser;
}

/**
 * Deauthenticate a Terra user (disconnect their wearable).
 */
export async function deauthenticateUser(terraUserId: string): Promise<void> {
  const res = await fetch(`${TERRA_BASE_URL}/auth/deauthenticateUser`, {
    method: 'DELETE',
    headers: getHeaders(),
    body: JSON.stringify({ user_id: terraUserId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error('Terra deauthenticateUser failed', {
      status: res.status,
      terraUserId,
      body: errText,
    });
    throw new Error(`Terra deauth failed: ${res.status}`);
  }
}

/** Known Terra provider names mapped to display-friendly labels */
export const TERRA_PROVIDER_LABELS: Record<string, string> = {
  FITBIT: 'Fitbit',
  GARMIN: 'Garmin',
  OURA: 'Oura Ring',
  WITHINGS: 'Withings',
  POLAR: 'Polar',
  WHOOP: 'WHOOP',
  EIGHT: 'Eight Sleep',
  APPLE: 'Apple Health',
  SAMSUNG: 'Samsung Health',
  GOOGLE: 'Google Fit',
  FREESTYLELIBRE: 'FreeStyle Libre',
  DEXCOM: 'Dexcom',
  COROS: 'COROS',
  HUAWEI: 'Huawei Health',
  XIAOMI: 'Xiaomi',
  SUUNTO: 'Suunto',
  PELOTON: 'Peloton',
  ZWIFT: 'Zwift',
  TRAININGPEAKS: 'TrainingPeaks',
  CRONOMETER: 'Cronometer',
  MYFITNESSPAL: 'MyFitnessPal',
  NUTRACHECK: 'Nutracheck',
  UNDERARMOUR: 'Under Armour',
};

export function getProviderLabel(provider: string): string {
  return TERRA_PROVIDER_LABELS[provider.toUpperCase()] || provider;
}
