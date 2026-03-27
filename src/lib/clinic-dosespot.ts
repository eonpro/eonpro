/**
 * Clinic-Specific DoseSpot Client Factory
 * ========================================
 *
 * Resolves DoseSpot credentials for a specific clinic (multi-tenant),
 * falling back to environment variables if per-clinic config is absent.
 *
 * Pattern mirrors src/lib/clinic-lifefile.ts.
 *
 * @module lib/clinic-dosespot
 */

import { prisma } from '@/lib/db';
import {
  createDoseSpotClient,
  getEnvCredentials,
  type DoseSpotCredentials,
  type DoseSpotClient,
} from '@/lib/dosespot';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/security/encryption';
import { getClinicFeatureBoolean } from '@/lib/clinic/utils';

const credentialsCache = new Map<number, { data: DoseSpotCredentials | null; expiresAt: number }>();
const CREDENTIALS_CACHE_TTL_MS = 30_000;

/**
 * Get DoseSpot credentials for a specific clinic.
 * Cached for 30s to avoid redundant DB lookups within the same SSO flow.
 * Returns null if DoseSpot is not enabled/configured for the clinic
 * AND no environment fallback is available.
 */
export async function getClinicDoseSpotCredentials(
  clinicId: number
): Promise<DoseSpotCredentials | null> {
  const cached = credentialsCache.get(clinicId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        features: true,
        doseSpotEnabled: true,
        doseSpotBaseUrl: true,
        doseSpotTokenUrl: true,
        doseSpotSsoUrl: true,
        doseSpotClinicId: true,
        doseSpotClinicKey: true,
        doseSpotAdminId: true,
        doseSpotSubscriptionKey: true,
      },
    });

    if (!clinic) {
      logger.warn(`[CLINIC-DOSESPOT] Clinic not found: ${clinicId}`);
      return null;
    }

    const featureEnabled = getClinicFeatureBoolean(clinic.features, 'DOSESPOT', false);
    if (!featureEnabled && !clinic.doseSpotEnabled) {
      return null;
    }

    if (
      clinic.doseSpotEnabled &&
      clinic.doseSpotBaseUrl &&
      clinic.doseSpotTokenUrl &&
      clinic.doseSpotSsoUrl &&
      clinic.doseSpotClinicId &&
      clinic.doseSpotClinicKey &&
      clinic.doseSpotAdminId &&
      clinic.doseSpotSubscriptionKey
    ) {
      let clinicKey = clinic.doseSpotClinicKey;
      try {
        if (clinicKey.includes(':')) {
          const decrypted = decrypt(clinicKey);
          if (decrypted) {
            clinicKey = decrypted;
          } else {
            logger.error(`[CLINIC-DOSESPOT] clinicKey decryption returned empty for clinic ${clinicId}`);
            return null;
          }
        }
      } catch (e) {
        logger.error(`[CLINIC-DOSESPOT] Failed to decrypt clinicKey for clinic ${clinicId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }

      let subscriptionKey = clinic.doseSpotSubscriptionKey;
      try {
        if (subscriptionKey.includes(':')) {
          const decrypted = decrypt(subscriptionKey);
          if (decrypted) {
            subscriptionKey = decrypted;
          } else {
            logger.error(`[CLINIC-DOSESPOT] subscriptionKey decryption returned empty for clinic ${clinicId}`);
            return null;
          }
        }
      } catch (e) {
        logger.error(
          `[CLINIC-DOSESPOT] Failed to decrypt subscriptionKey for clinic ${clinicId}`,
          { error: e instanceof Error ? e.message : String(e) }
        );
        return null;
      }

      const result: DoseSpotCredentials = {
        baseUrl: clinic.doseSpotBaseUrl,
        tokenUrl: clinic.doseSpotTokenUrl,
        ssoUrl: clinic.doseSpotSsoUrl,
        clinicId: clinic.doseSpotClinicId,
        clinicKey,
        adminId: clinic.doseSpotAdminId,
        subscriptionKey,
      };
      credentialsCache.set(clinicId, { data: result, expiresAt: Date.now() + CREDENTIALS_CACHE_TTL_MS });
      return result;
    }

    logger.info(
      `[CLINIC-DOSESPOT] Clinic ${clinicId} doesn't have DoseSpot configured, trying env fallback`
    );
    const envCreds = getEnvCredentials();
    credentialsCache.set(clinicId, { data: envCreds, expiresAt: Date.now() + CREDENTIALS_CACHE_TTL_MS });
    return envCreds;
  } catch (error) {
    logger.error(`[CLINIC-DOSESPOT] Error fetching credentials for clinic ${clinicId}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Get a DoseSpot client for a specific clinic.
 * Throws if no credentials are available.
 */
export async function getClinicDoseSpotClient(clinicId: number): Promise<DoseSpotClient> {
  const credentials = await getClinicDoseSpotCredentials(clinicId);

  if (!credentials) {
    throw new Error(
      `No DoseSpot credentials configured for clinic ${clinicId} or in environment`
    );
  }

  return createDoseSpotClient(credentials);
}

/**
 * Check if a clinic has DoseSpot properly configured and enabled.
 */
export async function isClinicDoseSpotConfigured(clinicId: number): Promise<boolean> {
  const credentials = await getClinicDoseSpotCredentials(clinicId);
  return credentials !== null;
}
