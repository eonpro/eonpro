/**
 * DoseSpot Prescription Service
 * ==============================
 *
 * Retrieves prescriptions, allergies, self-reported medications,
 * and diagnoses from DoseSpot for a patient.
 *
 * All data comes from DoseSpot API — the platform does not create
 * prescriptions programmatically (they are written via SSO UI).
 *
 * @module domains/dosespot/services
 */

import { logger } from '@/lib/logger';
import { auditLog, AuditEventType } from '@/lib/audit/hipaa-audit';
import { getClinicDoseSpotClient } from '@/lib/clinic-dosespot';
import { prisma } from '@/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/domains/shared/errors/AppError';
import type {
  DoseSpotAllergy,
  DoseSpotPrescription,
  DoseSpotSelfReportedMedication,
  DoseSpotDiagnosisItem,
  DoseSpotPageResult,
  PagedResult,
} from '@/lib/dosespot';

export interface DoseSpotPrescriptionService {
  getPatientAllergies(
    patientId: number,
    clinicId: number,
    userId: number,
    page?: number,
    size?: number
  ): Promise<PagedResult<DoseSpotAllergy>>;

  getPatientPrescriptions(
    patientId: number,
    clinicId: number,
    userId: number,
    page?: number,
    size?: number
  ): Promise<PagedResult<DoseSpotPrescription>>;

  getSelfReportedMedications(
    patientId: number,
    clinicId: number,
    userId: number,
    page?: number,
    size?: number
  ): Promise<PagedResult<DoseSpotSelfReportedMedication>>;

  searchDiagnosis(
    searchTerm: string,
    clinicId: number,
    userId: number,
    pageNumber?: number
  ): Promise<{ items: DoseSpotDiagnosisItem[]; pageResult: DoseSpotPageResult | null }>;
}

async function getDoseSpotPatientId(patientId: number, clinicId: number): Promise<string> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { doseSpotPatientId: true, clinicId: true },
  });

  if (!patient) throw new NotFoundError('Patient', patientId);
  if (patient.clinicId !== clinicId)
    throw new ForbiddenError('Cross-clinic patient access is not allowed');
  if (!patient.doseSpotPatientId) {
    throw new BadRequestError(
      'This patient has not been synced to DoseSpot yet. Open the prescriber to sync automatically.'
    );
  }

  return String(patient.doseSpotPatientId);
}

export function createDoseSpotPrescriptionService(): DoseSpotPrescriptionService {
  return {
    async getPatientAllergies(patientId, clinicId, userId, page = 0, size = 10) {
      const dsPatientId = await getDoseSpotPatientId(patientId, clinicId);
      const client = await getClinicDoseSpotClient(clinicId);
      const result = await client.getPatientAllergies(dsPatientId, page, size);

      auditLog(null, {
        eventType: AuditEventType.PHI_VIEW,
        userId,
        resourceType: 'Patient',
        resourceId: String(patientId),
        clinicId,
        action: 'DOSESPOT_VIEW_ALLERGIES',
        outcome: 'SUCCESS',
        metadata: { externalSystem: 'DoseSpot', dataType: 'allergies' },
      }).catch((err) => {
        logger.error('[DOSESPOT] Audit log failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return result;
    },

    async getPatientPrescriptions(patientId, clinicId, userId, page = 0, size = 10) {
      const dsPatientId = await getDoseSpotPatientId(patientId, clinicId);
      const client = await getClinicDoseSpotClient(clinicId);
      const result = await client.getPatientPrescriptions(dsPatientId, page, size);

      auditLog(null, {
        eventType: AuditEventType.PHI_VIEW,
        userId,
        resourceType: 'Patient',
        resourceId: String(patientId),
        clinicId,
        action: 'DOSESPOT_VIEW_PRESCRIPTIONS',
        outcome: 'SUCCESS',
        metadata: { externalSystem: 'DoseSpot', dataType: 'prescriptions' },
      }).catch((err) => {
        logger.error('[DOSESPOT] Audit log failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return result;
    },

    async getSelfReportedMedications(patientId, clinicId, userId, page = 0, size = 10) {
      const dsPatientId = await getDoseSpotPatientId(patientId, clinicId);
      const client = await getClinicDoseSpotClient(clinicId);
      const result = await client.getSelfReportedMedications(dsPatientId, page, size);

      auditLog(null, {
        eventType: AuditEventType.PHI_VIEW,
        userId,
        resourceType: 'Patient',
        resourceId: String(patientId),
        clinicId,
        action: 'DOSESPOT_VIEW_SELF_REPORTED_MEDS',
        outcome: 'SUCCESS',
        metadata: { externalSystem: 'DoseSpot', dataType: 'selfReportedMedications' },
      }).catch((err) => {
        logger.error('[DOSESPOT] Audit log failed (non-blocking)', {
          error: err instanceof Error ? err.message : String(err),
        });
      });

      return result;
    },

    async searchDiagnosis(searchTerm, clinicId, userId, pageNumber = 1) {
      const client = await getClinicDoseSpotClient(clinicId);
      return client.searchDiagnosis(searchTerm, pageNumber);
    },
  };
}

export const doseSpotPrescriptionService = createDoseSpotPrescriptionService();
