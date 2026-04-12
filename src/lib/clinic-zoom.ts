/**
 * Per-Clinic Zoom Integration
 *
 * Manages Zoom OAuth credentials and API access on a per-clinic basis.
 * Similar to clinic-lifefile.ts for Lifefile integration.
 *
 * Each clinic can connect their own Zoom account for telehealth.
 * Falls back to platform-level credentials if clinic doesn't have their own.
 */

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { decrypt, encrypt } from '@/lib/security/encryption';
import { zoomConfig, isZoomConfigured } from './integrations/zoom/config';
import { circuitBreakers } from '@/lib/resilience/circuitBreaker';

const ZOOM_API_TIMEOUT_MS = 15_000;

// ============================================================================
// Types
// ============================================================================

export interface ClinicZoomCredentials {
  accountId: string;
  accountEmail?: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  sdkKey?: string;
  sdkSecret?: string;
  webhookSecret?: string;
  // Settings
  waitingRoomEnabled: boolean;
  recordingEnabled: boolean;
  hipaaCompliant: boolean;
}

export interface ZoomOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: string;
  scope: string;
}

// ============================================================================
// Credential Management
// ============================================================================

/**
 * Get Zoom credentials for a specific clinic
 * Falls back to environment variables if clinic doesn't have credentials configured
 */
export async function getClinicZoomCredentials(
  clinicId: number
): Promise<ClinicZoomCredentials | null> {
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        zoomEnabled: true,
        zoomOnboardingComplete: true,
        zoomAccountId: true,
        zoomAccountEmail: true,
        zoomClientId: true,
        zoomClientSecret: true,
        zoomAccessToken: true,
        zoomRefreshToken: true,
        zoomTokenExpiresAt: true,
        zoomSdkKey: true,
        zoomSdkSecret: true,
        zoomWebhookSecret: true,
        zoomWaitingRoomEnabled: true,
        zoomRecordingEnabled: true,
        zoomHipaaCompliant: true,
      },
    });

    if (!clinic) {
      logger.warn(`Clinic not found: ${clinicId}`);
      return null;
    }

    // Check if Zoom is enabled and configured for this clinic
    if (
      clinic.zoomEnabled &&
      clinic.zoomOnboardingComplete &&
      clinic.zoomAccountId &&
      clinic.zoomClientId &&
      clinic.zoomClientSecret
    ) {
      // Decrypt sensitive credentials
      const clientId = decryptField(clinic.zoomClientId, 'clientId', clinicId);
      const clientSecret = decryptField(clinic.zoomClientSecret, 'clientSecret', clinicId);
      const accessToken = clinic.zoomAccessToken
        ? decryptField(clinic.zoomAccessToken, 'accessToken', clinicId)
        : undefined;
      const refreshToken = clinic.zoomRefreshToken
        ? decryptField(clinic.zoomRefreshToken, 'refreshToken', clinicId)
        : undefined;
      const sdkKey = clinic.zoomSdkKey
        ? decryptField(clinic.zoomSdkKey, 'sdkKey', clinicId)
        : undefined;
      const sdkSecret = clinic.zoomSdkSecret
        ? decryptField(clinic.zoomSdkSecret, 'sdkSecret', clinicId)
        : undefined;

      if (!clientId || !clientSecret) {
        logger.error(`Failed to decrypt Zoom credentials for clinic ${clinicId}`);
        return null;
      }

      return {
        accountId: clinic.zoomAccountId,
        accountEmail: clinic.zoomAccountEmail || undefined,
        clientId,
        clientSecret,
        accessToken,
        refreshToken,
        tokenExpiresAt: clinic.zoomTokenExpiresAt || undefined,
        sdkKey,
        sdkSecret,
        webhookSecret: clinic.zoomWebhookSecret || undefined,
        waitingRoomEnabled: clinic.zoomWaitingRoomEnabled,
        recordingEnabled: clinic.zoomRecordingEnabled,
        hipaaCompliant: clinic.zoomHipaaCompliant,
      };
    }

    // Fall back to platform-level environment variables
    if (isZoomConfigured()) {
      logger.info(`Clinic ${clinicId} using platform Zoom credentials`);
      return {
        accountId: zoomConfig.accountId,
        clientId: zoomConfig.clientId,
        clientSecret: zoomConfig.clientSecret,
        sdkKey: zoomConfig.sdkKey,
        sdkSecret: zoomConfig.sdkSecret,
        webhookSecret: zoomConfig.webhookSecret,
        waitingRoomEnabled: true,
        recordingEnabled: true,
        hipaaCompliant: true,
      };
    }

    logger.warn(`No Zoom credentials available for clinic ${clinicId}`);
    return null;
  } catch (error) {
    logger.error(`Error fetching Zoom credentials for clinic ${clinicId}:`, error);
    return null;
  }
}

/**
 * Helper to decrypt a field with error handling
 */
