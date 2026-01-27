import { prisma } from '@/lib/db';
import { createLifefileClient, getEnvCredentials, LifefileCredentials } from '@/lib/lifefile';
import { logger } from '@/lib/logger';
import { decrypt } from '@/lib/security/encryption';

/**
 * Get Lifefile credentials for a specific clinic
 * Falls back to environment variables if clinic doesn't have credentials configured
 */
export async function getClinicLifefileCredentials(clinicId: number): Promise<LifefileCredentials | null> {
  try {
    // Fetch clinic with Lifefile credentials
    const clinic = await prisma.clinic.findUnique({
      where: { id: clinicId },
      select: {
        id: true,
        name: true,
        lifefileEnabled: true,
        lifefileBaseUrl: true,
        lifefileUsername: true,
        lifefilePassword: true,
        lifefileVendorId: true,
        lifefilePracticeId: true,
        lifefileLocationId: true,
        lifefileNetworkId: true,
        lifefilePracticeName: true,
        lifefilePracticeAddress: true,
        lifefilePracticePhone: true,
        lifefilePracticeFax: true,
      },
    });

    if (!clinic) {
      logger.warn(`Clinic not found: ${clinicId}`);
      return null;
    }

    // Check if Lifefile is enabled and configured for this clinic
    if (
      clinic.lifefileEnabled &&
      clinic.lifefileBaseUrl &&
      clinic.lifefileUsername &&
      clinic.lifefilePassword &&
      clinic.lifefileVendorId &&
      clinic.lifefilePracticeId &&
      clinic.lifefileLocationId &&
      clinic.lifefileNetworkId
    ) {
      // Decrypt sensitive credentials
      let username = clinic.lifefileUsername;
      let password = clinic.lifefilePassword;

      // Try to decrypt if they appear to be encrypted
      try {
        if (clinic.lifefileUsername && clinic.lifefileUsername.includes(':')) {
          const decryptedUsername = decrypt(clinic.lifefileUsername);
          if (decryptedUsername) {
            username = decryptedUsername;
            logger.debug(`[CLINIC-LIFEFILE] Decrypted username for clinic ${clinicId}`);
          } else {
            logger.error(`[CLINIC-LIFEFILE] Username decryption returned null for clinic ${clinicId}`);
          }
        }
      } catch (e) {
        logger.error(`[CLINIC-LIFEFILE] Failed to decrypt username for clinic ${clinicId}:`, {
          error: e instanceof Error ? e.message : String(e),
          usernameLength: clinic.lifefileUsername?.length,
          hint: 'Check if ENCRYPTION_KEY env var matches the key used when saving credentials'
        });
      }

      try {
        if (clinic.lifefilePassword && clinic.lifefilePassword.includes(':')) {
          const decryptedPassword = decrypt(clinic.lifefilePassword);
          if (decryptedPassword) {
            password = decryptedPassword;
            logger.debug(`[CLINIC-LIFEFILE] Decrypted password for clinic ${clinicId}`);
          } else {
            logger.error(`[CLINIC-LIFEFILE] Password decryption returned null for clinic ${clinicId}`);
          }
        }
      } catch (e) {
        logger.error(`[CLINIC-LIFEFILE] Failed to decrypt password for clinic ${clinicId}:`, {
          error: e instanceof Error ? e.message : String(e),
          hint: 'Check if ENCRYPTION_KEY env var matches the key used when saving credentials'
        });
      }

      return {
        baseUrl: clinic.lifefileBaseUrl,
        username,
        password,
        vendorId: clinic.lifefileVendorId,
        practiceId: clinic.lifefilePracticeId,
        locationId: clinic.lifefileLocationId,
        networkId: clinic.lifefileNetworkId,
        practiceName: clinic.lifefilePracticeName || undefined,
        practiceAddress: clinic.lifefilePracticeAddress || undefined,
        practicePhone: clinic.lifefilePracticePhone || undefined,
        practiceFax: clinic.lifefilePracticeFax || undefined,
      };
    }

    // Fall back to environment variables
    logger.info(`Clinic ${clinicId} doesn't have Lifefile configured, using environment variables`);
    return getEnvCredentials();
  } catch (error) {
    logger.error(`Error fetching Lifefile credentials for clinic ${clinicId}:`, error);
    return null;
  }
}

/**
 * Get a Lifefile client for a specific clinic
 */
export async function getClinicLifefileClient(clinicId: number) {
  const credentials = await getClinicLifefileCredentials(clinicId);

  if (!credentials) {
    throw new Error(`No Lifefile credentials configured for clinic ${clinicId} or in environment`);
  }

  return createLifefileClient(credentials);
}

/**
 * Check if a clinic has Lifefile properly configured
 */
export async function isClinicLifefileConfigured(clinicId: number): Promise<boolean> {
  const credentials = await getClinicLifefileCredentials(clinicId);
  return credentials !== null;
}

