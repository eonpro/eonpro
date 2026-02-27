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

/**
 * Get DoseSpot credentials for a specific clinic.
 * Returns null if DoseSpot is not enabled/configured for the clinic
 * AND no environment fallback is available.
 */
export async function getClinicDoseSpotCredentials(
  clinicId: number
): Promise<DoseSpotCredentials | null> {
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
          if (decrypted) clinicKey = decrypted;
        }
      } catch (e) {
        logger.error(`[CLINIC-DOSESPOT] Failed to decrypt clinicKey for clinic ${clinicId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }

      let subscriptionKey = clinic.doseSpotSubscriptionKey;
      try {
        if (subscriptionKey.includes(':')) {
          const decrypted = decrypt(subscriptionKey);
          if (decrypted) subscriptionKey = decrypted;
        }
      } catch (e) {
        logger.error(
          `[CLINIC-DOSESPOT] Failed to decrypt subscriptionKey for clinic ${clinicId}`,
          { error: e instanceof Error ? e.message : String(e) }
        );
      }

      return {
        baseUrl: clinic.doseSpotBaseUrl,
        tokenUrl: clinic.doseSpotTokenUrl,
        ssoUrl: clinic.doseSpotSsoUrl,
        clinicId: clinic.doseSpotClinicId,
        clinicKey,
        adminId: clinic.doseSpotAdminId,
        subscriptionKey,
      };
    }

    logger.info(
      `[CLINIC-DOSESPOT] Clinic ${clinicId} doesn't have DoseSpot configured, trying env fallback`
    );
    return getEnvCredentials();
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