function decryptField(value: string, fieldName: string, clinicId: number): string | undefined {
  try {
    // Check if value appears to be encrypted (contains colon separator)
    if (value.includes(':')) {
      const decrypted = decrypt(value);
      if (decrypted) {
        return decrypted;
      }
      logger.error(`[CLINIC-ZOOM] ${fieldName} decryption returned null for clinic ${clinicId}`);
      return undefined;
    }
    // Value might not be encrypted (plain text)
    return value;
  } catch (e) {
    logger.error(`[CLINIC-ZOOM] Failed to decrypt ${fieldName} for clinic ${clinicId}:`, {
      error: e instanceof Error ? e.message : String(e),
    });
    return undefined;
  }
}

/**
 * Check if a clinic has Zoom properly configured
 */
export async function isClinicZoomConfigured(clinicId: number): Promise<boolean> {
  const credentials = await getClinicZoomCredentials(clinicId);
  return credentials !== null;
}

/**
 * Check if clinic is using their own Zoom account (not platform default)
 */
// ============================================================================
// OAuth Flow
// ============================================================================

/**
 * Refresh access token using refresh token
 */
export async function refreshZoomToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<ZoomOAuthTokens | null> {
  try {
    return await circuitBreakers.zoom.execute(async () => {
      const tokenUrl = 'https://zoom.us/oauth/token';
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
        signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Zoom token refresh failed', { status: response.status, error });
        throw new Error(`Zoom token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        tokenType: data.token_type,
        scope: data.scope,
      };
    });
  } catch (error) {
    logger.error('Zoom token refresh error:', error);
    return null;
  }
}

/**
 * Get valid access token for clinic (refreshes if needed)
 */
export async function getClinicZoomAccessToken(clinicId: number): Promise<string | null> {
  const credentials = await getClinicZoomCredentials(clinicId);

  if (!credentials) {
    return null;
  }

  // Check if token is still valid (with 5 minute buffer)
  if (
    credentials.accessToken &&
    credentials.tokenExpiresAt &&
    new Date(credentials.tokenExpiresAt) > new Date(Date.now() + 5 * 60 * 1000)
  ) {
    return credentials.accessToken;
  }

  // Need to refresh
  if (!credentials.refreshToken) {
    logger.error(`No refresh token for clinic ${clinicId}, re-authentication required`);
    return null;
  }

  logger.info(`Refreshing Zoom token for clinic ${clinicId}`);
  const tokens = await refreshZoomToken(
    credentials.refreshToken,
    credentials.clientId,
    credentials.clientSecret
  );

  if (!tokens) {
    logger.error(`Failed to refresh Zoom token for clinic ${clinicId}`);
    return null;
  }

  // Save new tokens
  await saveClinicZoomTokens(clinicId, tokens);

  return tokens.accessToken;
}

// ============================================================================
// Credential Storage
// ============================================================================

/**
 * Save OAuth tokens for a clinic
 */
export async function saveClinicZoomTokens(
  clinicId: number,
  tokens: ZoomOAuthTokens
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expiresIn * 1000);

  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      zoomAccessToken: encrypt(tokens.accessToken),
      zoomRefreshToken: encrypt(tokens.refreshToken),
      zoomTokenExpiresAt: expiresAt,
    },
  });

  logger.info(`Saved Zoom tokens for clinic ${clinicId}, expires at ${expiresAt.toISOString()}`);
}

/**
 * Save Zoom credentials for a clinic (during initial setup)
 */
export async function saveClinicZoomCredentials(
  clinicId: number,
  credentials: {
    accountId: string;
    accountEmail?: string;
    clientId: string;
    clientSecret: string;
    sdkKey?: string;
    sdkSecret?: string;
    webhookSecret?: string;
  }
): Promise<void> {
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      zoomAccountId: credentials.accountId,
      zoomAccountEmail: credentials.accountEmail,
      zoomClientId: encrypt(credentials.clientId),
      zoomClientSecret: encrypt(credentials.clientSecret),
      zoomSdkKey: credentials.sdkKey ? encrypt(credentials.sdkKey) : null,
      zoomSdkSecret: credentials.sdkSecret ? encrypt(credentials.sdkSecret) : null,
      zoomWebhookSecret: credentials.webhookSecret,
      zoomEnabled: true,
      zoomOnboardingComplete: true,
      zoomConnectedAt: new Date(),
    },
  });

  logger.info(`Saved Zoom credentials for clinic ${clinicId}`);
}

/**
 * Disconnect Zoom from a clinic
 */
export async function disconnectClinicZoom(clinicId: number): Promise<void> {
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      zoomEnabled: false,
      zoomOnboardingComplete: false,
      zoomAccountId: null,
      zoomAccountEmail: null,
      zoomClientId: null,
      zoomClientSecret: null,
      zoomAccessToken: null,
      zoomRefreshToken: null,
      zoomTokenExpiresAt: null,
      zoomSdkKey: null,
      zoomSdkSecret: null,
      zoomWebhookSecret: null,
      zoomConnectedAt: null,
    },
  });

  logger.info(`Disconnected Zoom for clinic ${clinicId}`);
}

/**
 * Update Zoom settings for a clinic
 */
export async function updateClinicZoomSettings(
  clinicId: number,
  settings: {
    waitingRoomEnabled?: boolean;
    recordingEnabled?: boolean;
    hipaaCompliant?: boolean;
  }
): Promise<void> {
  await prisma.clinic.update({
    where: { id: clinicId },
    data: {
      zoomWaitingRoomEnabled: settings.waitingRoomEnabled,
      zoomRecordingEnabled: settings.recordingEnabled,
      zoomHipaaCompliant: settings.hipaaCompliant,
    },
  });

  logger.info(`Updated Zoom settings for clinic ${clinicId}`, settings);
}

// ============================================================================
// Zoom API Helpers
// ============================================================================

/**
 * Create a Zoom meeting using clinic's credentials
 */
export async function createClinicZoomMeeting(
  clinicId: number,
  options: {
    topic: string;
    duration: number;
    startTime?: Date;
    agenda?: string;
  }
): Promise<any | null> {
  const accessToken = await getClinicZoomAccessToken(clinicId);
  const credentials = await getClinicZoomCredentials(clinicId);

  if (!accessToken || !credentials) {
    logger.error(`Cannot create meeting: no Zoom access for clinic ${clinicId}`);
    return null;
  }

  let clinicTimezone = 'America/New_York';
  try {
    const clinicRecord = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: { timezone: true },
    });
    if (clinicRecord?.timezone) {
      clinicTimezone = clinicRecord.timezone;
    }
  } catch {
    // Fall back to default
  }

  try {
    return await circuitBreakers.zoom.execute(async () => {
      const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
        body: JSON.stringify({
          topic: options.topic,
          type: options.startTime ? 2 : 1,
          start_time: options.startTime?.toISOString(),
          duration: options.duration,
          timezone: clinicTimezone,
          agenda: options.agenda,
          settings: {
            host_video: true,
            participant_video: true,
            join_before_host: true,
            mute_upon_entry: true,
            waiting_room: true,
            auto_recording: credentials.recordingEnabled ? 'cloud' : 'none',
            encryption_type: 'enhanced_encryption',
            watermark: true,
            audio: 'both',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error('Failed to create Zoom meeting', { status: response.status, error });
        throw new Error(`Zoom create meeting failed: ${response.status}`);
      }

      return response.json();
    });
  } catch (error) {
    logger.error('Error creating Zoom meeting:', error);
    return null;
  }
}

/**
 * Cancel a Zoom meeting
 */
export async function cancelClinicZoomMeeting(
  clinicId: number,
  meetingId: string
): Promise<boolean> {
  const accessToken = await getClinicZoomAccessToken(clinicId);

  if (!accessToken) {
    logger.error(`Cannot cancel meeting: no Zoom access for clinic ${clinicId}`);
    return false;
  }

  try {
    return await circuitBreakers.zoom.execute(async () => {
      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(ZOOM_API_TIMEOUT_MS),
      });

      if (!response.ok && response.status !== 204) {
        throw new Error(`Zoom cancel meeting failed: ${response.status}`);
      }

      return true;
    });
  } catch (error) {
    logger.error('Error canceling Zoom meeting:', error);
    return false;
  }
}

/**
 * Get Zoom integration status for display
 */
export async function getClinicZoomStatus(clinicId: number): Promise<{
  configured: boolean;
  enabled: boolean;
  accountEmail?: string;
  connectedAt?: Date;
  isOwnAccount: boolean;
  settings: {
    waitingRoomEnabled: boolean;
    recordingEnabled: boolean;
    hipaaCompliant: boolean;
  };
}> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: {
      zoomEnabled: true,
      zoomOnboardingComplete: true,
      zoomAccountEmail: true,
      zoomConnectedAt: true,
      zoomWaitingRoomEnabled: true,
      zoomRecordingEnabled: true,
      zoomHipaaCompliant: true,
    },
  });

  const isOwnAccount = !!(clinic?.zoomEnabled && clinic?.zoomOnboardingComplete);
  const configured = isOwnAccount || isZoomConfigured();

  return {
    configured,
    enabled: clinic?.zoomEnabled || isZoomConfigured(),
    accountEmail: clinic?.zoomAccountEmail || undefined,
    connectedAt: clinic?.zoomConnectedAt || undefined,
    isOwnAccount,
    settings: {
      waitingRoomEnabled: clinic?.zoomWaitingRoomEnabled ?? true,
      recordingEnabled: clinic?.zoomRecordingEnabled ?? true,
      hipaaCompliant: clinic?.zoomHipaaCompliant ?? true,
    },
  };
}
