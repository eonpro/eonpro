/**
 * DoseSpot SSO Service
 * =====================
 *
 * Generates signed SSO URLs for embedding the DoseSpot prescribing UI.
 * Requires both provider and patient to be synced to DoseSpot first.
 *
 * @module domains/dosespot/services
 */

import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getClinicDoseSpotCredentials } from '@/lib/clinic-dosespot';
import { generateSSOUrlForPatient, generateSSOUrlForPrescriber } from '@/lib/dosespot';
import type { SSOUrlResult } from '../types';
import { doseSpotPatientService } from './dosespot-patient.service';
import { doseSpotProviderService } from './dosespot-provider.service';

export interface DoseSpotSSOService {
  getPatientSSOUrl(
    patientId: number,
    providerId: number,
    clinicId: number,
    userId: number
  ): Promise<SSOUrlResult>;

  getPrescriberSSOUrl(
    providerId: number,
    clinicId: number,
    userId: number
  ): Promise<SSOUrlResult>;
}

export function createDoseSpotSSOService(): DoseSpotSSOService {
  return {
    async getPatientSSOUrl(
      patientId: number,
      providerId: number,
      clinicId: number,
      userId: number
    ): Promise<SSOUrlResult> {
      logger.info('[DOSESPOT] SSO patient flow starting', { patientId, providerId, clinicId, userId });

      const credentials = await getClinicDoseSpotCredentials(clinicId);
      if (!credentials) {
        throw new Error(`DoseSpot not configured for clinic ${clinicId}`);
      }
      logger.info('[DOSESPOT] Credentials resolved', { clinicId, hasBaseUrl: !!credentials.baseUrl });

      let providerSync;
      try {
        providerSync = await doseSpotProviderService.syncProvider(providerId, clinicId, userId);
      } catch (err) {
        logger.error('[DOSESPOT] Provider sync failed', {
          providerId, clinicId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      logger.info('[DOSESPOT] Provider synced', {
        providerId, doseSpotClinicianId: providerSync.doseSpotClinicianId, action: providerSync.action,
      });

      let patientSync;
      try {
        patientSync = await doseSpotPatientService.syncPatient(patientId, clinicId, userId);
      } catch (err) {
        logger.error('[DOSESPOT] Patient sync failed', {
          patientId, clinicId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      logger.info('[DOSESPOT] Patient synced', {
        patientId, doseSpotPatientId: patientSync.doseSpotPatientId, action: patientSync.action,
      });

      const prescriberUserId = String(providerSync.doseSpotClinicianId);
      const patientUserId = String(patientSync.doseSpotPatientId);

      const url = generateSSOUrlForPatient(credentials, prescriberUserId, patientUserId);

      auditLog(null, {
        eventType: AuditEventType.SYSTEM_ACCESS,
        userId,
        resourceType: 'Patient',
        resourceId: String(patientId),
        clinicId,
        action: 'DOSESPOT_SSO_PATIENT_ACCESS',
        outcome: 'SUCCESS',
        metadata: {
          providerId,
          doseSpotClinicianId: providerSync.doseSpotClinicianId,
          doseSpotPatientId: patientSync.doseSpotPatientId,
        },
      }).catch((err) => {
        logger.error('[DOSESPOT] Audit log failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info('[DOSESPOT] SSO URL generated for patient', {
        patientId,
        providerId,
        clinicId,
      });

      return { url, prescriberUserId, patientUserId };
    },

    async getPrescriberSSOUrl(
      providerId: number,
      clinicId: number,
      userId: number
    ): Promise<SSOUrlResult> {
      logger.info('[DOSESPOT] SSO prescriber flow starting', { providerId, clinicId, userId });

      const credentials = await getClinicDoseSpotCredentials(clinicId);
      if (!credentials) {
        throw new Error(`DoseSpot not configured for clinic ${clinicId}`);
      }
      logger.info('[DOSESPOT] Credentials resolved', { clinicId, hasBaseUrl: !!credentials.baseUrl });

      let providerSync;
      try {
        providerSync = await doseSpotProviderService.syncProvider(providerId, clinicId, userId);
      } catch (err) {
        logger.error('[DOSESPOT] Provider sync failed', {
          providerId, clinicId,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      logger.info('[DOSESPOT] Provider synced', {
        providerId, doseSpotClinicianId: providerSync.doseSpotClinicianId, action: providerSync.action,
      });

      const prescriberUserId = String(providerSync.doseSpotClinicianId);
      const url = generateSSOUrlForPrescriber(credentials, prescriberUserId);

      auditLog(null, {
        eventType: AuditEventType.SYSTEM_ACCESS,
        userId,
        resourceType: 'Provider',
        resourceId: String(providerId),
        clinicId,
        action: 'DOSESPOT_SSO_PRESCRIBER_ACCESS',
        outcome: 'SUCCESS',
        metadata: {
          doseSpotClinicianId: providerSync.doseSpotClinicianId,
        },
      }).catch((err) => {
        logger.error('[DOSESPOT] Audit log failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      logger.info('[DOSESPOT] SSO URL generated for prescriber', {
        providerId,
        clinicId,
      });

      return { url, prescriberUserId };
    },
  };
}

export const doseSpotSSOService = createDoseSpotSSOService();
